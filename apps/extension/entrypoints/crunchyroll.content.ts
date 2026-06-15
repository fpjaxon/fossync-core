import { defineContentScript } from "wxt/sandbox";
import { startPageSync } from "../src/page-sync";
import { crunchyrollSite } from "../src/sites/crunchyroll";

export default defineContentScript({
  matches: ["*://www.crunchyroll.com/*"],
  main() {
    if (!window.location.pathname.startsWith("/watch/")) return; // only episode pages
    console.log("[fossync] crunchyroll content script active on", window.location.href);
    startPageSync(crunchyrollSite);
  },
});
