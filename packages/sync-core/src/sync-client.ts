import { computeSample, pickBestOffset, type PingSample } from "./clock";
import type {
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
}

export class SyncClient {
  private socket: SocketLike | null = null;
  private youId: string | null = null;
  private offset: number | null = null;
  private playback: Playback | null = null;
  private controlMode: ControlMode | null = null;
  private hostId: string | null = null;
  private participants: Participant[] = [];
  private samples: PingSample[] = [];
  private reconnectMs = 500;
  private errorCb: ((reason: string) => void) | null = null;

  constructor(private readonly opts: SyncClientOptions) {}

  connect(): void {
    this.samples = [];
    const socket = this.opts.createSocket(this.opts.url);
    this.socket = socket;
    socket.addEventListener("open", () => this.onOpen());
    socket.addEventListener("message", (ev) => this.onMessage(ev as { data: string }));
    socket.addEventListener("close", () => this.onClose());
    socket.addEventListener("error", () => {});
  }

  private onOpen(): void {
    this.send({ type: "hello", name: this.opts.name });
    const count = this.opts.pingCount ?? 5;
    for (let i = 0; i < count; i++) this.send({ type: "ping", t0: this.opts.now() });
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
        break;
      case "presence":
        this.participants = msg.participants;
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
    this.opts.schedule(() => this.connect(), this.reconnectMs);
    this.reconnectMs = Math.min(this.reconnectMs * 2, 10000);
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

  sendControl(action: ControlAction, mediaTime: number): void {
    this.send({ type: "control", action, mediaTime });
  }
  setMode(mode: ControlMode): void { this.send({ type: "setMode", mode }); }
  onError(cb: (reason: string) => void): void { this.errorCb = cb; }
  close(): void { this.socket?.close(); }
}
