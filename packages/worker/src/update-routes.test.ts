import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SELF, env } from "cloudflare:test";
import { ADDON_ID } from "./updates";

const builds = (env as unknown as { BUILDS: R2Bucket }).BUILDS;

const MANIFEST = {
  addons: {
    [ADDON_ID]: {
      updates: [
        {
          version: "0.0.7",
          update_link: "https://fossync.cloud/download/fossync-0.0.7.xpi",
          update_hash: "sha256:abc123",
        },
        {
          version: "0.0.8",
          update_link: "https://fossync.cloud/download/fossync-0.0.8.xpi",
          update_hash: "sha256:def456",
        },
      ],
    },
  },
};

describe("update routes", () => {
  beforeAll(async () => {
    await builds.put("updates.json", JSON.stringify(MANIFEST));
    await builds.put("fossync-0.0.8.xpi", "fake-xpi-bytes");
  });

  afterAll(async () => {
    await builds.delete("updates.json");
    await builds.delete("fossync-0.0.8.xpi");
  });

  it("serves updates.json as application/json", async () => {
    const res = await SELF.fetch("https://fossync.cloud/updates.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as typeof MANIFEST;
    expect(body.addons[ADDON_ID].updates).toHaveLength(2);
  });

  it("serves a versioned .xpi as application/x-xpinstall", async () => {
    const res = await SELF.fetch("https://fossync.cloud/download/fossync-0.0.8.xpi");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-xpinstall");
    expect(await res.text()).toBe("fake-xpi-bytes");
  });

  it("404s a missing .xpi", async () => {
    const res = await SELF.fetch("https://fossync.cloud/download/fossync-9.9.9.xpi");
    expect(res.status).toBe(404);
  });

  it("rejects a malformed download key", async () => {
    const res = await SELF.fetch("https://fossync.cloud/download/evil.xpi");
    expect(res.status).toBe(404);
  });

  it("redirects /latest.xpi to the highest-version download link", async () => {
    const res = await SELF.fetch("https://fossync.cloud/latest.xpi", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://fossync.cloud/download/fossync-0.0.8.xpi",
    );
  });
});
