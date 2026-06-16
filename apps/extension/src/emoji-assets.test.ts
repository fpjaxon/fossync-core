import { describe, it, expect } from "vitest";
import { REACTIONS, assetPath } from "./emoji-assets";

describe("emoji-assets", () => {
  it("maps every supported reaction to an emoji/*.webp path", () => {
    for (const emoji of REACTIONS) {
      expect(assetPath(emoji)).toMatch(/^emoji\/[a-z_]+\.webp$/);
    }
  });

  it("returns null for unsupported emoji so the caller falls back to the glyph", () => {
    expect(assetPath("🦄")).toBeNull();
    expect(assetPath("")).toBeNull();
  });

  it("maps distinct emoji to distinct files", () => {
    const files = REACTIONS.map(assetPath);
    expect(new Set(files).size).toBe(REACTIONS.length);
  });
});
