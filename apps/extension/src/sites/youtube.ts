import type { SiteModule } from "../page-sync";

export const youtubeSite: SiteModule = {
  findVideo: () => waitForVideo(),

  watchAds(_video, onAd) {
    const player =
      document.querySelector(".html5-video-player") ?? document.querySelector("#movie_player");
    if (!player) return () => {};
    const check = () => onAd(player.classList.contains("ad-showing"));
    const observer = new MutationObserver(check);
    observer.observe(player, { attributes: true, attributeFilter: ["class"] });
    check();
    return () => observer.disconnect();
  },
};

// The SPA boots slowly; poll for the main player video.
function waitForVideo(timeoutMs = 10000): Promise<HTMLVideoElement | null> {
  const start = Date.now();
  const pick = (): HTMLVideoElement | null =>
    document.querySelector<HTMLVideoElement>(".html5-main-video") ??
    document.querySelector<HTMLVideoElement>("#movie_player video") ??
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
