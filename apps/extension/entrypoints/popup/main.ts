import { browser } from "wxt/browser";
import { SyncClient } from "@video-sync/sync-core";
import { roomSocketUrl, harnessUrl, newRoomUrl } from "../../src/urls";
import { randomName } from "../../src/name-gen";
import { getOrCreateName, setName, type NameStorage } from "../../src/name-store";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roomInput = $("room") as HTMLInputElement;
const nameInput = $("name") as HTMLInputElement;
const stats = $("stats") as HTMLDivElement;

// Adapter over browser.storage.local matching the NameStorage interface.
const nameStorage: NameStorage = {
  async get(key) {
    const result = await browser.storage.local.get(key);
    const value = result[key];
    return typeof value === "string" ? value : undefined;
  },
  async set(key, value) {
    await browser.storage.local.set({ [key]: value });
  },
};

let currentName = "";
let client: SyncClient | null = null;
let timer: number | null = null;

async function initName(): Promise<void> {
  try {
    currentName = await getOrCreateName(nameStorage, () => randomName());
  } catch {
    // Storage unavailable: still usable this session, just not persisted.
    currentName = randomName();
  }
  nameInput.value = currentName;
}

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
    name: currentName || "Guest",
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

// Persist-on-edit: a non-empty edit becomes the persistent name; an emptied field
// reverts to the current name (never persist blank).
nameInput.addEventListener("change", () => {
  const v = nameInput.value.trim();
  if (v) {
    currentName = v;
    void setName(nameStorage, v).catch((e) => console.warn("save name failed:", e));
  } else {
    nameInput.value = currentName;
  }
});

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

void initName();
