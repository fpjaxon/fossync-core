// WebSocket smoke test for a deployed fossync worker.
// Usage: node --experimental-websocket ws-smoke.mjs wss://fossync.cloud/room/SMOKE
//   (the --experimental-websocket flag is required on Node 20.x to get a global
//    WebSocket; it's a no-op on Node 22+ where WebSocket is already global.)
// Connects, sends hello + ping, asserts welcome + pong, then exits 0.
const url = process.argv[2];
if (!url) {
  console.error("usage: node ws-smoke.mjs <wss-url>");
  process.exit(2);
}

let WS = globalThis.WebSocket;
if (!WS) {
  try {
    ({ WebSocket: WS } = await import("undici"));
  } catch {
    /* fall through */
  }
}
if (!WS) {
  console.error("no WebSocket available (Node global or undici)");
  process.exit(2);
}

const ws = new WS(url);
const got = new Set();
const timer = setTimeout(() => {
  console.error(`TIMEOUT — received: [${[...got].join(", ")}]`);
  process.exit(1);
}, 10000);

ws.addEventListener("open", () => {
  ws.send(JSON.stringify({ type: "hello", name: "smoke" }));
  ws.send(JSON.stringify({ type: "ping", t0: Date.now() }));
});

ws.addEventListener("message", (ev) => {
  const text = typeof ev.data === "string" ? ev.data : String(ev.data);
  let msg;
  try {
    msg = JSON.parse(text);
  } catch {
    return;
  }
  got.add(msg.type);
  if (got.has("welcome") && got.has("pong")) {
    clearTimeout(timer);
    console.log(`OK — Durable Object responded: [${[...got].join(", ")}]`);
    ws.close();
    process.exit(0);
  }
});

ws.addEventListener("error", (e) => {
  console.error("WS error:", e?.message ?? e);
  process.exit(1);
});
