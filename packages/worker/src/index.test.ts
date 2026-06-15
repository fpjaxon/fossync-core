import { describe, it, expect } from "vitest";
import { SELF } from "cloudflare:test";

describe("router", () => {
  it("returns a room code from /new", async () => {
    const res = await SELF.fetch("https://example.com/new");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { code: string };
    expect(body.code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it("404s an unknown path", async () => {
    const res = await SELF.fetch("https://example.com/nope");
    expect(res.status).toBe(404);
  });

  it("rejects a non-websocket request to a room", async () => {
    const res = await SELF.fetch("https://example.com/room/ABC123");
    expect(res.status).toBe(426);
  });
});
