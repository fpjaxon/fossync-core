import { describe, it, expect } from "vitest";
import { decodeBranded } from "@fossync/sync-core";
import { buildShareUrl } from "./branded";
import { WORKER_ORIGIN } from "./config";

describe("buildShareUrl", () => {
  const page = "https://www.youtube.com/watch?v=abc";

  it("returns the plain page-URL invite when branded is off", () => {
    expect(buildShareUrl(page, "ABC123", false)).toBe(
      "https://www.youtube.com/watch?v=abc#vsync=ABC123",
    );
  });

  it("returns a /j fragment link on this build's relay (WORKER_ORIGIN) when branded is on", () => {
    const url = buildShareUrl(page, "ABC123", true);
    expect(url.startsWith(`${WORKER_ORIGIN}/j#`)).toBe(true); // fossync.cloud in the official build
    // the link round-trips back to the original page + code via the /j decoder
    expect(decodeBranded(new URL(url).hash)).toEqual({ url: page, code: "ABC123" });
  });

  it("carries the encrypted-session key through the branded fragment", () => {
    const url = buildShareUrl(page, "ABC123", true, "thekey_-09");
    expect(decodeBranded(new URL(url).hash)).toEqual({ url: page, code: "ABC123", key: "thekey_-09" });
  });

  it("passes the key through the plain invite too (branded off)", () => {
    expect(buildShareUrl(page, "ABC123", false, "thekey_-09")).toBe(
      "https://www.youtube.com/watch?v=abc#vsync=ABC123&k=thekey_-09",
    );
  });

  it("keeps the page's query and drops any existing hash from the encoded destination", () => {
    const url = buildShareUrl("https://x.test/e?ep=3#vsync=OLD", "NEW123", true);
    expect(decodeBranded(new URL(url).hash)).toEqual({ url: "https://x.test/e?ep=3", code: "NEW123" });
  });
});
