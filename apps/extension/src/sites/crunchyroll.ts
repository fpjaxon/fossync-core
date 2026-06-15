import type { SiteModule } from "../page-sync";

// Crunchyroll plays DRM (Widevine) content through a Bitmovin player, but DRM only
// protects the media stream — the underlying <video> element's timeline API is
// reachable, so control-signal sync works normally. As of 2026 every Crunchyroll
// tier is paid and ad-free, so there is no ad state to handle.
export const crunchyrollSite: SiteModule = {
  findVideo: () => waitForVideo(),

  // Crunchyroll is a SPA: episode changes swap the URL (and drop our #vsync hash)
  // without a reload. Poll the watch path so we can follow the host to a new episode.
  watchNavigation(onNavigate) {
    let last = location.pathname;
    const id = window.setInterval(() => {
      if (location.pathname !== last && location.pathname.startsWith("/watch/")) {
        last = location.pathname;
        onNavigate(location.href.split("#")[0]!);
      }
    }, 500);
    return () => window.clearInterval(id);
  },
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
