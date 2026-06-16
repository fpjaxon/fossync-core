import { describe, it, expect } from "vitest";
import { compareVersions, emptyManifest, upsertVersion } from "./updates.mjs";

const ID = "fossync@floatpoint.net";

describe("compareVersions", () => {
  it("orders numerically", () => {
    expect(compareVersions("0.0.10", "0.0.9")).toBeGreaterThan(0);
    expect(compareVersions("0.0.7", "0.0.7")).toBe(0);
    expect(compareVersions("0.0.7", "0.0.9")).toBeLessThan(0);
  });
});

describe("upsertVersion", () => {
  it("adds a new version, sorted ascending", () => {
    let m = emptyManifest(ID);
    m = upsertVersion(m, ID, { version: "0.0.8", update_link: "u8", update_hash: "sha256:8" });
    m = upsertVersion(m, ID, { version: "0.0.7", update_link: "u7", update_hash: "sha256:7" });
    m = upsertVersion(m, ID, { version: "0.0.10", update_link: "u10", update_hash: "sha256:10" });
    m = upsertVersion(m, ID, { version: "0.0.9", update_link: "u9", update_hash: "sha256:9" });
    const versions = m.addons[ID].updates.map((u) => u.version);
    expect(versions).toEqual(["0.0.7", "0.0.8", "0.0.9", "0.0.10"]);
  });

  it("replaces an existing version instead of duplicating it", () => {
    let m = emptyManifest(ID);
    m = upsertVersion(m, ID, { version: "0.0.7", update_link: "old", update_hash: "sha256:old" });
    m = upsertVersion(m, ID, { version: "0.0.7", update_link: "new", update_hash: "sha256:new" });
    expect(m.addons[ID].updates).toHaveLength(1);
    expect(m.addons[ID].updates[0].update_link).toBe("new");
  });

  it("preserves other add-on ids already present", () => {
    const m0 = { addons: { other: { updates: [{ version: "1.0.0", update_link: "x" }] } } };
    const m = upsertVersion(m0, ID, { version: "0.0.7", update_link: "u7" });
    expect(m.addons.other.updates).toHaveLength(1);
    expect(m.addons[ID].updates).toHaveLength(1);
  });
});
