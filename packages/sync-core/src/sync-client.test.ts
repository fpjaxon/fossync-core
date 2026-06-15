import { describe, it, expect } from "vitest";
import { SyncClient, type SocketLike } from "./sync-client";
import type { ServerMessage } from "./types";

class FakeSocket implements SocketLike {
  sent: string[] = [];
  private listeners: Record<string, Array<(ev?: unknown) => void>> = {};
  send(data: string) { this.sent.push(data); }
  close() { this.emit("close"); }
  addEventListener(type: string, cb: (ev?: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  emit(type: string, ev?: unknown) {
    for (const cb of this.listeners[type] ?? []) cb(ev);
  }
  serverSend(msg: ServerMessage) { this.emit("message", { data: JSON.stringify(msg) }); }
  sentMessages() { return this.sent.map((s) => JSON.parse(s)); }
}

function setup() {
  const sockets: FakeSocket[] = [];
  let now = 1000;
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  const client = new SyncClient({
    url: "ws://x/room/ABC",
    name: "Tester",
    pingCount: 3,
    createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    now: () => now,
    schedule: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; },
  });
  const latest = () => sockets[sockets.length - 1]!;
  return { sockets, latest, client, scheduled, setNow: (n: number) => (now = n) };
}

describe("SyncClient", () => {
  it("sends hello and a burst of pings on open", () => {
    const { latest, client } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    const msgs = socket.sentMessages();
    expect(msgs[0]).toEqual({ type: "hello", name: "Tester" });
    expect(msgs.filter((m) => m.type === "ping")).toHaveLength(3);
    expect(msgs[1]).toEqual({ type: "ping", t0: 1000 });
  });

  it("computes the offset from pong replies, keeping the lowest-rtt sample", () => {
    const { latest, client, setNow } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    setNow(1040);
    socket.serverSend({ type: "pong", t0: 1000, t1: 1500 }); // rtt 40, offset 480
    setNow(1020);
    socket.serverSend({ type: "pong", t0: 1000, t1: 1490 }); // rtt 20, offset 480 (best)
    setNow(1100);
    socket.serverSend({ type: "pong", t0: 1000, t1: 1505 }); // rtt 100
    expect(client.getOffset()).toBe(480);
  });

  it("tracks the authoritative snapshot and state updates", () => {
    const { latest, client } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.serverSend({
      type: "welcome",
      youId: "me",
      snapshot: {
        controlMode: "everyone",
        hostId: "me",
        playback: { paused: true, anchorMediaTime: 0, anchorServerTime: 1000, rate: 1 },
        participants: [{ id: "me", role: "host", name: "Tester" }],
      },
    });
    expect(client.getYouId()).toBe("me");
    expect(client.getControlMode()).toBe("everyone");

    socket.serverSend({
      type: "state",
      controlMode: "host",
      hostId: "me",
      playback: { paused: false, anchorMediaTime: 12, anchorServerTime: 2000, rate: 1 },
    });
    expect(client.getPlayback()).toEqual({ paused: false, anchorMediaTime: 12, anchorServerTime: 2000, rate: 1 });
    expect(client.getControlMode()).toBe("host");
  });

  it("serializes control and setMode commands", () => {
    const { latest, client } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.sent.length = 0;
    client.sendControl("seek", 33.5);
    client.setMode("host");
    expect(socket.sentMessages()).toEqual([
      { type: "control", action: "seek", mediaTime: 33.5 },
      { type: "setMode", mode: "host" },
    ]);
  });

  it("schedules a base-delay reconnect after an unexpected close", () => {
    const { latest, client, scheduled } = setup();
    client.connect();
    latest().emit("open");
    latest().emit("close");
    expect(scheduled.filter((s) => s.ms === 500)).toHaveLength(1);
  });

  it("resets the reconnect backoff after a healthy reconnect", () => {
    const { latest, client, scheduled } = setup();
    client.connect();
    latest().emit("open");
    latest().emit("close"); // schedule @500, internal backoff -> 1000
    scheduled.filter((s) => s.ms === 500).at(-1)!.fn(); // fire reconnect -> fresh socket
    latest().emit("open"); // healthy -> backoff reset to 500
    latest().emit("close"); // should schedule @500 again, not @1000
    expect(scheduled.filter((s) => s.ms === 500)).toHaveLength(2);
    expect(scheduled.some((s) => s.ms === 1000)).toBe(false);
  });

  it("does not reconnect on an intentional close and sends bye", () => {
    const { latest, client, scheduled } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.sent.length = 0;
    client.close();
    expect(socket.sentMessages()).toContainEqual({ type: "bye" });
    expect(scheduled.filter((s) => s.ms === 500)).toHaveLength(0);
  });

  it("periodically re-syncs the clock", () => {
    const { latest, client, scheduled } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open"); // initial burst + schedules a resync at 30000
    socket.sent.length = 0;
    scheduled.filter((s) => s.ms === 30000).at(-1)!.fn(); // fire the resync
    expect(socket.sentMessages().filter((m) => m.type === "ping")).toHaveLength(3);
  });
});
