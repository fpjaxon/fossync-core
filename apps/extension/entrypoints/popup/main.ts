import { browser } from "wxt/browser";
import { SyncClient } from "@video-sync/sync-core";
import { roomSocketUrl, harnessUrl, newRoomUrl } from "../../src/urls";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roomInput = $("room") as HTMLInputElement;
const nameInput = $("name") as HTMLInputElement;
const stats = $("stats") as HTMLDivElement;

let client: SyncClient | null = null;
let timer: number | null = null;

function disconnect(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
  client?.close();
  client = null;
}

function connect(): void {
  disconnect();
  client = new SyncClient({
    url: roomSocketUrl(roomInput.value),
    name: nameInput.value.trim() || "Ext",
    pingCount: 5,
    createSocket: (url) => new WebSocket(url),
    now: () => Date.now(),
    schedule: (fn, ms) => window.setTimeout(fn, ms),
  });
  client.onError((reason) => console.warn("server error:", reason));
  client.connect();
  timer = window.setInterval(render, 250);
  render();
}

function render(): void {
  if (!client) {
    stats.textContent = "idle";
    return;
  }
  const offset = client.getOffset();
  const pb = client.getPlayback();
  if (offset === null || pb === null) {
    stats.textContent = "connecting… (waiting for clock sync + state)";
    return;
  }
  stats.textContent = [
    `status:  connected`,
    `offset:  ${offset.toFixed(1)} ms`,
    `mode:    ${client.getControlMode()}`,
    `you:     ${client.getYouId()}`,
    `host:    ${client.getHostId()}`,
    `people:  ${client.getParticipants().map((p) => p.name).join(", ") || "(none)"}`,
    `paused:  ${pb.paused}`,
    `media@:  ${pb.anchorMediaTime.toFixed(2)} s`,
  ].join("\n");
}

$("connect").addEventListener("click", connect);

$("newRoom").addEventListener("click", async () => {
  try {
    const res = await fetch(newRoomUrl());
    const body = (await res.json()) as { code: string };
    roomInput.value = body.code;
  } catch (e) {
    stats.textContent = `new room failed: ${String(e)}`;
  }
});

$("openHarness").addEventListener("click", () => {
  void browser.tabs.create({ url: harnessUrl(roomInput.value) });
});

window.addEventListener("pagehide", disconnect);
