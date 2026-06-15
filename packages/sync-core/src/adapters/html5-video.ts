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

// Backstop so a programmatic op whose DOM event never arrives (e.g. seeking to the
// current position emits nothing) cannot suppress a later genuine user event forever.
const SUPPRESS_BACKSTOP_MS = 3000;

export class Html5VideoAdapter implements PlayerAdapter {
  private intentCb: ((intent: UserIntent) => void) | null = null;
  private blockedCb: (() => void) | null = null;
  // Per intent kind: expiry timestamps of programmatic ops still awaiting their DOM event.
  private readonly pending: Record<UserIntent["kind"], number[]> = { play: [], pause: [], seek: [] };

  constructor(
    private readonly el: MediaElementLike,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.el.addEventListener("play", () => this.emitIfUser("play"));
    this.el.addEventListener("pause", () => this.emitIfUser("pause"));
    this.el.addEventListener("seeked", () => this.emitIfUser("seek"));
  }

  private markProgrammatic(kind: UserIntent["kind"]): void {
    this.pending[kind].push(this.now() + SUPPRESS_BACKSTOP_MS);
  }

  private emitIfUser(kind: UserIntent["kind"]): void {
    const q = this.pending[kind];
    const t = this.now();
    while (q.length > 0 && q[0]! <= t) q.shift(); // discard expired markers
    if (q.length > 0) {
      q.shift(); // pair this event with our programmatic op -> suppress
      return;
    }
    this.intentCb?.({ kind, mediaTime: this.el.currentTime } as UserIntent);
  }

  getCurrentTime(): number { return this.el.currentTime; }
  getDuration(): number { return this.el.duration; }
  isPaused(): boolean { return this.el.paused; }

  play(): void {
    this.markProgrammatic("play");
    // Browsers reject programmatic play() of unmuted media without a user gesture;
    // surface that so the UI can prompt for one click rather than silently staying paused.
    Promise.resolve(this.el.play()).catch(() => this.blockedCb?.());
  }
  pause(): void { this.markProgrammatic("pause"); this.el.pause(); }
  seek(seconds: number): void { this.markProgrammatic("seek"); this.el.currentTime = seconds; }
  setPlaybackRate(rate: number): void { this.el.playbackRate = rate; }

  onUserIntent(cb: (intent: UserIntent) => void): void { this.intentCb = cb; }
  /** Fires when a programmatic play() was rejected (autoplay policy needs a user gesture). */
  onPlayBlocked(cb: () => void): void { this.blockedCb = cb; }
}
