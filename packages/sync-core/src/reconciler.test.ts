import { describe, it, expect } from "vitest";
import { reconcile, expectedPosition, DEFAULT_CONFIG } from "./reconciler";
import type { Playback } from "./types";

const playing = (over: Partial<Playback> = {}): Playback => ({
  paused: false,
  anchorMediaTime: 10,
  anchorServerTime: 1000,
  rate: 1,
  ...over,
});

describe("expectedPosition", () => {
  it("advances media time by elapsed server time when playing", () => {
    // 2000ms after the anchor at rate 1 => 10 + 2 = 12
    expect(expectedPosition(playing(), 3000)).toBe(12);
  });
  it("returns the anchor media time when paused", () => {
    expect(expectedPosition(playing({ paused: true }), 9999)).toBe(10);
  });
});

describe("reconcile (playing)", () => {
  it("does a rate nudge < 1 when ahead within the soft band", () => {
    // expected = 12, actual 12.2 => error = -0.2 => rate 1 + 0.5*-0.2 = 0.9
    const a = reconcile(playing(), { paused: false, currentTime: 12.2 }, 3000);
    expect(a).toEqual({ type: "setRate", rate: 0.9 });
  });
  it("does a rate nudge > 1 when behind within the soft band", () => {
    // expected = 12, actual 11.8 => error = +0.2 => rate 1.1 (clamped)
    const a = reconcile(playing(), { paused: false, currentTime: 11.8 }, 3000);
    expect(a).toEqual({ type: "setRate", rate: 1.1 });
  });
  it("normalizes rate when inside the tolerance band", () => {
    // expected = 12, actual 12.01 => |error| 0.01 < 0.04 tolerance
    const a = reconcile(playing(), { paused: false, currentTime: 12.01 }, 3000);
    expect(a).toEqual({ type: "setRate", rate: 1 });
  });
  it("hard-seeks when the error exceeds the hard threshold", () => {
    // expected = 12, actual 9 => error 3 > 0.75 => seek to 12 + seekLead(0.05)
    const a = reconcile(playing(), { paused: false, currentTime: 9 }, 3000);
    expect(a).toEqual({ type: "seek", to: 12 + DEFAULT_CONFIG.seekLead });
  });
  it("issues play when authoritative is playing but the player is paused", () => {
    const a = reconcile(playing(), { paused: true, currentTime: 12 }, 3000);
    expect(a).toEqual({ type: "play" });
  });
});

describe("reconcile (paused)", () => {
  it("issues pause when authoritative is paused but the player is playing", () => {
    const a = reconcile(playing({ paused: true }), { paused: false, currentTime: 10 }, 3000);
    expect(a).toEqual({ type: "pause" });
  });
  it("hard-seeks to the anchor when paused at the wrong frame", () => {
    const a = reconcile(playing({ paused: true }), { paused: true, currentTime: 13 }, 3000);
    expect(a).toEqual({ type: "seek", to: 10 });
  });
  it("does nothing when paused at the right frame", () => {
    const a = reconcile(playing({ paused: true }), { paused: true, currentTime: 10 }, 3000);
    expect(a).toEqual({ type: "none" });
  });
});
