import { HARNESS_ORIGIN } from "./config";

export function isSupportedContentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.origin === HARNESS_ORIGIN) return true;
    return u.hostname === "www.youtube.com" && u.pathname === "/watch";
  } catch {
    return false;
  }
}
