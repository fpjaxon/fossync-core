import { describe, it, expect } from "vitest";
import { relayFromOrigin, normalizeRelayUrl } from "./relay-url";

describe("relay", () => {
  it("defaults to the official relay (so the warning never shows out of the box)", () => {
    const r = relayFromOrigin("");
    expect(r.httpOrigin).toBe("https://fossync.cloud");
    expect(r.wsOrigin).toBe("wss://fossync.cloud");
    expect(r.isOfficial).toBe(true);
  });

  it("derives the ws origin and flags a custom relay as non-official", () => {
    const r = relayFromOrigin("https://my-relay.example.com");
    expect(r.wsOrigin).toBe("wss://my-relay.example.com");
    expect(r.isOfficial).toBe(false);
  });

  it("normalizes user-entered relay URLs (adds scheme, drops path) and rejects junk", () => {
    expect(normalizeRelayUrl("my-relay.example.com")).toBe("https://my-relay.example.com");
    expect(normalizeRelayUrl("https://r.example.com/new")).toBe("https://r.example.com");
    expect(normalizeRelayUrl("  https://r.example.com/  ")).toBe("https://r.example.com");
    expect(normalizeRelayUrl("ftp://x.com")).toBeNull();
    expect(normalizeRelayUrl("not a url")).toBeNull();
    expect(normalizeRelayUrl("")).toBeNull();
  });
});
