import { describe, it, expect } from "vitest";
import { qualityToIcon } from "./connection-quality";

describe("qualityToIcon", () => {
  it("maps good to 3 teal bars, no pulse", () => {
    expect(qualityToIcon("good")).toEqual({ bars: 3, color: "#15B8A0", pulse: false, label: "Good" });
  });

  it("maps fair to 2 amber bars", () => {
    expect(qualityToIcon("fair")).toEqual({ bars: 2, color: "#FFC73E", pulse: false, label: "Fair" });
  });

  it("maps poor to 1 coral bar", () => {
    expect(qualityToIcon("poor")).toEqual({ bars: 1, color: "#FF5A3C", pulse: false, label: "Poor" });
  });

  it("maps measuring to 0 bars, muted and pulsing", () => {
    expect(qualityToIcon("measuring")).toEqual({ bars: 0, color: "#9aa", pulse: true, label: "Measuring…" });
  });
});
