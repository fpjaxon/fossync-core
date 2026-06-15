import { reconcile, type ReconcileAction, type ReconcileConfig, DEFAULT_CONFIG } from "./reconciler";
import type { ControlAction, PlayerAdapter, Playback } from "./types";

export interface SessionClient {
  getPlayback(): Playback | null;
  getOffset(): number | null;
  sendControl(action: ControlAction, mediaTime: number): void;
}

export interface SyncSessionOptions {
  client: SessionClient;
  adapter: PlayerAdapter;
  now: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  cfg?: ReconcileConfig;
  tickMs?: number;
}

export class SyncSession {
  private readonly cfg: ReconcileConfig;

  constructor(private readonly opts: SyncSessionOptions) {
    this.cfg = opts.cfg ?? DEFAULT_CONFIG;
    opts.adapter.onUserIntent((intent) =>
      opts.client.sendControl(intent.kind as ControlAction, intent.mediaTime),
    );
  }

  start(): void {
    this.opts.setInterval(() => this.tick(), this.opts.tickMs ?? 250);
  }

  tick(): void {
    const pb = this.opts.client.getPlayback();
    const offset = this.opts.client.getOffset();
    if (pb === null || offset === null) return;
    const serverNow = this.opts.now() + offset;
    const action = reconcile(
      pb,
      { paused: this.opts.adapter.isPaused(), currentTime: this.opts.adapter.getCurrentTime() },
      serverNow,
      this.cfg,
    );
    this.apply(action);
  }

  private apply(action: ReconcileAction): void {
    const a = this.opts.adapter;
    switch (action.type) {
      case "play": a.play(); break;
      case "pause": a.pause(); break;
      case "seek": a.seek(action.to); break;
      case "setRate": a.setPlaybackRate(action.rate); break;
      case "none": break;
    }
  }
}
