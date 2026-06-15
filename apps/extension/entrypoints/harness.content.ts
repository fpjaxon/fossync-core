import { defineContentScript } from "wxt/sandbox";
import { SyncClient, SyncSession, Html5VideoAdapter } from "@video-sync/sync-core";
import { roomSocketUrl } from "../src/urls";
import { parseRoomCode } from "../src/invite";
import { randomName } from "../src/name-gen";
import { getOrCreateName } from "../src/name-store";
import { localNameStorage } from "../src/storage";

export default defineContentScript({
  matches: ["http://localhost:5173/*"],
  main() {
    let client: SyncClient | null = null;
    let session: SyncSession | null = null;
    let badgeTimer: number | null = null;
    let currentCode: string | null = null;
    const badge = createBadge();

    function teardown(): void {
      if (badgeTimer !== null) {
        window.clearInterval(badgeTimer);
        badgeTimer = null;
      }
      session?.stop();
      session = null;
      client?.close();
      client = null;
    }

    function waitForVideo(timeoutMs = 5000): Promise<HTMLVideoElement | null> {
      const start = Date.now();
      return new Promise((resolve) => {
        const tick = () => {
          const v = document.querySelector("video");
          if (v) return resolve(v);
          if (Date.now() - start > timeoutMs) return resolve(null);
          window.setTimeout(tick, 200);
        };
        tick();
      });
    }

    async function connectTo(code: string): Promise<void> {
      teardown();
      currentCode = code;
      badge.show();
      badge.set(`room ${code}\nlooking for video…`);
      const video = await waitForVideo();
      if (!video) {
        badge.set(`room ${code}\nno <video> on this page`);
        return;
      }
      const name = await getOrCreateName(localNameStorage, () => randomName());
      client = new SyncClient({
        url: roomSocketUrl(code),
        name,
        pingCount: 5,
        createSocket: (url) => new WebSocket(url),
        now: () => Date.now(),
        schedule: (fn, ms) => window.setTimeout(fn, ms),
      });
      client.onError((reason) => console.warn("[video-sync] server error:", reason));
      client.connect();
      session = new SyncSession({
        client,
        adapter: new Html5VideoAdapter(video),
        now: () => Date.now(),
        setInterval: (fn, ms) => window.setInterval(fn, ms),
        clearInterval: (h) => window.clearInterval(h as number),
      });
      session.start();
      badgeTimer = window.setInterval(renderBadge, 250);
      renderBadge();
    }

    function renderBadge(): void {
      if (!client) return;
      const offset = client.getOffset();
      const pb = client.getPlayback();
      if (offset === null || pb === null) {
        badge.set(`room ${currentCode}\nconnecting…`);
        return;
      }
      badge.set(
        [
          `room ${currentCode}`,
          `offset ${offset.toFixed(0)} ms`,
          `people ${client.getParticipants().map((p) => p.name).join(", ") || "(none)"}`,
          `paused ${pb.paused}`,
        ].join("\n"),
      );
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
  },
});

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
