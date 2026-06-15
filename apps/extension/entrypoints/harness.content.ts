import { defineContentScript } from "wxt/sandbox";
import { isHarnessOrigin } from "../src/config";
import { startPageSync } from "../src/page-sync";
import { harnessSite } from "../src/sites/harness";

export default defineContentScript({
  // Match-pattern hosts can't carry a port — a ":5173" match silently fails to
  // inject in Gecko — so match all of localhost and scope to the harness below.
  matches: ["http://localhost/*", "https://harness.fossync.cloud/*"],
  main() {
    if (!isHarnessOrigin(window.location.origin)) return;
    console.log("[fossync] content script active on", window.location.href);
    startPageSync(harnessSite);
  },
});
