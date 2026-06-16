import type {
  Actor,
  ClientMessage,
  ControlMode,
  EncryptedPlayback,
  EncryptedRoomSnapshot,
  Participant,
  Playback,
  RoomSnapshot,
  ServerMessage,
} from "@fossync/sync-core";

interface Attachment {
  id: string;
  name: string;
  nameBlob: string; // encrypted display name (encrypted sessions); "" otherwise
  role: "host" | "guest";
  helloed: boolean; // true once the socket has identified itself via `hello`
}

interface PersistedRoom {
  encrypted: boolean;
  playback: Playback;
  encPlayback: EncryptedPlayback;
  controlMode: ControlMode;
  hostId: string | null;
  content: string;
  contentBlob: string | null;
}

interface RoomEnv {
  REGISTRY: DurableObjectNamespace;
}

const MAX_NAME_LEN = 64;
const MAX_CHAT_LEN = 500;
const MAX_EMOJI_LEN = 16; // an emoji can be several code units (skin tone, ZWJ sequences)
// Encrypted payloads are opaque base64url blobs the relay never reads; a single
// generous cap covers names, chat, reactions, control and content URLs once sealed.
const MAX_BLOB_LEN = 8192;
const CONTROL_ACTIONS = new Set(["play", "pause", "seek"]);

export class RoomDurableObject {
  // An "encrypted session" relays opaque ciphertext blobs for every content-bearing
  // field; the relay only ever holds blobs + the shared clock, never plaintext. A
  // room is all-or-nothing: the first `hello`'s `enc` flag decides, and later sockets
  // that disagree are refused. See docs/superpowers/specs/2026-06-16-encrypted-sessions-design.md.
  private encrypted = false;
  private playback: Playback; // plaintext sessions
  private encPlayback: EncryptedPlayback; // encrypted sessions
  private controlMode: ControlMode = "everyone";
  private hostId: string | null = null;
  private content = ""; // current media URL the room is watching ("" if unset)
  private contentBlob: string | null = null; // encrypted content URL (encrypted sessions)
  private code: string | null = null; // room code, captured from the request path

  constructor(private readonly ctx: DurableObjectState, private readonly env: RoomEnv) {
    this.playback = { paused: true, anchorMediaTime: 0, anchorServerTime: Date.now(), rate: 1 };
    this.encPlayback = { blob: null, anchorServerTime: Date.now() };
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<PersistedRoom>("room");
      if (saved) {
        this.encrypted = saved.encrypted ?? false;
        this.playback = saved.playback;
        this.encPlayback = saved.encPlayback ?? { blob: null, anchorServerTime: Date.now() };
        this.controlMode = saved.controlMode;
        this.hostId = saved.hostId;
        this.content = saved.content ?? "";
        this.contentBlob = saved.contentBlob ?? null;
      }
    });
  }

  private async persist(): Promise<void> {
    const room: PersistedRoom = {
      encrypted: this.encrypted,
      playback: this.playback,
      encPlayback: this.encPlayback,
      controlMode: this.controlMode,
      hostId: this.hostId,
      content: this.content,
      contentBlob: this.contentBlob,
    };
    await this.ctx.storage.put("room", room);
  }

  // Tell the singleton registry this room is active / gone. Best-effort: the
  // session cap must never block or break an actual room.
  private async touch(action: "acquire" | "release"): Promise<void> {
    if (!this.code) return;
    try {
      const reg = this.env.REGISTRY.get(this.env.REGISTRY.idFromName("global"));
      await reg.fetch(`https://registry/${action}`, {
        method: "POST",
        body: JSON.stringify({ room: this.code }),
      });
    } catch {
      /* ignore registry failures */
    }
  }

  async fetch(req: Request): Promise<Response> {
    const m = new URL(req.url).pathname.match(/\/room\/([A-Za-z0-9]+)/);
    if (m) this.code = m[1]!.toUpperCase();
    if ((req.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { id: crypto.randomUUID(), name: "", nameBlob: "", role: "guest", helloed: false };
    server.serializeAttachment(attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Sockets that have completed `hello`, i.e. real participants. */
  private helloedSockets(exclude?: WebSocket): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((ws) => ws !== exclude && (ws.deserializeAttachment() as Attachment).helloed);
  }

  private participants(exclude?: WebSocket): Participant[] {
    return this.helloedSockets(exclude).map((ws) => {
      const a = ws.deserializeAttachment() as Attachment;
      return this.encrypted
        ? { id: a.id, role: a.role, nameBlob: a.nameBlob }
        : { id: a.id, role: a.role, name: a.name };
    });
  }

  private snapshot(): RoomSnapshot {
    return {
      controlMode: this.controlMode,
      hostId: this.hostId ?? "",
      playback: this.playback,
      participants: this.participants(),
      content: this.content,
    };
  }

  private encSnapshot(): EncryptedRoomSnapshot {
    return {
      controlMode: this.controlMode,
      hostId: this.hostId ?? "",
      participants: this.participants(),
      encPlayback: this.encPlayback,
      contentBlob: this.contentBlob,
    };
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) ws.send(s);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
  }

  /** A `state`/`encState` message reflecting the session's encryption mode. */
  private buildState(actor?: Actor): ServerMessage {
    return this.encrypted
      ? {
          type: "encState",
          encPlayback: this.encPlayback,
          controlMode: this.controlMode,
          hostId: this.hostId ?? "",
          ...(actor ? { actor } : {}),
        }
      : {
          type: "state",
          playback: this.playback,
          controlMode: this.controlMode,
          hostId: this.hostId ?? "",
          ...(actor ? { actor } : {}),
        };
  }

  /** The actor descriptor to attach to a broadcast — name omitted in encrypted sessions. */
  private actorFor(att: Attachment): Actor {
    return this.encrypted ? { id: att.id } : { id: att.id, name: att.name };
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(typeof raw === "string" ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    // The wire protocol is TypeScript-only (erased at runtime), so validate the shape
    // of every field we trust before acting — a JSON-valid but malformed message must
    // never poison the shared room state.
    if (typeof parsed !== "object" || parsed === null || typeof (parsed as { type?: unknown }).type !== "string") {
      return;
    }
    const msg = parsed as ClientMessage;
    const att = ws.deserializeAttachment() as Attachment;

    // Gate every message except `hello` until the socket has identified itself.
    if (!att.helloed && msg.type !== "hello") return;

    switch (msg.type) {
      case "hello": {
        const wantsEnc = msg.enc === true;
        if (this.hostId === null) {
          // First participant establishes the room: host + its encryption mode.
          this.encrypted = wantsEnc;
        } else if (wantsEnc !== this.encrypted) {
          // Strict all-or-nothing: a socket whose mode disagrees with the room is
          // refused so plaintext can never leak into an encrypted session (and vice
          // versa). The relay needs only this one boolean — never any content.
          this.send(ws, {
            type: "error",
            reason: wantsEnc
              ? "this session is not encrypted"
              : "encrypted session — open the full invite link (it carries the key)",
          });
          ws.close(1008, "encryption mode mismatch");
          return;
        }
        if (this.encrypted) {
          att.nameBlob = typeof msg.c === "string" ? msg.c.slice(0, MAX_BLOB_LEN) : "";
        } else {
          att.name = typeof msg.name === "string" ? msg.name.slice(0, MAX_NAME_LEN) : "Guest";
        }
        att.helloed = true;
        if (this.hostId === null) {
          this.hostId = att.id;
          att.role = "host";
          // Fresh plaintext room: anchor at the host's current position (paused)
          // rather than 0:00. Encrypted rooms can't read mediaTime, so the host
          // bootstraps the timeline by sending a control right after the welcome.
          if (!this.encrypted && typeof msg.mediaTime === "number" && Number.isFinite(msg.mediaTime) && msg.mediaTime > 0) {
            this.playback = { paused: true, anchorMediaTime: msg.mediaTime, anchorServerTime: Date.now(), rate: 1 };
          }
          await this.persist();
        }
        ws.serializeAttachment(att);
        if (this.encrypted) {
          this.send(ws, { type: "welcomeEnc", youId: att.id, snapshot: this.encSnapshot() });
        } else {
          this.send(ws, { type: "welcome", youId: att.id, snapshot: this.snapshot() });
        }
        this.broadcast({ type: "presence", participants: this.participants() });
        await this.touch("acquire");
        break;
      }
      case "ping": {
        if (typeof msg.t0 !== "number") return;
        this.send(ws, { type: "pong", t0: msg.t0, t1: Date.now() });
        break;
      }
      case "control": {
        if (this.controlMode === "host" && att.id !== this.hostId) {
          this.send(ws, { type: "error", reason: "not authorized to control" });
          return;
        }
        const now = Date.now();
        if (this.encrypted) {
          // The relay can't read the action/position; it stamps its own clock as the
          // shared time reference and stores the opaque blob. Clients decrypt it and
          // reconstruct the timeline from {action, mediaTime} + this anchor.
          if (typeof msg.c !== "string" || !msg.c) {
            this.send(ws, { type: "error", reason: "invalid control" });
            return;
          }
          this.encPlayback = { blob: msg.c.slice(0, MAX_BLOB_LEN), anchorServerTime: now };
          await this.persist();
          this.broadcast(this.buildState(this.actorFor(att)));
          break;
        }
        if (!msg.action || !CONTROL_ACTIONS.has(msg.action) || !Number.isFinite(msg.mediaTime)) {
          this.send(ws, { type: "error", reason: "invalid control" });
          return;
        }
        const mediaTime = msg.mediaTime as number;
        if (msg.action === "pause") {
          this.playback = { ...this.playback, paused: true, anchorMediaTime: mediaTime, anchorServerTime: now };
        } else if (msg.action === "play") {
          this.playback = { ...this.playback, paused: false, anchorMediaTime: mediaTime, anchorServerTime: now };
        } else {
          this.playback = { ...this.playback, anchorMediaTime: mediaTime, anchorServerTime: now };
        }
        await this.persist();
        this.broadcast(this.buildState(this.actorFor(att)));
        break;
      }
      case "setMode": {
        if (msg.mode !== "host" && msg.mode !== "everyone") {
          this.send(ws, { type: "error", reason: "invalid mode" });
          return;
        }
        if (att.id !== this.hostId) {
          this.send(ws, { type: "error", reason: "only the host can change mode" });
          return;
        }
        this.controlMode = msg.mode;
        await this.persist();
        this.broadcast(this.buildState(this.actorFor(att)));
        break;
      }
      case "setContent": {
        if (this.controlMode === "host" && att.id !== this.hostId) {
          this.send(ws, { type: "error", reason: "not authorized to control" });
          return;
        }
        if (this.encrypted) {
          // The relay can't read or validate the URL (that moves client-side) and
          // can't dedupe ciphertext, so it just stores/forwards the blob. Switching
          // content resets the timeline; the relay clears the anchor to "unknown".
          if (typeof msg.c !== "string" || !msg.c) return;
          this.contentBlob = msg.c.slice(0, MAX_BLOB_LEN);
          this.encPlayback = { blob: null, anchorServerTime: Date.now() };
          await this.persist();
          this.broadcast({ type: "encContent", blob: this.contentBlob, from: this.actorFor(att) });
          this.broadcast(this.buildState());
          break;
        }
        let url: string;
        try {
          const u = new URL(typeof msg.url === "string" ? msg.url : "");
          if (u.protocol !== "https:") return; // only https media pages
          url = u.toString().slice(0, 2048);
        } catch {
          return;
        }
        if (url === this.content) return;
        this.content = url;
        // Switching episodes resets the timeline to the start (paused).
        this.playback = { paused: true, anchorMediaTime: 0, anchorServerTime: Date.now(), rate: 1 };
        await this.persist();
        this.broadcast({ type: "content", url, from: this.actorFor(att) });
        this.broadcast(this.buildState());
        break;
      }
      case "chat": {
        // Relayed in real time to everyone (incl. sender); never stored.
        if (this.encrypted) {
          if (typeof msg.c !== "string" || !msg.c) return;
          this.broadcast({ type: "encChat", from: this.actorFor(att), c: msg.c.slice(0, MAX_BLOB_LEN) });
          break;
        }
        const text = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_CHAT_LEN) : "";
        if (!text) return;
        this.broadcast({ type: "chat", from: this.actorFor(att), text });
        break;
      }
      case "reaction": {
        if (this.encrypted) {
          if (typeof msg.c !== "string" || !msg.c) return;
          this.broadcast({ type: "encReaction", from: this.actorFor(att), c: msg.c.slice(0, MAX_BLOB_LEN) });
          break;
        }
        const emoji = typeof msg.emoji === "string" ? msg.emoji.slice(0, MAX_EMOJI_LEN) : "";
        if (!emoji) return;
        this.broadcast({ type: "reaction", from: this.actorFor(att), emoji });
        break;
      }
      case "bye": {
        ws.close(1000, "bye");
        break;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.cleanup(ws);
  }

  // Abnormal disconnects (laptop sleep, network loss) may surface here instead of
  // (or before) webSocketClose. Run the same cleanup so a dropped host is replaced
  // and presence stays accurate. Cleanup is idempotent, so running it twice is safe.
  async webSocketError(ws: WebSocket): Promise<void> {
    await this.cleanup(ws);
  }

  private async cleanup(ws: WebSocket): Promise<void> {
    const att = ws.deserializeAttachment() as Attachment;

    if (att.id === this.hostId) {
      const others = this.helloedSockets(ws); // only promote real participants
      if (others.length > 0) {
        const next = others[0]!;
        const na = next.deserializeAttachment() as Attachment;
        na.role = "host";
        next.serializeAttachment(na);
        this.hostId = na.id;
      } else {
        this.hostId = null;
      }
      await this.persist();
      this.broadcast(this.buildState(), ws);
    }

    this.broadcast({ type: "presence", participants: this.participants(ws) }, ws);

    // Once the last connection is gone the room no longer exists. Keep nothing:
    // fossync Cloud stores no room data beyond an active session, so wipe the
    // persisted record (and reset in-memory state in case this instance is reused).
    if (this.ctx.getWebSockets().filter((s) => s !== ws).length === 0) {
      await this.ctx.storage.deleteAll();
      this.encrypted = false;
      this.playback = { paused: true, anchorMediaTime: 0, anchorServerTime: Date.now(), rate: 1 };
      this.encPlayback = { blob: null, anchorServerTime: Date.now() };
      this.controlMode = "everyone";
      this.hostId = null;
      this.content = "";
      this.contentBlob = null;
      await this.touch("release");
    }
  }
}
