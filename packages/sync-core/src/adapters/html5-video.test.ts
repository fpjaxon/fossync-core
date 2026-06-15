import { describe, it, expect, vi } from "vitest";
import { Html5VideoAdapter, type MediaElementLike } from "./html5-video";

class FakeMedia implements MediaElementLike {
  currentTime = 0;
  duration = 100;
  paused = true;
  playbackRate = 1;
  play = vi.fn(() => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  private listeners: Record<string, Array<() => void>> = {};
  addEventListener(type: string, cb: () => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  emit(type: string) {
    for (const cb of this.listeners[type] ?? []) cb();
  }
}

function setup() {
  const media = new FakeMedia();
  let now = 1000;
  const adapter = new Html5VideoAdapter(media, () => now);
  const intents: unknown[] = [];
  adapter.onUserIntent((i) => intents.push(i));
  return { media, adapter, intents, advance: (ms: number) => (now += ms) };
}

describe("Html5VideoAdapter", () => {
  it("forwards reads and rate changes to the element", () => {
    const { media, adapter } = setup();
    media.currentTime = 42;
    expect(adapter.getCurrentTime()).toBe(42);
    expect(adapter.isPaused()).toBe(true);
    adapter.setPlaybackRate(1.05);
    expect(media.playbackRate).toBe(1.05);
  });

  it("suppresses intent for events caused by our own programmatic calls", () => {
    const { media, adapter, intents } = setup();
    adapter.seek(30); // programmatic
    expect(media.currentTime).toBe(30);
    media.emit("seeked"); // the resulting DOM event, inside the window
    expect(intents).toEqual([]);
  });

  it("reports a genuine user action once the suppression window has passed", () => {
    const { media, adapter, intents, advance } = setup();
    adapter.seek(30);
    advance(300); // past the 200ms window
    media.currentTime = 55;
    media.emit("seeked");
    expect(intents).toEqual([{ kind: "seek", mediaTime: 55 }]);
  });

  it("reports user play/pause", () => {
    const { media, adapter, intents, advance } = setup();
    advance(300);
    media.paused = false;
    media.currentTime = 5;
    media.emit("play");
    expect(intents).toEqual([{ kind: "play", mediaTime: 5 }]);
  });
});
