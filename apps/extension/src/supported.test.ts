import { describe, it, expect } from "vitest";
import { isSupportedContentUrl } from "./supported";

describe("isSupportedContentUrl", () => {
  it("accepts the deployed and local harness origins", () => {
    expect(isSupportedContentUrl("https://harness.fossync.cloud/")).toBe(true);
    expect(isSupportedContentUrl("https://harness.fossync.cloud/#vsync=ABC")).toBe(true);
    expect(isSupportedContentUrl("http://localhost:5173/")).toBe(true);
    expect(isSupportedContentUrl("http://localhost:5173/#vsync=ABC")).toBe(true);
  });

  it("accepts a YouTube watch URL", () => {
    expect(isSupportedContentUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
  });

  it("accepts a Crunchyroll watch URL", () => {
    expect(isSupportedContentUrl("https://www.crunchyroll.com/watch/GPWUK9DJW/like-a-lone-sword")).toBe(true);
  });

  it("rejects non-watch YouTube pages and other hosts", () => {
    expect(isSupportedContentUrl("https://www.youtube.com/")).toBe(false);
    expect(isSupportedContentUrl("https://www.crunchyroll.com/")).toBe(false);
    expect(isSupportedContentUrl("https://example.com/")).toBe(false);
  });

  it("rejects a non-URL string", () => {
    expect(isSupportedContentUrl("not a url")).toBe(false);
  });
});
