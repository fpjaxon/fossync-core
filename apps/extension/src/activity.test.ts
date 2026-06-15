import { describe, it, expect } from "vitest";
import { formatTimecode, derivePresenceEvents, deriveStateEvents, type StateSnap } from "./activity";
import type { Participant, Playback } from "@fossync/sync-core";

const P = (id: string, name: string, role: "host" | "guest" = "guest"): Participant => ({ id, name, role });
const pb = (over: Partial<Playback> = {}): Playback => ({ paused: true, anchorMediaTime: 0, anchorServerTime: 0, rate: 1, ...over });

describe("formatTimecode", () => {
  it("formats below and above an hour", () => {
    expect(formatTimecode(0)).toBe("0:00");
    expect(formatTimecode(65)).toBe("1:05");
    expect(formatTimecode(600)).toBe("10:00");
    expect(formatTimecode(3725)).toBe("1:02:05");
  });
  it("clamps junk to 0:00", () => {
    expect(formatTimecode(NaN)).toBe("0:00");
    expect(formatTimecode(-5)).toBe("0:00");
  });
});

describe("derivePresenceEvents", () => {
  it("emits nothing for the baseline snapshot", () => {
    expect(derivePresenceEvents(null, [P("a", "Alice")])).toEqual([]);
  });
  it("detects joins and leaves by id, naming each", () => {
    const prev = [P("a", "Alice"), P("b", "Bob")];
    const curr = [P("a", "Alice"), P("c", "Cara")];
    expect(derivePresenceEvents(prev, curr)).toEqual([
      { kind: "join", text: "Cara joined" },
      { kind: "leave", text: "Bob left" },
    ]);
  });
  it("emits nothing when the roster is unchanged", () => {
    const list = [P("a", "Alice")];
    expect(derivePresenceEvents(list, [...list])).toEqual([]);
  });
});

describe("deriveStateEvents", () => {
  const nameOf = (id: string) => ({ a: "Alice", b: "Bob" }[id] ?? null);

  it("emits nothing for the baseline snapshot", () => {
    expect(deriveStateEvents(null, { playback: pb(), hostId: "a" }, null, "me", nameOf)).toEqual([]);
  });

  it("attributes pause and resume to the actor", () => {
    const prev: StateSnap = { playback: pb({ paused: false, anchorMediaTime: 10 }), hostId: "a" };
    const paused = deriveStateEvents(prev, { playback: pb({ paused: true, anchorMediaTime: 10 }), hostId: "a" }, { id: "b", name: "Bob" }, "me", nameOf);
    expect(paused).toEqual([{ kind: "pause", text: "Bob paused" }]);

    const resumed = deriveStateEvents({ playback: pb({ paused: true }), hostId: "a" }, { playback: pb({ paused: false }), hostId: "a" }, { id: "b", name: "Bob" }, "me", nameOf);
    expect(resumed).toEqual([{ kind: "play", text: "Bob resumed" }]);
  });

  it("reports a seek with a timecode, and says 'You' for your own action", () => {
    const prev: StateSnap = { playback: pb({ paused: false, anchorMediaTime: 10 }), hostId: "a" };
    const curr: StateSnap = { playback: pb({ paused: false, anchorMediaTime: 754 }), hostId: "a" };
    expect(deriveStateEvents(prev, curr, { id: "me", name: "Me" }, "me", nameOf)).toEqual([
      { kind: "seek", text: "You skipped to 12:34" },
    ]);
  });

  it("announces a host handoff", () => {
    const prev: StateSnap = { playback: pb(), hostId: "a" };
    const curr: StateSnap = { playback: pb(), hostId: "b" };
    expect(deriveStateEvents(prev, curr, null, "me", nameOf)).toEqual([
      { kind: "host", text: "Bob is now host" },
    ]);
  });

  it("emits nothing when neither playback nor host changed", () => {
    const snap: StateSnap = { playback: pb({ anchorMediaTime: 5 }), hostId: "a" };
    expect(deriveStateEvents(snap, { ...snap, playback: pb({ anchorMediaTime: 5 }) }, { id: "b", name: "Bob" }, "me", nameOf)).toEqual([]);
  });
});
