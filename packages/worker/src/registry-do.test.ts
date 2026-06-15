import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

const ns = () => (env as unknown as { REGISTRY: DurableObjectNamespace }).REGISTRY;
const stubFor = (name: string) => ns().get(ns().idFromName(name));

async function op(stub: DurableObjectStub, path: string, room?: string): Promise<number> {
  const init = room ? { method: "POST", body: JSON.stringify({ room }) } : undefined;
  const res = await stub.fetch("https://registry" + path, init);
  return ((await res.json()) as { count: number }).count;
}

describe("RoomRegistry", () => {
  it("counts active rooms, idempotent on acquire and tolerant of double release", async () => {
    const s = stubFor("reg-test-basic");
    expect(await op(s, "/count")).toBe(0);
    expect(await op(s, "/acquire", "R1")).toBe(1);
    expect(await op(s, "/acquire", "R1")).toBe(1); // same room → no double count
    expect(await op(s, "/acquire", "R2")).toBe(2);
    expect(await op(s, "/release", "R1")).toBe(1);
    expect(await op(s, "/release", "R1")).toBe(1); // releasing again is harmless
    expect(await op(s, "/count")).toBe(1);
  });
});
