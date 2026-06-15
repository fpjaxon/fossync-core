import { defineContentScript } from "wxt/sandbox";
import { startPageSync } from "../src/page-sync";
import { youtubeSite } from "../src/sites/youtube";

export default defineContentScript({
  matches: ["*://www.youtube.com/*"],
  main() {
    if (window.location.pathname !== "/watch") return; // only watch pages, for now
    console.log("[fossync] youtube content script active on", window.location.href);
    startPageSync(youtubeSite);
  },
});
