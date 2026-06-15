import type { PlayerAdapter, UserIntent } from "../types";

/** The narrow surface we need; a real HTMLVideoElement satisfies this structurally. */
export interface MediaElementLike {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: string, listener: () => void): void;
}

const SUPPRESS_WINDOW_MS = 200;

export class Html5VideoAdapter implements PlayerAdapter {
  private suppressUntil = 0;
  private intentCb: ((intent: UserIntent) => void) | null = null;

  constructor(
    private readonly el: MediaElementLike,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.el.addEventListener("play", () => this.emitIfUser("play"));
    this.el.addEventListener("pause", () => this.emitIfUser("pause"));
    this.el.addEventListener("seeked", () => this.emitIfUser("seek"));
  }

  private emitIfUser(kind: UserIntent["kind"]): void {
    if (this.now() < this.suppressUntil) return;
    this.intentCb?.({ kind, mediaTime: this.el.currentTime } as UserIntent);
  }

  private suppress(): void {
    this.suppressUntil = this.now() + SUPPRESS_WINDOW_MS;
  }

  getCurrentTime(): number { return this.el.currentTime; }
  getDuration(): number { return this.el.duration; }
  isPaused(): boolean { return this.el.paused; }

  play(): void { this.suppress(); void this.el.play(); }
  pause(): void { this.suppress(); this.el.pause(); }
  seek(seconds: number): void { this.suppress(); this.el.currentTime = seconds; }
  setPlaybackRate(rate: number): void { this.el.playbackRate = rate; }

  onUserIntent(cb: (intent: UserIntent) => void): void { this.intentCb = cb; }
}
