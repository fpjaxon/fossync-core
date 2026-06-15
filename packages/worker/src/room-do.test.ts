import { describe, it, expect, vi } from "vitest";
import { SELF, env, runInDurableObject } from "cloudflare:test";
import type { ServerMessage, ClientMessage } from "@fossync/sync-core";

async function connect(code: string): Promise<WebSocket> {
  const res = await SELF.fetch(`https://example.com/room/${code}`, {
    headers: { Upgrade: "websocket" },
  });
  const ws = res.webSocket;
  if (!ws) throw new Error(`no websocket (status ${res.status})`);
  ws.accept();
  return ws as unknown as WebSocket;
}

function send(ws: WebSocket, msg: ClientMessage) {
  ws.send(JSON.stringify(msg));
}

function nextMessage(ws: WebSocket, predicate: (m: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve) => {
    const handler = (e: MessageEvent) => {
      const m = JSON.parse(e.data as string) as ServerMessage;
      if (predicate(m)) {
        ws.removeEventListener("message", handler as EventListener);
        resolve(m);
      }
    };
    ws.addEventListener("message", handler as EventListener);
  });
}

describe("RoomDurableObject join", () => {
  it("welcomes the first joiner as host", async () => {
    const a = await connect("JOIN01");
    send(a, { type: "hello", name: "Alice" });
    const welcome = await nextMessage(a, (m) => m.type === "welcome");
    if (welcome.type !== "welcome") throw new Error("bad");
    expect(welcome.snapshot.hostId).toBe(welcome.youId);
    expect(welcome.snapshot.controlMode).toBe("everyone");
    a.close();
  });

  it("broadcasts presence when a second participant joins", async () => {
    const a = await connect("JOIN02");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    const presenceP = nextMessage(a, (m) => m.type === "presence" && m.participants.length === 2);
    const b = await connect("JOIN02");
    send(b, { type: "hello", name: "Bob" });

    const presence = await presenceP;
    if (presence.type !== "presence") throw new Error("bad");
    const names = presence.participants.map((p) => p.name).sort();
    expect(names).toEqual(["Alice", "Bob"]);
    a.close();
    b.close();
  });
});

describe("RoomDurableObject clock", () => {
  it("replies to ping with a pong echoing t0 and stamping t1", async () => {
    const a = await connect("PING01");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    send(a, { type: "ping", t0: 12345 });
    const pong = await nextMessage(a, (m) => m.type === "pong");
    if (pong.type !== "pong") throw new Error("bad");
    expect(pong.t0).toBe(12345);
    expect(typeof pong.t1).toBe("number");
    a.close();
  });
});

describe("RoomDurableObject control", () => {
  it("broadcasts a new playing anchor to other participants on play", async () => {
    const a = await connect("CTRL01");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    const b = await connect("CTRL01");
    send(b, { type: "hello", name: "Bob" });
    await nextMessage(b, (m) => m.type === "welcome");

    const stateP = nextMessage(b, (m) => m.type === "state");
    send(a, { type: "control", action: "play", mediaTime: 42 });
    const state = await stateP;
    if (state.type !== "state") throw new Error("bad");
    expect(state.playback.paused).toBe(false);
    expect(state.playback.anchorMediaTime).toBe(42);
    expect(state.playback.anchorServerTime).toBeGreaterThan(0);
    a.close();
    b.close();
  });

  it("tags the broadcast state with who performed the control", async () => {
    const a = await connect("ACTOR1");
    send(a, { type: "hello", name: "Alice" });
    const welcomeA = await nextMessage(a, (m) => m.type === "welcome");
    if (welcomeA.type !== "welcome") throw new Error("bad");

    const b = await connect("ACTOR1");
    send(b, { type: "hello", name: "Bob" });
    await nextMessage(b, (m) => m.type === "welcome");

    const stateP = nextMessage(b, (m) => m.type === "state");
    send(a, { type: "control", action: "seek", mediaTime: 30 });
    const state = await stateP;
    if (state.type !== "state") throw new Error("bad");
    expect(state.actor).toEqual({ id: welcomeA.youId, name: "Alice" });
    a.close();
    b.close();
  });
});

describe("RoomDurableObject authorization", () => {
  it("rejects control from a non-host while in host mode", async () => {
    const a = await connect("AUTH01"); // host
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    const b = await connect("AUTH01"); // guest
    send(b, { type: "hello", name: "Bob" });
    await nextMessage(b, (m) => m.type === "welcome");

    send(a, { type: "setMode", mode: "host" });
    await nextMessage(b, (m) => m.type === "state" && m.controlMode === "host");

    const errP = nextMessage(b, (m) => m.type === "error");
    send(b, { type: "control", action: "play", mediaTime: 1 });
    const err = await errP;
    expect(err.type).toBe("error");
    a.close();
    b.close();
  });

  it("rejects setMode from a non-host", async () => {
    const a = await connect("AUTH02");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");
    const b = await connect("AUTH02");
    send(b, { type: "hello", name: "Bob" });
    await nextMessage(b, (m) => m.type === "welcome");

    const errP = nextMessage(b, (m) => m.type === "error");
    send(b, { type: "setMode", mode: "host" });
    expect((await errP).type).toBe("error");
    a.close();
    b.close();
  });
});

describe("RoomDurableObject host promotion", () => {
  it("promotes the remaining participant when the host leaves", async () => {
    const a = await connect("HOST01"); // host
    send(a, { type: "hello", name: "Alice" });
    const welcomeA = await nextMessage(a, (m) => m.type === "welcome");
    if (welcomeA.type !== "welcome") throw new Error("bad");

    const b = await connect("HOST01"); // guest
    send(b, { type: "hello", name: "Bob" });
    const welcomeB = await nextMessage(b, (m) => m.type === "welcome");
    if (welcomeB.type !== "welcome") throw new Error("bad");

    const stateP = nextMessage(b, (m) => m.type === "state" && m.hostId === welcomeB.youId);
    a.close(); // host leaves
    const state = await stateP;
    if (state.type !== "state") throw new Error("bad");
    expect(state.hostId).toBe(welcomeB.youId);
    b.close();
  });

  it("does not promote a socket that never completed hello", async () => {
    const a = await connect("PROMO01"); // host
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    const b = await connect("PROMO01"); // helloed guest
    send(b, { type: "hello", name: "Bob" });
    const welcomeB = await nextMessage(b, (m) => m.type === "welcome");
    if (welcomeB.type !== "welcome") throw new Error("bad");

    const c = await connect("PROMO01"); // connects but never sends hello

    const stateP = nextMessage(b, (m) => m.type === "state");
    a.close(); // host leaves
    const state = await stateP;
    if (state.type !== "state") throw new Error("bad");
    expect(state.hostId).toBe(welcomeB.youId); // Bob, never the un-helloed socket
    b.close();
    c.close();
  });
});

describe("RoomDurableObject input validation", () => {
  it("rejects a control with a non-finite mediaTime", async () => {
    const a = await connect("VAL01");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    a.send(JSON.stringify({ type: "control", action: "play" })); // missing mediaTime
    const err = await nextMessage(a, (m) => m.type === "error");
    expect(err.type).toBe("error");
    a.close();
  });

  it("rejects an invalid control mode (so the host guard cannot fail open)", async () => {
    const a = await connect("VAL02"); // host
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    a.send(JSON.stringify({ type: "setMode", mode: "garbage" }));
    const err = await nextMessage(a, (m) => m.type === "error");
    expect(err.type).toBe("error");
    a.close();
  });

  it("ignores messages from a socket that has not sent hello", async () => {
    const a = await connect("VAL03");
    send(a, { type: "ping", t0: 999 }); // gated — must be ignored, no pong
    send(a, { type: "hello", name: "Alice" });
    const first = await nextMessage(a, () => true); // the gated ping must not have produced a pong first
    expect(first.type).toBe("welcome");
    a.close();
  });
});

describe("RoomDurableObject ephemerality", () => {
  it("discards the persisted room record once the last participant leaves", async () => {
    const ROOM = (env as unknown as { ROOM: DurableObjectNamespace }).ROOM;
    const stub = ROOM.get(ROOM.idFromName("EPHEM01"));

    const a = await connect("EPHEM01");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");

    // Drive the room into a clearly non-default, persisted state.
    send(a, { type: "control", action: "play", mediaTime: 42 });
    send(a, { type: "setMode", mode: "host" });
    await nextMessage(a, (m) => m.type === "state" && m.controlMode === "host");

    // While the room is live, its state is persisted.
    await runInDurableObject(stub, async (_instance, state) => {
      expect(await state.storage.get("room")).toBeTruthy();
    });

    a.close(); // last participant leaves -> the room no longer exists

    // Cleanup runs asynchronously; the persisted record must be wiped so nothing
    // about the room survives the session.
    await vi.waitFor(async () => {
      await runInDurableObject(stub, async (_instance, state) => {
        expect(await state.storage.get("room")).toBeUndefined();
      });
    });
  });
});

describe("RoomDurableObject seeding + chat + reactions", () => {
  it("anchors a fresh room at the host's media time from hello (not 0)", async () => {
    const a = await connect("SEED01");
    send(a, { type: "hello", name: "Alice", mediaTime: 123 });
    const welcome = await nextMessage(a, (m) => m.type === "welcome");
    if (welcome.type !== "welcome") throw new Error("bad");
    expect(welcome.snapshot.playback.anchorMediaTime).toBe(123);
    expect(welcome.snapshot.playback.paused).toBe(true);
    a.close();
  });

  it("relays chat to other participants with attribution, trimmed", async () => {
    const a = await connect("CHAT01");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");
    const b = await connect("CHAT01");
    send(b, { type: "hello", name: "Bob" });
    await nextMessage(b, (m) => m.type === "welcome");

    const chatP = nextMessage(b, (m) => m.type === "chat");
    send(a, { type: "chat", text: "  hello world  " });
    const chat = await chatP;
    if (chat.type !== "chat") throw new Error("bad");
    expect(chat.text).toBe("hello world");
    expect(chat.from.name).toBe("Alice");
    a.close();
    b.close();
  });

  it("relays reactions with attribution", async () => {
    const a = await connect("RX01");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");
    const b = await connect("RX01");
    send(b, { type: "hello", name: "Bob" });
    await nextMessage(b, (m) => m.type === "welcome");

    const rxP = nextMessage(b, (m) => m.type === "reaction");
    send(a, { type: "reaction", emoji: "🔥" });
    const rx = await rxP;
    if (rx.type !== "reaction") throw new Error("bad");
    expect(rx.emoji).toBe("🔥");
    expect(rx.from.name).toBe("Alice");
    a.close();
    b.close();
  });
});

describe("RoomDurableObject content sync", () => {
  it("relays a content change with attribution, then rejects it from a non-host in host mode", async () => {
    const a = await connect("EP01"); // host
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");
    const b = await connect("EP01"); // guest
    send(b, { type: "hello", name: "Bob" });
    await nextMessage(b, (m) => m.type === "welcome");

    const contentP = nextMessage(b, (m) => m.type === "content");
    send(a, { type: "setContent", url: "https://www.crunchyroll.com/watch/EP2/two" });
    const content = await contentP;
    if (content.type !== "content") throw new Error("bad");
    expect(content.url).toBe("https://www.crunchyroll.com/watch/EP2/two");
    expect(content.from.name).toBe("Alice");

    send(a, { type: "setMode", mode: "host" });
    await nextMessage(b, (m) => m.type === "state" && m.controlMode === "host");
    const errP = nextMessage(b, (m) => m.type === "error");
    send(b, { type: "setContent", url: "https://www.crunchyroll.com/watch/EP3/three" });
    expect((await errP).type).toBe("error");
    a.close();
    b.close();
  });

  it("carries the current content in the welcome snapshot for late joiners", async () => {
    const a = await connect("EP02");
    send(a, { type: "hello", name: "Alice" });
    await nextMessage(a, (m) => m.type === "welcome");
    send(a, { type: "setContent", url: "https://www.crunchyroll.com/watch/LATE/x" });
    await nextMessage(a, (m) => m.type === "content");

    const b = await connect("EP02"); // late joiner
    send(b, { type: "hello", name: "Bob" });
    const welcome = await nextMessage(b, (m) => m.type === "welcome");
    if (welcome.type !== "welcome") throw new Error("bad");
    expect(welcome.snapshot.content).toBe("https://www.crunchyroll.com/watch/LATE/x");
    a.close();
    b.close();
  });
});
