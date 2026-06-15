import { describe, it, expect } from "vitest";
import { isOfficialRelay, WORKER_WS_ORIGIN, OFFICIAL_RELAY_WS_ORIGIN } from "./config";

describe("relay config", () => {
  it("the official build targets the official relay, so the warning never shows", () => {
    expect(WORKER_WS_ORIGIN).toBe(OFFICIAL_RELAY_WS_ORIGIN);
    expect(isOfficialRelay).toBe(true);
  });
});
