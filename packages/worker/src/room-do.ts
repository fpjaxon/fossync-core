import type {
  Actor,
  ClientMessage,
  ControlMode,
  Participant,
  Playback,
  RoomSnapshot,
  ServerMessage,
} from "@fossync/sync-core";

interface Attachment {
  id: string;
  name: string;
  role: "host" | "guest";
  helloed: boolean; // true once the socket has identified itself via `hello`
}

interface PersistedRoom {
  playback: Playback;
  controlMode: ControlMode;
  hostId: string | null;
}

const MAX_NAME_LEN = 64;
const CONTROL_ACTIONS = new Set(["play", "pause", "seek"]);

export class RoomDurableObject {
  private playback: Playback;
  private controlMode: ControlMode = "everyone";
  private hostId: string | null = null;

  constructor(private readonly ctx: DurableObjectState, private readonly env: unknown) {
    this.playback = { paused: true, anchorMediaTime: 0, anchorServerTime: Date.now(), rate: 1 };
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<PersistedRoom>("room");
      if (saved) {
        this.playback = saved.playback;
        this.controlMode = saved.controlMode;
        this.hostId = saved.hostId;
      }
    });
  }

  private async persist(): Promise<void> {
    const room: PersistedRoom = {
      playback: this.playback,
      controlMode: this.controlMode,
      hostId: this.hostId,
    };
    await this.ctx.storage.put("room", room);
  }

  async fetch(req: Request): Promise<Response> {
    if ((req.headers.get("Upgrade") ?? "").toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { id: crypto.randomUUID(), name: "", role: "guest", helloed: false };
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
      return { id: a.id, role: a.role, name: a.name };
    });
  }

  private snapshot(): RoomSnapshot {
    return {
      controlMode: this.controlMode,
      hostId: this.hostId ?? "",
      playback: this.playback,
      participants: this.participants(),
    };
  }

  private broadcast(msg: ServerMessage, except?: WebSocket): void {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except) ws.send(s);
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    ws.send(JSON.stringify(msg));
  }

  private stateMessage(actor?: Actor): ServerMessage {
    return {
      type: "state",
      playback: this.playback,
      controlMode: this.controlMode,
      hostId: this.hostId ?? "",
      ...(actor ? { actor } : {}),
    };
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
        att.name = typeof msg.name === "string" ? msg.name.slice(0, MAX_NAME_LEN) : "Guest";
        att.helloed = true;
        if (this.hostId === null) {
          this.hostId = att.id;
          att.role = "host";
          await this.persist();
        }
        ws.serializeAttachment(att);
        this.send(ws, { type: "welcome", youId: att.id, snapshot: this.snapshot() });
        this.broadcast({ type: "presence", participants: this.participants() });
        break;
      }
      case "ping": {
        if (typeof msg.t0 !== "number") return;
        this.send(ws, { type: "pong", t0: msg.t0, t1: Date.now() });
        break;
      }
      case "control": {
        if (!CONTROL_ACTIONS.has(msg.action) || !Number.isFinite(msg.mediaTime)) {
          this.send(ws, { type: "error", reason: "invalid control" });
          return;
        }
        if (this.controlMode === "host" && att.id !== this.hostId) {
          this.send(ws, { type: "error", reason: "not authorized to control" });
          return;
        }
        const now = Date.now();
        if (msg.action === "pause") {
          this.playback = { ...this.playback, paused: true, anchorMediaTime: msg.mediaTime, anchorServerTime: now };
        } else if (msg.action === "play") {
          this.playback = { ...this.playback, paused: false, anchorMediaTime: msg.mediaTime, anchorServerTime: now };
        } else {
          this.playback = { ...this.playback, anchorMediaTime: msg.mediaTime, anchorServerTime: now };
        }
        await this.persist();
        this.broadcast(this.stateMessage({ id: att.id, name: att.name }));
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
        this.broadcast(this.stateMessage({ id: att.id, name: att.name }));
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
      this.broadcast(this.stateMessage(), ws);
    }

    this.broadcast({ type: "presence", participants: this.participants(ws) }, ws);

    // Once the last connection is gone the room no longer exists. Keep nothing:
    // fossync Cloud stores no room data beyond an active session, so wipe the
    // persisted record (and reset in-memory state in case this instance is reused).
    if (this.ctx.getWebSockets().filter((s) => s !== ws).length === 0) {
      await this.ctx.storage.deleteAll();
      this.playback = { paused: true, anchorMediaTime: 0, anchorServerTime: Date.now(), rate: 1 };
      this.controlMode = "everyone";
      this.hostId = null;
    }
  }
}
