import { defineContentScript } from "wxt/sandbox";
import { HARNESS_ORIGIN } from "../src/config";
import { startPageSync } from "../src/page-sync";
import { harnessSite } from "../src/sites/harness";

export default defineContentScript({
  matches: ["http://localhost/*"],
  main() {
    // Match-pattern hosts can't carry a port — a ":5173" match silently fails to
    // inject in Gecko — so match all of localhost and scope to the harness here.
    if (window.location.origin !== HARNESS_ORIGIN) return;
    console.log("[fossync] content script active on", window.location.href);
    startPageSync(harnessSite);
  },
});
