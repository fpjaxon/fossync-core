import { describe, it, expect } from "vitest";
import { SELF, env } from "cloudflare:test";
import { encodeBrandedFragment, decodeBranded } from "@fossync/sync-core";
import { MAX_ROOMS } from "./index";

describe("router", () => {
  it("returns a room code from /new, with CORS open (reachable from any relay origin)", async () => {
    const res = await SELF.fetch("https://example.com/new");
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const body = (await res.json()) as { code: string };
    expect(body.code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("returns 503 at_capacity once MAX_ROOMS are active", async () => {
    const ns = (env as unknown as { REGISTRY: DurableObjectNamespace }).REGISTRY;
    const reg = ns.get(ns.idFromName("global")); // the same singleton /new consults
    const ids = Array.from({ length: MAX_ROOMS }, (_, i) => `CAPROOM${i}`);
    for (const room of ids) {
      await reg.fetch("https://registry/acquire", { method: "POST", body: JSON.stringify({ room }) });
    }
    const res = await SELF.fetch("https://example.com/new");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("at_capacity");
    // Release so this doesn't poison other tests sharing the singleton registry.
    for (const room of ids) {
      await reg.fetch("https://registry/release", { method: "POST", body: JSON.stringify({ room }) });
    }
  });

  it("404s an unknown path", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
  });

  it("redirects a browser hitting the root to the marketing site (API untouched)", async () => {
    const res = await SELF.fetch("https://fossync.cloud/", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://fossync.com/");
  });

  it("rejects a non-websocket request to a room", async () => {
    const res = await SELF.fetch("https://example.com/room/ABC123");
    expect(res.status).toBe(426);
  });

  it("serves the branded /j redirect page as cacheable html that leaks no referrer", async () => {
    const res = await SELF.fetch("https://fossync.cloud/j");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("cache-control")).toContain("max-age");
    const body = await res.text();
    // The fragment is decoded client-side: the page must embed the decoder and a
    // location.replace to the #vsync target — never the destination URL itself.
    expect(body).toContain("decodeBranded");
    expect(body).toContain("location.replace");
    expect(body).toContain("#vsync=");
  });

  it("embeds a decoder that round-trips what the extension encodes (no drift)", () => {
    // The /j page embeds decodeBranded verbatim, so testing it here proves the
    // served page resolves an encoded invite to the right destination.
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
    const decoded = decodeBranded(encodeBrandedFragment(url, "ABC123"));
    expect(decoded).toEqual({ url, code: "ABC123" });
    // and refuses a non-https destination
    const evil = "vsync=ABC123&u=" + btoa("http://insecure.test/").replace(/=+$/, "");
    expect(decodeBranded(evil)).toBeNull();
  });
});
