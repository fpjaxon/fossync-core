import { describe, it, expect } from "vitest";
import { SyncClient, type SocketLike } from "./sync-client";
import type { ServerMessage } from "./types";
import { generateKey, seal, open } from "./e2ee";

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
        content: "",
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

  it("exposes the actor that caused the latest state change", () => {
    const { latest, client } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    expect(client.getActor()).toBeNull();
    socket.serverSend({
      type: "state",
      controlMode: "everyone",
      hostId: "me",
      playback: { paused: false, anchorMediaTime: 5, anchorServerTime: 1000, rate: 1 },
      actor: { id: "u2", name: "Bob" },
    });
    expect(client.getActor()).toEqual({ id: "u2", name: "Bob" });
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

  it("includes the current media time in hello when getMediaTime is provided", () => {
    const sockets: FakeSocket[] = [];
    const client = new SyncClient({
      url: "ws://x/room/ABC",
      name: "Host",
      pingCount: 1,
      createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
      now: () => 1000,
      schedule: () => 0,
      getMediaTime: () => 87.5,
    });
    client.connect();
    sockets[0]!.emit("open");
    expect(sockets[0]!.sentMessages()[0]).toEqual({ type: "hello", name: "Host", mediaTime: 87.5 });
  });

  it("sends chat and reactions, and surfaces incoming ones via callbacks", () => {
    const { latest, client } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.sent.length = 0;
    client.sendChat("hello there");
    client.sendReaction("😂");
    expect(socket.sentMessages()).toEqual([
      { type: "chat", text: "hello there" },
      { type: "reaction", emoji: "😂" },
    ]);

    let chat: { from: { id: string; name?: string }; text: string } | null = null;
    let reaction: { from: { id: string; name?: string }; emoji: string } | null = null;
    client.onChat((m) => (chat = m));
    client.onReaction((m) => (reaction = m));
    socket.serverSend({ type: "chat", from: { id: "u2", name: "Bob" }, text: "hi" });
    socket.serverSend({ type: "reaction", from: { id: "u2", name: "Bob" }, emoji: "🔥" });
    expect(chat).toEqual({ from: { id: "u2", name: "Bob" }, text: "hi" });
    expect(reaction).toEqual({ from: { id: "u2", name: "Bob" }, emoji: "🔥" });
  });

  it("sends content changes and surfaces incoming ones via onContent", () => {
    const { latest, client } = setup();
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.sent.length = 0;
    client.setContent("https://www.crunchyroll.com/watch/EP2/x");
    expect(socket.sentMessages()).toEqual([{ type: "setContent", url: "https://www.crunchyroll.com/watch/EP2/x" }]);

    let got: string | null = null;
    client.onContent((u) => (got = u));
    socket.serverSend({ type: "content", url: "https://www.crunchyroll.com/watch/EP3/y", from: { id: "u2", name: "Bob" } });
    expect(got).toBe("https://www.crunchyroll.com/watch/EP3/y");
    expect(client.getContent()).toBe("https://www.crunchyroll.com/watch/EP3/y");
  });
});

// Let the client's async seal/open chains settle (several macrotasks for safety).
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function setupEnc(key: CryptoKey) {
  const sockets: FakeSocket[] = [];
  let now = 1000;
  const client = new SyncClient({
    url: "ws://x/room/ABC",
    name: "Tester",
    pingCount: 1,
    key,
    createSocket: () => { const s = new FakeSocket(); sockets.push(s); return s; },
    now: () => now,
    schedule: () => 0,
  });
  return { sockets, client, latest: () => sockets[sockets.length - 1]! };
}

describe("SyncClient encrypted sessions", () => {
  it("sends an encrypted hello (enc + sealed name) instead of a plaintext name", async () => {
    const key = await generateKey();
    const { latest, client } = setupEnc(key);
    client.connect();
    const socket = latest();
    socket.emit("open");
    await flush();
    const hello = socket.sentMessages().find((m) => m.type === "hello");
    expect(hello.enc).toBe(true);
    expect(hello.name).toBeUndefined();
    expect(await open(hello.c, key, "name")).toEqual({ name: "Tester" });
  });

  it("seals outgoing chat, reactions, control and content", async () => {
    const key = await generateKey();
    const { latest, client } = setupEnc(key);
    client.connect();
    const socket = latest();
    socket.emit("open");
    await flush();
    socket.sent.length = 0;

    client.sendChat("hi");
    client.sendReaction("🔥");
    client.sendControl("play", 12);
    client.setContent("https://x.test/ep");
    await flush();

    const sent = socket.sentMessages();
    const chat = sent.find((m) => m.type === "chat");
    const rx = sent.find((m) => m.type === "reaction");
    const ctrl = sent.find((m) => m.type === "control");
    const content = sent.find((m) => m.type === "setContent");
    expect(chat.text).toBeUndefined();
    expect(await open(chat.c, key, "chat")).toEqual({ text: "hi" });
    expect(await open(rx.c, key, "reaction")).toEqual({ emoji: "🔥" });
    expect(await open(ctrl.c, key, "control")).toEqual({ action: "play", mediaTime: 12 });
    expect(await open(content.c, key, "content")).toEqual({ url: "https://x.test/ep" });
  });

  it("decrypts encState into a playback timeline anchored on the server clock", async () => {
    const key = await generateKey();
    const { latest, client } = setupEnc(key);
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.serverSend({
      type: "welcomeEnc",
      youId: "me",
      snapshot: {
        controlMode: "everyone",
        hostId: "me",
        participants: [{ id: "me", role: "host", nameBlob: await seal({ name: "Tester" }, key, "name") }],
        encPlayback: { blob: null, anchorServerTime: 1000 },
        contentBlob: null,
      },
    });
    socket.serverSend({
      type: "encState",
      controlMode: "everyone",
      hostId: "me",
      encPlayback: { blob: await seal({ action: "play", mediaTime: 12 }, key, "control"), anchorServerTime: 2000 },
    });
    await flush();
    expect(client.getPlayback()).toEqual({ paused: false, anchorMediaTime: 12, anchorServerTime: 2000, rate: 1 });
  });

  it("decrypts encChat and resolves the sender name from the roster", async () => {
    const key = await generateKey();
    const { latest, client } = setupEnc(key);
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.serverSend({
      type: "welcomeEnc",
      youId: "me",
      snapshot: {
        controlMode: "everyone",
        hostId: "me",
        participants: [{ id: "u2", role: "host", nameBlob: await seal({ name: "Bob" }, key, "name") }],
        encPlayback: { blob: null, anchorServerTime: 1000 },
        contentBlob: null,
      },
    });
    let chat: { from: { id: string; name?: string }; text: string } | null = null;
    client.onChat((m) => (chat = m));
    socket.serverSend({ type: "encChat", from: { id: "u2" }, c: await seal({ text: "hi" }, key, "chat") });
    await flush();
    expect(chat).toEqual({ from: { id: "u2", name: "Bob" }, text: "hi" });
  });

  it("surfaces an undecryptable message (wrong key / tampered) without firing the chat callback", async () => {
    const key = await generateKey();
    const otherKey = await generateKey();
    const { latest, client } = setupEnc(key);
    client.connect();
    const socket = latest();
    socket.emit("open");
    socket.serverSend({
      type: "welcomeEnc",
      youId: "me",
      snapshot: {
        controlMode: "everyone",
        hostId: "me",
        participants: [],
        encPlayback: { blob: null, anchorServerTime: 1000 },
        contentBlob: null,
      },
    });
    let chat: unknown = null;
    let warned = false;
    client.onChat((m) => (chat = m));
    client.onUndecryptable(() => (warned = true));
    socket.serverSend({ type: "encChat", from: { id: "u2" }, c: await seal({ text: "secret" }, otherKey, "chat") });
    await flush();
    expect(chat).toBeNull();
    expect(warned).toBe(true);
  });
});
