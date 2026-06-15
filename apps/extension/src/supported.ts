import { isHarnessOrigin } from "./config";

export function isSupportedContentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (isHarnessOrigin(u.origin)) return true;
    if (u.hostname === "www.youtube.com") return u.pathname === "/watch";
    if (u.hostname === "www.crunchyroll.com") return u.pathname.startsWith("/watch/");
    return false;
  } catch {
    return false;
  }
}
