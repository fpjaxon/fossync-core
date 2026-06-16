import { describe, it, expect } from "vitest";
import { generateKey, exportKeyB64, importKeyB64, seal, open } from "./e2ee";

describe("e2ee envelope", () => {
  it("round-trips a JSON payload through seal/open", async () => {
    const key = await generateKey();
    const env = await seal({ text: "hello" }, key, "chat");
    expect(await open(env, key, "chat")).toEqual({ text: "hello" });
  });

  it("exports a key to a 43-char base64url string and re-imports it", async () => {
    const key = await generateKey();
    const b64 = await exportKeyB64(key);
    expect(b64).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 raw bytes, unpadded base64url
    const reimported = await importKeyB64(b64);
    const env = await seal({ n: 1 }, key, "x");
    expect(await open(env, reimported, "x")).toEqual({ n: 1 });
  });

  it("produces a different envelope each time (random IV)", async () => {
    const key = await generateKey();
    const a = await seal({ text: "same" }, key, "chat");
    const b = await seal({ text: "same" }, key, "chat");
    expect(a).not.toBe(b);
  });

  it("fails to open a tampered envelope", async () => {
    const key = await generateKey();
    const env = await seal({ text: "hello" }, key, "chat");
    // Flip a byte in the ciphertext/tag region (decode → mutate → re-encode), so
    // the change survives base64 round-tripping rather than landing in discarded bits.
    const raw = atob(env.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 0xff; // corrupt the last byte of the GCM tag
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    const tampered = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    await expect(open(tampered, key, "chat")).rejects.toThrow();
  });

  it("fails to open with the wrong key", async () => {
    const env = await seal({ text: "secret" }, await generateKey(), "chat");
    await expect(open(env, await generateKey(), "chat")).rejects.toThrow();
  });

  it("fails to open when the AAD does not match (binds message type)", async () => {
    const key = await generateKey();
    const env = await seal({ emoji: "🎉" }, key, "reaction");
    await expect(open(env, key, "chat")).rejects.toThrow();
  });

  it("imports the same key from base64url with or without padding/standard alphabet", async () => {
    const key = await generateKey();
    const b64url = await exportKeyB64(key);
    const env = await seal({ ok: true }, key, "x");
    // Standard-alphabet, padded variant should import to the same key.
    const standard = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=";
    expect(await open(env, await importKeyB64(standard), "x")).toEqual({ ok: true });
  });
});
