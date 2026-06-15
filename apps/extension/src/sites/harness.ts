import type { SiteModule } from "../page-sync";

export const harnessSite: SiteModule = {
  findVideo: () => waitForVideo(),
};

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
