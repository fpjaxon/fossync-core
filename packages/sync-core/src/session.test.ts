import { describe, it, expect, vi } from "vitest";
import { SyncSession, type SessionClient } from "./session";
import type { PlayerAdapter, Playback, UserIntent } from "./types";

function fakeAdapter(over: Partial<Record<keyof PlayerAdapter, any>> = {}) {
  let intentCb: ((i: UserIntent) => void) | null = null;
  const adapter: PlayerAdapter = {
    getCurrentTime: () => 9,
    getDuration: () => 100,
    isPaused: () => false,
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    setPlaybackRate: vi.fn(),
    onUserIntent: (cb) => { intentCb = cb; },
    ...over,
  };
  return { adapter, fireIntent: (i: UserIntent) => intentCb?.(i) };
}

function fakeClient(playback: Playback | null, offset: number | null): SessionClient & { sendControl: any } {
  return {
    getPlayback: () => playback,
    getOffset: () => offset,
    sendControl: vi.fn(),
  };
}

const playing: Playback = { paused: false, anchorMediaTime: 10, anchorServerTime: 1000, rate: 1 };

describe("SyncSession.tick", () => {
  it("applies a hard seek when the player is far behind", () => {
    const { adapter } = fakeAdapter({ getCurrentTime: () => 9 });
    // serverNow = now()+offset = 3000+0; expected = 12; error 3 => seek to 12.05
    const session = new SyncSession({
      client: fakeClient(playing, 0),
      adapter,
      now: () => 3000,
      setInterval: () => 0,
    });
    session.tick();
    expect(adapter.seek).toHaveBeenCalledWith(12.05);
  });

  it("does nothing when the offset is not yet known", () => {
    const { adapter } = fakeAdapter();
    const session = new SyncSession({
      client: fakeClient(playing, null),
      adapter,
      now: () => 3000,
      setInterval: () => 0,
    });
    session.tick();
    expect(adapter.seek).not.toHaveBeenCalled();
    expect(adapter.setPlaybackRate).not.toHaveBeenCalled();
  });

  it("forwards user intent to the client as a control command", () => {
    const { adapter, fireIntent } = fakeAdapter();
    const client = fakeClient(playing, 0);
    new SyncSession({ client, adapter, now: () => 3000, setInterval: () => 0 });
    fireIntent({ kind: "pause", mediaTime: 22 });
    expect(client.sendControl).toHaveBeenCalledWith("pause", 22);
  });

  it("clamps a seek beyond the media duration and skips it when already at the end", () => {
    const seek = vi.fn();
    const { adapter } = fakeAdapter({ getCurrentTime: () => 100, getDuration: () => 100, seek });
    const pastEnd: Playback = { paused: false, anchorMediaTime: 100, anchorServerTime: 0, rate: 1 };
    const session = new SyncSession({
      client: fakeClient(pastEnd, 0),
      adapter,
      now: () => 1_000_000, // expected ~1100s, far beyond the 100s duration
      setInterval: () => 0,
    });
    session.tick();
    expect(seek).not.toHaveBeenCalled(); // clamped to 100 == current => no thrash
  });

  it("clears the interval on stop()", () => {
    const cleared: unknown[] = [];
    const { adapter } = fakeAdapter();
    const session = new SyncSession({
      client: fakeClient(playing, 0),
      adapter,
      now: () => 0,
      setInterval: () => 42,
      clearInterval: (h) => cleared.push(h),
    });
    session.start();
    session.stop();
    expect(cleared).toEqual([42]);
  });

  it("suppresses reconciliation briefly after the user issues intent (no fighting the echo)", () => {
    let now = 1000;
    const seek = vi.fn();
    const { adapter, fireIntent } = fakeAdapter({ getCurrentTime: () => 9, seek });
    const session = new SyncSession({
      client: fakeClient(playing, 0),
      adapter,
      now: () => now,
      setInterval: () => 0,
      intentGraceMs: 500,
    });
    fireIntent({ kind: "seek", mediaTime: 9 }); // user just acted at now=1000
    now = 1200; // within the 500ms grace window
    session.tick();
    expect(seek).not.toHaveBeenCalled(); // reconcile is suppressed — doesn't revert the user
    now = 1600; // past the grace window
    session.tick();
    expect(seek).toHaveBeenCalled(); // reconcile resumes normally
  });
});
