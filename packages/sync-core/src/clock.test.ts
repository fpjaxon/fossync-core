import { describe, it, expect } from "vitest";
import { computeSample, pickBestOffset } from "./clock";

describe("computeSample", () => {
  it("computes offset and rtt from a ping round-trip", () => {
    // client sends at t0=1000, server stamps t1=1500, client receives at t3=1040
    const s = computeSample(1000, 1500, 1040);
    expect(s.rtt).toBe(40);
    // offset = ((1500-1000) + (1500-1040)) / 2 = (500 + 460) / 2 = 480
    expect(s.offset).toBe(480);
  });
});

describe("pickBestOffset", () => {
  it("returns the offset of the lowest-rtt sample", () => {
    const offset = pickBestOffset([
      { offset: 100, rtt: 80 },
      { offset: 120, rtt: 20 }, // best
      { offset: 90, rtt: 50 },
    ]);
    expect(offset).toBe(120);
  });

  it("throws when given no samples", () => {
    expect(() => pickBestOffset([])).toThrow();
  });
});
