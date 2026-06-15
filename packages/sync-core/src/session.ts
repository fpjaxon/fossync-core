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
  clearInterval?: (handle: unknown) => void;
  cfg?: ReconcileConfig;
  tickMs?: number;
  intentGraceMs?: number;
}

const DEFAULT_INTENT_GRACE_MS = 1000;

export class SyncSession {
  private readonly cfg: ReconcileConfig;
  private intervalHandle: unknown = null;
  private suppressReconcileUntil = 0;
  private paused = false;

  constructor(private readonly opts: SyncSessionOptions) {
    this.cfg = opts.cfg ?? DEFAULT_CONFIG;
    opts.adapter.onUserIntent((intent) => {
      if (this.paused) return;
      opts.client.sendControl(intent.kind as ControlAction, intent.mediaTime);
      // Don't let the reconcile loop fight the user before the authoritative echo
      // lands (matters when RTT > tick): briefly pause reconciliation so a tick
      // can't revert the local play/pause/seek the user just performed.
      this.suppressReconcileUntil = opts.now() + (opts.intentGraceMs ?? DEFAULT_INTENT_GRACE_MS);
    });
  }

  start(): void {
    this.intervalHandle = this.opts.setInterval(() => this.tick(), this.opts.tickMs ?? 250);
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      this.opts.clearInterval?.(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  tick(): void {
    if (this.paused) return;
    if (this.opts.now() < this.suppressReconcileUntil) return;
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
      case "seek": {
        let to = action.to;
        const duration = a.getDuration();
        if (Number.isFinite(duration) && duration > 0) to = Math.max(0, Math.min(to, duration));
        // Avoid end-of-video thrash: don't seek if we're already essentially there.
        if (Math.abs(to - a.getCurrentTime()) <= this.cfg.softThreshold) break;
        a.seek(to);
        break;
      }
      case "setRate": a.setPlaybackRate(action.rate); break;
      case "none": break;
    }
  }
}
