import { describe, it, expect } from "vitest";
import { roomSocketUrl, newRoomUrl } from "./urls";

describe("urls", () => {
  it("builds the room socket URL from a relay ws origin, trimming + upper-casing the code", () => {
    expect(roomSocketUrl("wss://fossync.cloud", "  test01 ")).toBe("wss://fossync.cloud/room/TEST01");
    expect(roomSocketUrl("wss://my-relay.example.com", "ABC123")).toBe("wss://my-relay.example.com/room/ABC123");
  });

  it("builds the new-room URL from a relay http origin", () => {
    expect(newRoomUrl("https://fossync.cloud")).toBe("https://fossync.cloud/new");
  });
});
