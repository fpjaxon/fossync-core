import { computeSample, pickBestOffset, type PingSample } from "./clock";
import type {
  Actor,
  ClientMessage,
  ControlAction,
  ControlMode,
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
}

const BASE_RECONNECT_MS = 500;
const MAX_RECONNECT_MS = 10000;
const DEFAULT_RESYNC_MS = 30000;

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
  private intentionalClose = false;
  private epoch = 0; // bumped each connect; stale resync callbacks no-op

  constructor(private readonly opts: SyncClientOptions) {}

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
    this.send({ type: "hello", name: this.opts.name, mediaTime: this.opts.getMediaTime?.() });
    this.startClockSync();
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
        break;
      case "pong":
        this.samples.push(computeSample(msg.t0, msg.t1, this.opts.now()));
        this.offset = pickBestOffset(this.samples);
        break;
      case "state":
        this.applySnapshot(msg.controlMode, msg.hostId, msg.playback);
        this.actor = msg.actor ?? null;
        break;
      case "presence":
        this.participants = msg.participants;
        break;
      case "chat":
        this.chatCb?.({ from: msg.from, text: msg.text });
        break;
      case "reaction":
        this.reactionCb?.({ from: msg.from, emoji: msg.emoji });
        break;
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
    this.send({ type: "control", action, mediaTime });
  }
  setMode(mode: ControlMode): void { this.send({ type: "setMode", mode }); }
  sendChat(text: string): void { this.send({ type: "chat", text }); }
  sendReaction(emoji: string): void { this.send({ type: "reaction", emoji }); }
  onError(cb: (reason: string) => void): void { this.errorCb = cb; }
  onChat(cb: (msg: { from: Actor; text: string }) => void): void { this.chatCb = cb; }
  onReaction(cb: (msg: { from: Actor; emoji: string }) => void): void { this.reactionCb = cb; }

  close(): void {
    // #2 + #6: intentional leave — announce, then close without auto-reconnect.
    this.intentionalClose = true;
    this.send({ type: "bye" });
    this.socket?.close();
  }
}
