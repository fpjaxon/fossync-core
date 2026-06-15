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
});
