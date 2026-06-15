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

  it("suppresses intent for the event caused by our own programmatic call", () => {
    const { media, adapter, intents } = setup();
    adapter.seek(30);
    expect(media.currentTime).toBe(30);
    media.emit("seeked");
    expect(intents).toEqual([]);
  });

  it("suppresses our programmatic event even when it arrives late (slow buffering)", () => {
    const { media, adapter, intents, advance } = setup();
    adapter.seek(30);
    advance(1500); // far past the old 200ms window, still within the backstop
    media.currentTime = 30;
    media.emit("seeked");
    expect(intents).toEqual([]); // recognized as our own, NOT a user seek
  });

  it("reports a genuine user seek that has no preceding programmatic op", () => {
    const { media, adapter, intents } = setup();
    media.currentTime = 55;
    media.emit("seeked");
    expect(intents).toEqual([{ kind: "seek", mediaTime: 55 }]);
  });

  it("emits as user intent once the backstop expires without the event arriving", () => {
    const { media, adapter, intents, advance } = setup();
    adapter.seek(30); // programmatic, but its 'seeked' never fires
    advance(3500); // past the 3s backstop
    media.currentTime = 80;
    media.emit("seeked"); // a fresh, genuine user seek much later
    expect(intents).toEqual([{ kind: "seek", mediaTime: 80 }]);
  });

  it("pairs each programmatic op with exactly one event; a second event is user intent", () => {
    const { media, adapter, intents } = setup();
    adapter.seek(30);
    media.currentTime = 30;
    media.emit("seeked"); // paired with our op -> suppressed
    media.currentTime = 31;
    media.emit("seeked"); // no pending op left -> user intent
    expect(intents).toEqual([{ kind: "seek", mediaTime: 31 }]);
  });

  it("reports user play/pause", () => {
    const { media, adapter, intents } = setup();
    media.paused = false;
    media.currentTime = 5;
    media.emit("play");
    expect(intents).toEqual([{ kind: "play", mediaTime: 5 }]);
  });

  it("reports a play() rejected by the autoplay policy via onPlayBlocked", async () => {
    const { media, adapter } = setup();
    let blocked = false;
    adapter.onPlayBlocked(() => { blocked = true; });
    media.play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    adapter.play();
    await new Promise((r) => setTimeout(r, 0)); // flush the rejection microtask
    expect(blocked).toBe(true);
  });
});
