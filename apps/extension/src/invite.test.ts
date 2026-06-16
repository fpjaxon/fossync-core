import { describe, it, expect } from "vitest";
import { buildInviteUrl, parseRoomCode, parseInvite, removeInvite, INVITE_PARAM } from "./invite";

describe("buildInviteUrl", () => {
  it("appends #vsync=CODE to a plain page URL", () => {
    expect(buildInviteUrl("http://localhost:5173/", "ABC123")).toBe("http://localhost:5173/#vsync=ABC123");
  });

  it("preserves path + query and replaces any existing hash", () => {
    expect(buildInviteUrl("http://localhost:5173/?room=X#vsync=OLD", "NEW")).toBe(
      "http://localhost:5173/?room=X#vsync=NEW",
    );
  });

  it("appends &k=KEY when an encryption key is given (encrypted session)", () => {
    expect(buildInviteUrl("http://localhost:5173/", "ABC123", "thekey_-09")).toBe(
      "http://localhost:5173/#vsync=ABC123&k=thekey_-09",
    );
  });
});

describe("parseInvite", () => {
  it("returns code and key from an encrypted invite", () => {
    expect(parseInvite("#vsync=ABC123&k=thekey_-09")).toEqual({ code: "ABC123", key: "thekey_-09" });
  });

  it("returns a null key for a plaintext invite", () => {
    expect(parseInvite("#vsync=ABC123")).toEqual({ code: "ABC123", key: null });
  });

  it("returns null when there is no code", () => {
    expect(parseInvite("#k=thekey_-09")).toBeNull();
    expect(parseInvite("")).toBeNull();
  });
});

describe("parseRoomCode", () => {
  it("reads the code from a hash with a leading #", () => {
    expect(parseRoomCode("#vsync=ABC123")).toBe("ABC123");
  });

  it("reads the code without a leading #", () => {
    expect(parseRoomCode("vsync=ABC")).toBe("ABC");
  });

  it("returns null when the param is absent or empty", () => {
    expect(parseRoomCode("#other=1")).toBeNull();
    expect(parseRoomCode("")).toBeNull();
  });

  it("exposes the param name it uses", () => {
    expect(INVITE_PARAM).toBe("vsync");
  });
});

describe("removeInvite", () => {
  it("strips the #vsync hash, preserving path and query", () => {
    expect(removeInvite("http://localhost:5173/?room=X#vsync=ABC")).toBe("http://localhost:5173/?room=X");
  });

  it("removes a plain #vsync hash", () => {
    expect(removeInvite("http://localhost:5173/#vsync=ABC")).toBe("http://localhost:5173/");
  });

  it("returns the url unchanged when there is no hash (idempotent)", () => {
    expect(removeInvite("http://localhost:5173/")).toBe("http://localhost:5173/");
  });

  it("also strips the encryption key, so it never lingers in the URL bar/history", () => {
    expect(removeInvite("http://localhost:5173/#vsync=ABC&k=thekey_-09")).toBe("http://localhost:5173/");
  });
});
