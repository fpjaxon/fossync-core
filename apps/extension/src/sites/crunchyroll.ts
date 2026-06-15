import type { SiteModule } from "../page-sync";

// Crunchyroll plays DRM (Widevine) content through a Bitmovin player, but DRM only
// protects the media stream — the underlying <video> element's timeline API is
// reachable, so control-signal sync works normally. As of 2026 every Crunchyroll
// tier is paid and ad-free, so there is no ad state to handle.
export const crunchyrollSite: SiteModule = {
  findVideo: () => waitForVideo(),
};

// The SPA + Bitmovin player boot after navigation; poll for the player's <video>.
function waitForVideo(timeoutMs = 15000): Promise<HTMLVideoElement | null> {
  const start = Date.now();
  const pick = (): HTMLVideoElement | null =>
    document.querySelector<HTMLVideoElement>(".bitmovinplayer-container video") ??
    document.querySelector<HTMLVideoElement>('video[id^="bitmovinplayer-video"]') ??
    document.querySelector<HTMLVideoElement>("video");
  return new Promise((resolve) => {
    const tick = () => {
      const v = pick();
      if (v) return resolve(v);
      if (Date.now() - start > timeoutMs) return resolve(null);
      window.setTimeout(tick, 250);
    };
    tick();
  });
}
