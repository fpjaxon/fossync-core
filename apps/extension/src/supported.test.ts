import { describe, it, expect } from "vitest";
import { isSupportedContentUrl } from "./supported";

describe("isSupportedContentUrl", () => {
  it("accepts the local harness origin", () => {
    expect(isSupportedContentUrl("http://localhost:5173/")).toBe(true);
    expect(isSupportedContentUrl("http://localhost:5173/#vsync=ABC")).toBe(true);
  });

  it("accepts a YouTube watch URL", () => {
    expect(isSupportedContentUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
  });

  it("rejects non-watch YouTube pages and other hosts", () => {
    expect(isSupportedContentUrl("https://www.youtube.com/")).toBe(false);
    expect(isSupportedContentUrl("https://example.com/")).toBe(false);
  });

  it("rejects a non-URL string", () => {
    expect(isSupportedContentUrl("not a url")).toBe(false);
  });
});
