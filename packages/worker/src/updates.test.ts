import { describe, it, expect } from "vitest";
import { compareVersions, pickLatest, type UpdatesManifest } from "./updates";

describe("compareVersions", () => {
  it("orders by numeric segments, not lexically", () => {
    expect(compareVersions("0.0.10", "0.0.9")).toBeGreaterThan(0);
    expect(compareVersions("0.0.9", "0.0.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.0.7", "0.0.7")).toBe(0);
  });
});

describe("pickLatest", () => {
  const manifest: UpdatesManifest = {
    addons: {
      "fossync@floatpoint.net": {
        updates: [
          { version: "0.0.7", update_link: "https://fossync.cloud/download/fossync-0.0.7.xpi" },
          { version: "0.0.10", update_link: "https://fossync.cloud/download/fossync-0.0.10.xpi" },
          { version: "0.0.9", update_link: "https://fossync.cloud/download/fossync-0.0.9.xpi" },
        ],
      },
    },
  };

  it("returns the highest-version update_link", () => {
    expect(pickLatest(manifest)).toBe("https://fossync.cloud/download/fossync-0.0.10.xpi");
  });

  it("returns null for an empty or missing add-on", () => {
    expect(pickLatest({ addons: {} })).toBeNull();
    expect(pickLatest({ addons: { "fossync@floatpoint.net": { updates: [] } } })).toBeNull();
  });
});
