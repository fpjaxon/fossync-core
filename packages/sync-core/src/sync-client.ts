import { computeSample, pickBestOffset, type PingSample } from "./clock";
import { open, seal } from "./e2ee";
import type {
  Actor,
  ClientMessage,
  ControlAction,
  ControlMode,
  EncryptedPlayback,
  Participant,
  Playback,
  ServerMessage,
} from "./types";

export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: "open" | "message" | "close" | "error", cb: (ev?: any) => void): void;
}

export interface SyncClientOptions {
  url: string;
  name: string;
  createSocket: (url: string) => SocketLike;
  now: () => number;
  schedule: (fn: () => void, ms: number) => unknown;
  pingCount?: number;
  resyncMs?: number; // periodic clock re-sync interval; default 30000
  /** Current media position, sent with `hello` so a fresh room anchors at the host's spot. */
  getMediaTime?: () => number;
  /**
   * Encrypted session: the AES-GCM session key (imported from the share-link
   * fragment). When set, every content-bearing field is sealed before sending and
   * opened on receipt — the relay only ever sees opaque blobs. See e2ee.ts.
   */
  key?: CryptoKey;
}

const BASE_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 10000;
const DEFAULT_RESYNC_MS = 30000;

// Additional-authenticated-data tags bind each ciphertext to its semantic purpose,
// so the relay can't replay (say) a chat blob as a control blob. Sender and
// receiver must agree on these strings.
const AAD = {
  name: "name",
  control: "control",
  content: "content",
  chat: "chat",
  reaction: "reaction",
} as const;

export class SyncClient {
  private socket: SocketLike | null = null;
  private youId: string | null = null;
  private offset: number | null = null;
  private playback: Playback | null = null;
  private controlMode: ControlMode | null = null;
  private hostId: string | null = null;
  private participants: Participant[] = [];
  private actor: Actor | null = null;
  private samples: PingSample[] = [];
  private reconnectMs = BASE_RECONNECT_MS;
  private errorCb: ((reason: string) => void) | null = null;
  private chatCb: ((msg: { from: Actor; text: string }) => void) | null = null;
  private reactionCb: ((msg: { from: Actor; emoji: string }) => void) | null = null;
  private content = "";
  private contentCb: ((url: string) => void) | null = null;
  private undecryptableCb: (() => void) | null = null;
  private intentionalClose = false;
  private epoch = 0; // bumped each connect; stale resync callbacks no-op
  // Crypto is async, so seals (outgoing) and opens (incoming) are each funnelled
  // through a FIFO promise chain to preserve message order under encryption.
  private outbound: Promise<void> = Promise.resolve();
  private inbound: Promise<void> = Promise.resolve();

  constructor(private readonly opts: SyncClientOptions) {}

  private get encrypted(): boolean {
    return this.opts.key !== undefined;
  }

  connect(): void {
    this.epoch++;
    this.intentionalClose = false;
    this.samples = [];
    const socket = this.opts.createSocket(this.opts.url);
    this.socket = socket;
    socket.addEventListener("open", () => this.onOpen());
    socket.addEventListener("message", (ev) => this.onMessage(ev as { data: string }));
    socket.addEventListener("close", () => this.onClose());
    socket.addEventListener("error", () => {});
  }

  private onOpen(): void {
    this.reconnectMs = BASE_RECONNECT_MS; // #1: a healthy connection resets the backoff
    const key = this.opts.key;
    if (key) {
      // The relay gates every non-`hello` message until the socket has identified
      // itself, so the (async-sealed) hello must be sent before the pings.
      this.enqueueOutbound(async () => {
        const c = await seal({ name: this.opts.name }, key, AAD.name);
        this.send({ type: "hello", enc: true, c });
        this.startClockSync();
      });
    } else {
      this.send({ type: "hello", name: this.opts.name, mediaTime: this.opts.getMediaTime?.() });
      this.startClockSync();
    }
    this.scheduleResync(this.epoch); // #4: refresh the clock periodically
  }

  private startClockSync(): void {
    this.samples = [];
    const count = this.opts.pingCount ?? 5;
    for (let i = 0; i < count; i++) this.send({ type: "ping", t0: this.opts.now() });
  }

  private scheduleResync(epoch: number): void {
    const ms = this.opts.resyncMs ?? DEFAULT_RESYNC_MS;
    this.opts.schedule(() => {
      if (epoch !== this.epoch || this.socket === null) return; // stale connection
      this.startClockSync();
      this.scheduleResync(epoch);
    }, ms);
  }

  private onMessage(ev: { data: string }): void {
    let msg: ServerMessage;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.type) {
      case "welcome":
        this.youId = msg.youId;
        this.applySnapshot(msg.snapshot.controlMode, msg.snapshot.hostId, msg.snapshot.playback);
        this.participants = msg.snapshot.participants;
        this.content = msg.snapshot.content ?? "";
        if (this.content) this.contentCb?.(this.content);
        break;
      case "welcomeEnc": {
        this.youId = msg.youId;
        this.controlMode = msg.snapshot.controlMode;
        this.hostId = msg.snapshot.hostId;
        const snap = msg.snapshot;
        this.enqueueInbound(async () => {
          await this.resolveRoster(snap.participants);
          await this.applyEncPlayback(snap.encPlayback);
          if (snap.contentBlob) await this.applyEncContent(snap.contentBlob);
        });
        break;
      }
      case "pong":
        this.samples.push(computeSample(msg.t0, msg.t1, this.opts.now()));
        this.offset = pickBestOffset(this.samples);
        break;
      case "state":
        this.applySnapshot(msg.controlMode, msg.hostId, msg.playback);
        this.actor = msg.actor ?? null;
        break;
      case "encState": {
        this.controlMode = msg.controlMode;
        this.hostId = msg.hostId;
        this.actor = msg.actor ? this.resolveActorName(msg.actor) : null;
        const ep = msg.encPlayback;
        this.enqueueInbound(() => this.applyEncPlayback(ep));
        break;
      }
      case "presence":
        if (this.encrypted) {
          const list = msg.participants;
          this.enqueueInbound(() => this.resolveRoster(list));
        } else {
          this.participants = msg.participants;
        }
        break;
      case "content":
        this.content = msg.url;
        this.contentCb?.(msg.url);
        break;
      case "encContent": {
        const blob = msg.blob;
        this.enqueueInbound(() => this.applyEncContent(blob));
        break;
      }
      case "chat":
        this.chatCb?.({ from: msg.from, text: msg.text });
        break;
      case "encChat": {
        const m = msg;
        this.enqueueInbound(async () => {
          const payload = await this.tryOpen<{ text: string }>(m.c, AAD.chat);
          if (payload) this.chatCb?.({ from: this.resolveActorName(m.from), text: payload.text });
        });
        break;
      }
      case "reaction":
        this.reactionCb?.({ from: msg.from, emoji: msg.emoji });
        break;
      case "encReaction": {
        const m = msg;
        this.enqueueInbound(async () => {
          const payload = await this.tryOpen<{ emoji: string }>(m.c, AAD.reaction);
          if (payload) this.reactionCb?.({ from: this.resolveActorName(m.from), emoji: payload.emoji });
        });
        break;
      }
      case "error":
        this.errorCb?.(msg.reason);
        break;
    }
  }

  private applySnapshot(mode: ControlMode, hostId: string, playback: Playback): void {
    this.controlMode = mode;
    this.hostId = hostId;
    this.playback = playback;
  }

  // ---- encryption helpers ----

  private enqueueOutbound(fn: () => Promise<void>): void {
    this.outbound = this.outbound.then(fn).catch(() => {});
  }

  private enqueueInbound(fn: () => Promise<void>): void {
    this.inbound = this.inbound.then(fn).catch(() => {});
  }

  /** Seal `payload` then send `make(envelope)`, preserving call order. */
  private sealSend(make: (c: string) => ClientMessage, payload: unknown, aad: string): void {
    const key = this.opts.key;
    if (!key) return;
    this.enqueueOutbound(async () => {
      const c = await seal(payload, key, aad);
      this.send(make(c));
    });
  }

  /** Open a blob, or surface an undecryptable message (wrong key / tampered) and return null. */
  private async tryOpen<T>(envelope: string, aad: string): Promise<T | null> {
    const key = this.opts.key;
    if (!key) return null;
    try {
      return (await open(envelope, key, aad)) as T;
    } catch {
      this.undecryptableCb?.();
      return null;
    }
  }

  /** Rebuild the local timeline from an encrypted playback record + the server anchor. */
  private async applyEncPlayback(ep: EncryptedPlayback): Promise<void> {
    if (!ep.blob) {
      // No control yet, or content was just switched: paused at the start.
      this.playback = { paused: true, anchorMediaTime: 0, anchorServerTime: ep.anchorServerTime, rate: 1 };
      return;
    }
    const payload = await this.tryOpen<{ action: ControlAction; mediaTime: number }>(ep.blob, AAD.control);
    if (!payload) return;
    const t = ep.anchorServerTime;
    if (payload.action === "pause") {
      this.playback = { paused: true, anchorMediaTime: payload.mediaTime, anchorServerTime: t, rate: 1 };
    } else if (payload.action === "play") {
      this.playback = { paused: false, anchorMediaTime: payload.mediaTime, anchorServerTime: t, rate: 1 };
    } else {
      // seek keeps the current paused/rate, like the relay does for plaintext rooms.
      const prev = this.playback ?? { paused: true, anchorMediaTime: 0, anchorServerTime: t, rate: 1 };
      this.playback = { ...prev, anchorMediaTime: payload.mediaTime, anchorServerTime: t };
    }
  }

  private async applyEncContent(blob: string): Promise<void> {
    const payload = await this.tryOpen<{ url: string }>(blob, AAD.content);
    if (!payload) return;
    let url: string;
    try {
      const u = new URL(payload.url);
      if (u.protocol !== "https:") return; // validation the relay can no longer do
      url = u.toString();
    } catch {
      return;
    }
    this.content = url;
    this.contentCb?.(url);
  }

  /** Decrypt every participant's name (encrypted) or pass the roster through (plaintext). */
  private async resolveRoster(list: Participant[]): Promise<void> {
    if (!this.encrypted) {
      this.participants = list;
      return;
    }
    this.participants = await Promise.all(
      list.map(async (p) => {
        if (!p.nameBlob) return { id: p.id, role: p.role };
        const payload = await this.tryOpen<{ name: string }>(p.nameBlob, AAD.name);
        return { id: p.id, role: p.role, name: payload?.name };
      }),
    );
  }

  /** Fill an actor's display name from the (decrypted) roster when the relay omitted it. */
  private resolveActorName(a: Actor): Actor {
    if (a.name) return a;
    const p = this.participants.find((x) => x.id === a.id);
    return p?.name ? { id: a.id, name: p.name } : { id: a.id };
  }

  private onClose(): void {
    this.socket = null;
    if (this.intentionalClose) {
      this.intentionalClose = false; // #2: leave for good, no reconnect
      return;
    }
    this.opts.schedule(() => this.connect(), this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, MAX_RECONNECT_MS);
  }

  private send(msg: ClientMessage): void {
    this.socket?.send(JSON.stringify(msg));
  }

  // ---- public reads / commands ----
  getYouId(): string | null { return this.youId; }
  getOffset(): number | null { return this.offset; }
  getPlayback(): Playback | null { return this.playback; }
  getControlMode(): ControlMode | null { return this.controlMode; }
  getHostId(): string | null { return this.hostId; }
  getParticipants(): Participant[] { return this.participants; }
  /** Who caused the most recent `state` change (null if system-initiated/unknown). */
  getActor(): Actor | null { return this.actor; }

  sendControl(action: ControlAction, mediaTime: number): void {
    if (this.encrypted) this.sealSend((c) => ({ type: "control", c }), { action, mediaTime }, AAD.control);
    else this.send({ type: "control", action, mediaTime });
  }
  setMode(mode: ControlMode): void { this.send({ type: "setMode", mode }); } // mode stays plaintext
  setContent(url: string): void {
    if (this.encrypted) this.sealSend((c) => ({ type: "setContent", c }), { url }, AAD.content);
    else this.send({ type: "setContent", url });
  }
  getContent(): string { return this.content; }
  sendChat(text: string): void {
    if (this.encrypted) this.sealSend((c) => ({ type: "chat", c }), { text }, AAD.chat);
    else this.send({ type: "chat", text });
  }
  sendReaction(emoji: string): void {
    if (this.encrypted) this.sealSend((c) => ({ type: "reaction", c }), { emoji }, AAD.reaction);
    else this.send({ type: "reaction", emoji });
  }
  onError(cb: (reason: string) => void): void { this.errorCb = cb; }
  onChat(cb: (msg: { from: Actor; text: string }) => void): void { this.chatCb = cb; }
  onReaction(cb: (msg: { from: Actor; emoji: string }) => void): void { this.reactionCb = cb; }
  onContent(cb: (url: string) => void): void { this.contentCb = cb; }
  /** Fired when an incoming message can't be decrypted (wrong key / tampered relay). */
  onUndecryptable(cb: () => void): void { this.undecryptableCb = cb; }

  close(): void {
    // #2 + #6: intentional leave — announce, then close without auto-reconnect.
    this.intentionalClose = true;
    this.send({ type: "bye" });
    this.socket?.close();
  }
}
