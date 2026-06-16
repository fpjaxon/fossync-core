import { describe, it, expect } from "vitest";
import { decodeBranded } from "@fossync/sync-core";
import { buildShareUrl } from "./branded";

// vitest.config.ts defines __BRANDED__ = true, so both branches are reachable.
describe("buildShareUrl", () => {
  const page = "https://www.youtube.com/watch?v=abc";

  it("returns the plain page-URL invite when branded is off", () => {
    expect(buildShareUrl(page, "ABC123", "https://fossync.cloud", false)).toBe(
      "https://www.youtube.com/watch?v=abc#vsync=ABC123",
    );
  });

  it("returns a /j fragment link on the configured relay when branded is on", () => {
    const url = buildShareUrl(page, "ABC123", "https://fossync.cloud", true);
    expect(url.startsWith("https://fossync.cloud/j#")).toBe(true);
    // the link round-trips back to the original page + code via the worker decoder
    expect(decodeBranded(new URL(url).hash)).toEqual({ url: page, code: "ABC123" });
  });

  it("uses whatever relay origin is configured (so a self-hosted build points at its own relay)", () => {
    const url = buildShareUrl(page, "ZZZ999", "https://relay.example.com", true);
    expect(url.startsWith("https://relay.example.com/j#")).toBe(true);
    expect(decodeBranded(new URL(url).hash)).toEqual({ url: page, code: "ZZZ999" });
  });

  it("keeps the page's query and drops any existing hash from the encoded destination", () => {
    const url = buildShareUrl("https://x.test/e?ep=3#vsync=OLD", "NEW123", "https://fossync.cloud", true);
    expect(decodeBranded(new URL(url).hash)).toEqual({ url: "https://x.test/e?ep=3", code: "NEW123" });
  });
});
