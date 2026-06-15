import { browser } from "wxt/browser";
import { HARNESS_ORIGIN } from "../../src/config";
import { newRoomUrl } from "../../src/urls";
import { buildInviteUrl, parseRoomCode } from "../../src/invite";
import { randomName } from "../../src/name-gen";
import { getOrCreateName, setName } from "../../src/name-store";
import { localNameStorage } from "../../src/storage";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $("name") as HTMLInputElement;
const inviteInput = $("invite") as HTMLInputElement;
const statusEl = $("status") as HTMLDivElement;

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

async function initName(): Promise<void> {
  try {
    currentName = await getOrCreateName(localNameStorage, () => randomName());
  } catch {
    currentName = randomName();
  }
  nameInput.value = currentName;
}

async function initInvite(): Promise<void> {
  try {
    const tab = await activeTab();
    if (tab?.url && parseRoomCode(new URL(tab.url).hash)) {
      inviteInput.value = tab.url;
    }
  } catch {
    // no active-tab access / not a URL — leave the field empty
  }
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

$("startRoom").addEventListener("click", async () => {
  setStatus("creating room…");
  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url || !isHarness(tab.url)) {
      setStatus("open the harness first, then Start a room");
      return;
    }
    const res = await fetch(newRoomUrl());
    if (!res.ok) {
      setStatus(`room creation failed (${res.status})`);
      return;
    }
    const body = (await res.json()) as { code?: unknown };
    if (typeof body.code !== "string" || !body.code) {
      setStatus("room creation failed (bad response)");
      return;
    }
    const invite = buildInviteUrl(tab.url, body.code);
    await browser.tabs.update(tab.id, { url: invite });
    inviteInput.value = invite;
    setStatus(`room ${body.code} started — share the link`);
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
void initInvite();
