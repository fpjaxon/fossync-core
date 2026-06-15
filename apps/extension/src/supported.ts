import { isHarnessOrigin } from "./config";

export function isSupportedContentUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (isHarnessOrigin(u.origin)) return true;
    return u.hostname === "www.youtube.com" && u.pathname === "/watch";
  } catch {
    return false;
  }
}
