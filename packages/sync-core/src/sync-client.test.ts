import { describe, it, expect, vi } from "vitest";
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
  const socket = new FakeSocket();
  let now = 1000;
  const scheduled: Array<{ fn: () => void; ms: number }> = [];
  const client = new SyncClient({
    url: "ws://x/room/ABC",
    name: "Tester",
    pingCount: 3,
    createSocket: () => socket,
    now: () => now,
    schedule: (fn, ms) => { scheduled.push({ fn, ms }); return scheduled.length; },
  });
  return { socket, client, scheduled, setNow: (n: number) => (now = n) };
}

describe("SyncClient", () => {
  it("sends hello and a burst of pings on open", () => {
    const { socket, client } = setup();
    client.connect();
    socket.emit("open");
    const msgs = socket.sentMessages();
    expect(msgs[0]).toEqual({ type: "hello", name: "Tester" });
    expect(msgs.filter((m) => m.type === "ping")).toHaveLength(3);
    expect(msgs[1]).toEqual({ type: "ping", t0: 1000 });
  });

  it("computes the offset from pong replies, keeping the lowest-rtt sample", () => {
    const { socket, client, setNow } = setup();
    client.connect();
    socket.emit("open"); // 3 pings sent at t0=1000
    setNow(1040);
    socket.serverSend({ type: "pong", t0: 1000, t1: 1500 }); // rtt 40, offset 480
    setNow(1020);
    socket.serverSend({ type: "pong", t0: 1000, t1: 1490 }); // rtt 20, offset 480 (best)
    setNow(1100);
    socket.serverSend({ type: "pong", t0: 1000, t1: 1505 }); // rtt 100
    expect(client.getOffset()).toBe(480);
  });

  it("tracks the authoritative snapshot and state updates", () => {
    const { socket, client } = setup();
    client.connect();
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
    const { socket, client } = setup();
    client.connect();
    socket.emit("open");
    socket.sent.length = 0;
    client.sendControl("seek", 33.5);
    client.setMode("host");
    expect(socket.sentMessages()).toEqual([
      { type: "control", action: "seek", mediaTime: 33.5 },
      { type: "setMode", mode: "host" },
    ]);
  });

  it("schedules a reconnect after an unexpected close", () => {
    const { socket, client, scheduled } = setup();
    client.connect();
    socket.emit("open");
    socket.emit("close");
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.ms).toBeGreaterThan(0);
  });
});
