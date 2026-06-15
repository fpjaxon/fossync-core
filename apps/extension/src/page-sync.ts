import { SyncClient, SyncSession, Html5VideoAdapter } from "@fossync/sync-core";
import { roomSocketUrl } from "./urls";
import { parseRoomCode } from "./invite";
import { randomName } from "./name-gen";
import { getOrCreateName } from "./name-store";
import { localNameStorage } from "./storage";

export interface SiteModule {
  /** Resolve the page's main media element (site-specific selection + waiting). */
  findVideo(): Promise<HTMLVideoElement | null>;
  /** Optional ad detection: call onAd(true/false); return a cleanup fn. */
  watchAds?(video: HTMLVideoElement, onAd: (adPlaying: boolean) => void): () => void;
}

export function startPageSync(site: SiteModule): void {
  let client: SyncClient | null = null;
  let session: SyncSession | null = null;
  let badgeTimer: number | null = null;
  let stopAds: (() => void) | null = null;
  let currentCode: string | null = null;
  let adPlaying = false;
  let generation = 0;
  const badge = createBadge();

  function teardown(): void {
    generation++; // invalidate any in-flight connectTo
    if (badgeTimer !== null) {
      window.clearInterval(badgeTimer);
      badgeTimer = null;
    }
    if (stopAds) {
      stopAds();
      stopAds = null;
    }
    adPlaying = false;
    session?.stop();
    session = null;
    client?.close();
    client = null;
  }

  async function connectTo(code: string): Promise<void> {
    console.log("[fossync] connecting to room", code, "via", roomSocketUrl(code));
    teardown();
    const gen = generation;
    currentCode = code;
    badge.show();
    badge.set(`● room ${code} · looking for video…`);
    const video = await site.findVideo();
    if (gen !== generation) return; // superseded
    if (!video) {
      currentCode = null; // allow a later hashchange to retry once a video mounts
      badge.set(`● room ${code} · no video on this page`);
      return;
    }
    const name = await getOrCreateName(localNameStorage, () => randomName());
    if (gen !== generation) return; // superseded
    client = new SyncClient({
      url: roomSocketUrl(code),
      name,
      pingCount: 5,
      createSocket: (url) => new WebSocket(url),
      now: () => Date.now(),
      schedule: (fn, ms) => window.setTimeout(fn, ms),
    });
    client.onError((reason) => console.warn("[fossync] server error:", reason));
    client.connect();
    session = new SyncSession({
      client,
      adapter: new Html5VideoAdapter(video),
      now: () => Date.now(),
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (h) => window.clearInterval(h as number),
    });
    session.start();
    if (site.watchAds) {
      stopAds = site.watchAds(video, (playing) => {
        adPlaying = playing;
        session?.setPaused(playing);
        renderBadge();
      });
    }
    badgeTimer = window.setInterval(renderBadge, 250);
    renderBadge();
  }

  function renderBadge(): void {
    if (!client) return;
    if (adPlaying) {
      badge.set(`● ad — sync paused · room ${currentCode}`);
      return;
    }
    const offset = client.getOffset();
    const pb = client.getPlayback();
    if (offset === null || pb === null) {
      badge.set(`● room ${currentCode} · connecting…`);
      return;
    }
    const people = client.getParticipants();
    const names = people.map((p) => p.name).join(", ");
    badge.set(`● Synced · room ${currentCode} · ${people.length} watching${names ? ` (${names})` : ""}`);
  }

  function handleHash(): void {
    const code = parseRoomCode(window.location.hash);
    if (code) {
      if (code !== currentCode) void connectTo(code);
    } else {
      currentCode = null;
      teardown();
      badge.hide();
    }
  }

  window.addEventListener("hashchange", handleHash);
  window.addEventListener("pagehide", teardown);
  handleHash();
}

function createBadge() {
  const el = document.createElement("div");
  el.style.cssText = [
    "position:fixed",
    "top:8px",
    "right:8px",
    "z-index:2147483647",
    "background:#111",
    "color:#0f0",
    "font:12px ui-monospace,monospace",
    "white-space:pre",
    "padding:6px 8px",
    "border-radius:4px",
    "pointer-events:none",
    "display:none",
  ].join(";");
  document.documentElement.appendChild(el);
  return {
    set: (text: string) => {
      el.textContent = text;
    },
    show: () => {
      el.style.display = "block";
    },
    hide: () => {
      el.style.display = "none";
    },
  };
}
