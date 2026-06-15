import {
  SyncClient,
  SyncSession,
  Html5VideoAdapter,
  expectedPosition,
  type ControlMode,
} from "@video-sync/sync-core";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const video = $("video") as HTMLVideoElement;
const overlay = $("overlay") as HTMLDivElement;
const roomInput = $("room") as HTMLInputElement;
const nameInput = $("name") as HTMLInputElement;

// Pre-fill room from the query string so a shared link drops you into the same room.
const qpRoom = new URLSearchParams(location.search).get("room");
if (qpRoom) roomInput.value = qpRoom;

const WORKER_ORIGIN = "ws://localhost:8787";
let client: SyncClient | null = null;

function join() {
  const code = roomInput.value.trim().toUpperCase();
  client = new SyncClient({
    url: `${WORKER_ORIGIN}/room/${code}`,
    name: nameInput.value.trim() || "Guest",
    pingCount: 5,
    createSocket: (url) => new WebSocket(url),
    now: () => Date.now(),
    schedule: (fn, ms) => window.setTimeout(fn, ms),
  });
  client.onError((reason) => console.warn("server error:", reason));
  client.connect();

  const adapter = new Html5VideoAdapter(video);
  const session = new SyncSession({
    client,
    adapter,
    now: () => Date.now(),
    setInterval: (fn, ms) => window.setInterval(fn, ms),
  });
  session.start();
  window.setInterval(render, 250);
}

function render() {
  if (!client) return;
  const pb = client.getPlayback();
  const offset = client.getOffset();
  if (!pb || offset === null) {
    overlay.textContent = "connecting (waiting for clock sync + state)...";
    return;
  }
  const serverNow = Date.now() + offset;
  const target = expectedPosition(pb, serverNow);
  const actual = video.currentTime;
  overlay.textContent = [
    `room:        ${roomInput.value.toUpperCase()}`,
    `you:         ${client.getYouId()}  (host: ${client.getHostId()})`,
    `controlMode: ${client.getControlMode()}`,
    `offset(ms):  ${offset.toFixed(1)}`,
    `paused:      ${pb.paused}`,
    `target:      ${target.toFixed(3)}s`,
    `actual:      ${actual.toFixed(3)}s`,
    `error(ms):   ${((target - actual) * 1000).toFixed(0)}`,
    `participants:${client.getParticipants().map((p) => p.name).join(", ")}`,
  ].join("\n");
}

$("join").addEventListener("click", join);
$("modeToggle").addEventListener("click", () => {
  if (!client) return;
  const next: ControlMode = client.getControlMode() === "host" ? "everyone" : "host";
  client.setMode(next);
});
