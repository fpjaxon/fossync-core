import { browser } from "wxt/browser";
import { generateKey, exportKeyB64 } from "@fossync/sync-core";
import { HARNESS_ORIGIN } from "../../src/config";
import { newRoomUrl } from "../../src/urls";
import { buildInviteUrl, parseRoomCode, removeInvite } from "../../src/invite";
import { randomName } from "../../src/name-gen";
import { getOrCreateName, setName } from "../../src/name-store";
import { localNameStorage } from "../../src/storage";
import { isSupportedContentUrl } from "../../src/supported";
import { getRelay, setRelayOrigin, resetRelay, normalizeRelayUrl } from "../../src/relay";
import { getBrandedUrls, setBrandedUrls } from "../../src/branded-store";
import { getEncryptedDefault, setEncryptedDefault } from "../../src/encrypted-store";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const nameInput = $("name") as HTMLInputElement;
const encryptedToggle = $("encrypted") as HTMLInputElement;
const relayInput = $("relay") as HTMLInputElement;
const mainView = $("main");
const settingsView = $("settings");
const idleView = $("idle");
const syncedView = $("synced");
const capacityView = $("capacity");
const relayState = $("relayState");
const roomLabel = $("room");
const statusEl = $("status");

let currentName = "";
// Set by the __BRANDED__ block below (custom builds only); null otherwise.
let brandedToggleEl: HTMLInputElement | null = null;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function showSynced(code: string): void {
  roomLabel.textContent = code;
  capacityView.classList.add("hidden");
  idleView.classList.add("hidden");
  syncedView.classList.remove("hidden");
}

function showIdle(): void {
  capacityView.classList.add("hidden");
  syncedView.classList.add("hidden");
  idleView.classList.remove("hidden");
}

function showCapacity(): void {
  idleView.classList.add("hidden");
  syncedView.classList.add("hidden");
  capacityView.classList.remove("hidden");
}

// Main view, with idle/synced derived from the active tab's #vsync (survives open/close).
async function renderMain(): Promise<void> {
  settingsView.classList.add("hidden");
  mainView.classList.remove("hidden");
  try {
    const tab = await activeTab();
    const code = tab?.url ? parseRoomCode(new URL(tab.url).hash) : null;
    if (tab?.url && code) showSynced(code);
    else showIdle();
  } catch {
    showIdle();
  }
}

async function renderRelayState(): Promise<void> {
  const relay = await getRelay();
  if (relay.isOfficial) {
    relayState.className = "relay-state official";
    relayState.textContent = "✓ Using the official relay (fossync.cloud).";
  } else {
    relayState.className = "relay-state custom";
    relayState.textContent = `⚠ Custom relay: ${relay.wsOrigin}`;
  }
}

async function showSettings(): Promise<void> {
  mainView.classList.add("hidden");
  settingsView.classList.remove("hidden");
  const relay = await getRelay();
  relayInput.value = relay.isOfficial ? "" : relay.httpOrigin;
  await renderRelayState();
  if (__BRANDED__ && brandedToggleEl) brandedToggleEl.checked = await getBrandedUrls();
}

async function initName(): Promise<void> {
  try {
    currentName = await getOrCreateName(localNameStorage, () => randomName());
  } catch {
    currentName = randomName();
  }
  nameInput.value = currentName;
}

encryptedToggle.addEventListener("change", () => {
  void setEncryptedDefault(encryptedToggle.checked).catch((e) => console.warn("save encrypted pref failed:", e));
});

nameInput.addEventListener("change", () => {
  const v = nameInput.value.trim();
  if (v) {
    currentName = v;
    void setName(localNameStorage, v).catch((e) => console.warn("save name failed:", e));
  } else {
    nameInput.value = currentName;
  }
});

$("gear").addEventListener("click", () => void showSettings());
$("back").addEventListener("click", () => { void renderMain(); setStatus(""); });

$("startSync").addEventListener("click", async () => {
  setStatus("starting…");
  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url || !isSupportedContentUrl(tab.url)) {
      setStatus("open the harness, a YouTube video, or a Crunchyroll episode, then Start Sync");
      return;
    }
    const relay = await getRelay();
    const res = await fetch(newRoomUrl(relay.httpOrigin));
    if (res.status === 503) {
      showCapacity();
      setStatus("");
      return;
    }
    if (!res.ok) {
      setStatus(`couldn't start (${res.status})`);
      return;
    }
    const body = (await res.json()) as { code?: unknown };
    if (typeof body.code !== "string" || !body.code) {
      setStatus("couldn't start (bad response)");
      return;
    }
    // Encrypted session: mint a fresh key and carry it in the invite fragment only.
    // It never reaches the relay (fragments aren't sent in requests), and page-sync
    // reads it from the hash the same way a guest's browser does.
    const keyB64 = encryptedToggle.checked ? await exportKeyB64(await generateKey()) : undefined;
    const invite = buildInviteUrl(tab.url, body.code, keyB64);
    await browser.tabs.update(tab.id, { url: invite });
    showSynced(body.code);
    setStatus("synced — manage from the page panel");
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

$("openHarness").addEventListener("click", () => {
  void browser.tabs.create({ url: HARNESS_ORIGIN });
});

$("saveRelay").addEventListener("click", async () => {
  const raw = relayInput.value.trim();
  if (!raw) {
    await resetRelay();
    relayInput.value = "";
    await renderRelayState();
    setStatus("using the official relay");
    return;
  }
  const origin = normalizeRelayUrl(raw);
  if (!origin) {
    setStatus("invalid relay URL");
    return;
  }
  await setRelayOrigin(origin);
  relayInput.value = origin;
  await renderRelayState();
  setStatus("relay saved");
});

$("useOfficial").addEventListener("click", async () => {
  await resetRelay();
  relayInput.value = "";
  await renderRelayState();
  setStatus("using the official relay");
});

// Branded share links: custom builds only. The whole block (and its strings) is
// dead-code-eliminated from the official build, where __BRANDED__ is false.
if (__BRANDED__) {
  const row = document.createElement("div");
  row.innerHTML =
    '<label class="toggle"><input id="branded" type="checkbox" /> Branded share links</label>' +
    '<p class="hint">Share invites as <code>&lt;relay&gt;/j#…</code> links instead of the page URL. ' +
    "The destination is encoded in the link and is never sent to the relay — but the relay's redirect page " +
    "runs in your guests' browsers, so it could read where they're going. Only enable this with a relay you " +
    "operate. Off by default.</p>";
  settingsView.appendChild(row);
  brandedToggleEl = row.querySelector("#branded");
  brandedToggleEl?.addEventListener("change", () => {
    void setBrandedUrls(brandedToggleEl!.checked).catch((e) => console.warn("save branded failed:", e));
  });
}

async function initEncryptedToggle(): Promise<void> {
  try {
    encryptedToggle.checked = await getEncryptedDefault();
  } catch {
    encryptedToggle.checked = false;
  }
}

void initName();
void initEncryptedToggle();
void renderMain();
