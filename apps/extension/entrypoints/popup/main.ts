import { browser } from "wxt/browser";
import { HARNESS_ORIGIN } from "../../src/config";
import { newRoomUrl } from "../../src/urls";
import { buildInviteUrl, parseRoomCode, removeInvite } from "../../src/invite";
import { randomName } from "../../src/name-gen";
import { getOrCreateName, setName } from "../../src/name-store";
import { localNameStorage } from "../../src/storage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $("name") as HTMLInputElement;
const idleView = $("idle");
const syncedView = $("synced");
const roomLabel = $("room");
const inviteInput = $("invite") as HTMLInputElement;
const statusEl = $("status");

let currentName = "";

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isHarness(url: string): boolean {
  try {
    return new URL(url).origin === HARNESS_ORIGIN;
  } catch {
    return false;
  }
}

function showSynced(code: string, inviteUrl: string): void {
  roomLabel.textContent = code;
  inviteInput.value = inviteUrl;
  idleView.classList.add("hidden");
  syncedView.classList.remove("hidden");
}

function showIdle(): void {
  syncedView.classList.add("hidden");
  idleView.classList.remove("hidden");
}

// Popup state is derived from the active tab's #vsync, so it survives open/close.
async function render(): Promise<void> {
  try {
    const tab = await activeTab();
    const code = tab?.url ? parseRoomCode(new URL(tab.url).hash) : null;
    if (tab?.url && code) showSynced(code, tab.url);
    else showIdle();
  } catch {
    showIdle();
  }
}

async function initName(): Promise<void> {
  try {
    currentName = await getOrCreateName(localNameStorage, () => randomName());
  } catch {
    currentName = randomName();
  }
  nameInput.value = currentName;
}

nameInput.addEventListener("change", () => {
  const v = nameInput.value.trim();
  if (v) {
    currentName = v;
    void setName(localNameStorage, v).catch((e) => console.warn("save name failed:", e));
  } else {
    nameInput.value = currentName;
  }
});

$("startSync").addEventListener("click", async () => {
  setStatus("starting…");
  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url || !isHarness(tab.url)) {
      setStatus("open the harness first, then Start Sync");
      return;
    }
    const res = await fetch(newRoomUrl());
    if (!res.ok) {
      setStatus(`couldn't start (${res.status})`);
      return;
    }
    const body = (await res.json()) as { code?: unknown };
    if (typeof body.code !== "string" || !body.code) {
      setStatus("couldn't start (bad response)");
      return;
    }
    const invite = buildInviteUrl(tab.url, body.code);
    await browser.tabs.update(tab.id, { url: invite });
    showSynced(body.code, invite);
    setStatus("synced — share the link");
  } catch (e) {
    setStatus(`failed: ${String(e)}`);
  }
});

$("stop").addEventListener("click", async () => {
  try {
    const tab = await activeTab();
    if (tab?.id && tab.url) await browser.tabs.update(tab.id, { url: removeInvite(tab.url) });
    showIdle();
    setStatus("stopped");
  } catch (e) {
    setStatus(`failed: ${String(e)}`);
  }
});

$("copy").addEventListener("click", async () => {
  if (!inviteInput.value) return;
  try {
    await navigator.clipboard.writeText(inviteInput.value);
    setStatus("link copied");
  } catch {
    inviteInput.select();
    setStatus("press Ctrl+C to copy");
  }
});

$("openHarness").addEventListener("click", () => {
  void browser.tabs.create({ url: HARNESS_ORIGIN });
});

void initName();
void render();
