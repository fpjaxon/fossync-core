import { describe, it, expect } from "vitest";
import { classifyConnection } from "./connection";

describe("classifyConnection", () => {
  it("returns measuring when RTT is unknown", () => {
    expect(classifyConnection(null)).toBe("measuring");
  });

  it("classifies good below 100ms (inclusive of 0, exclusive of 100)", () => {
    expect(classifyConnection(0)).toBe("good");
    expect(classifyConnection(99)).toBe("good");
  });

  it("classifies fair from 100ms to 250ms inclusive", () => {
    expect(classifyConnection(100)).toBe("fair");
    expect(classifyConnection(250)).toBe("fair");
  });

  it("classifies poor above 250ms", () => {
    expect(classifyConnection(251)).toBe("poor");
    expect(classifyConnection(9999)).toBe("poor");
  });
});
