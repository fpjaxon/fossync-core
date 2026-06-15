import { describe, it, expect } from "vitest";
import { roomSocketUrl, newRoomUrl } from "./urls";

describe("urls", () => {
  it("builds a room socket url, trimming and upper-casing the code", () => {
    expect(roomSocketUrl("  test01 ")).toBe("wss://fossync.cloud/room/TEST01");
  });

  it("builds the new-room url", () => {
    expect(newRoomUrl()).toBe("https://fossync.cloud/new");
  });
});
