import { defineContentScript } from "wxt/sandbox";
import { decodeBranded } from "@fossync/sync-core";
import { WORKER_ORIGIN } from "../src/config";
import { buildInviteUrl } from "../src/invite";

// Resolves a branded ("/j") invite. The destination page, room code, and any
// encrypted-session key live in the URL *fragment* — never sent to any server — so
// we decode it here and redirect to the real page (`<pageUrl>#vsync=CODE[&k=KEY]`),
// where the normal content script joins the room.
//
// The match is THIS build's relay only (WORKER_ORIGIN — fossync.cloud in the
// official build). That is the whole "don't join a non-fossync branded link"
// guarantee: a branded link pointing at any other relay's /j is never followed by
// the official extension. A self-hosted build opts in by changing WORKER_ORIGIN in
// config.ts (the redirect host is derived from it here and in branded.ts).
export default defineContentScript({
  matches: [`${WORKER_ORIGIN}/j`],
  runAt: "document_start",
  main() {
    if (window.location.origin !== WORKER_ORIGIN || window.location.pathname !== "/j") return;
    const decoded = decodeBranded(window.location.hash);
    if (!decoded) return; // malformed or non-https → leave the install landing page up
    location.replace(buildInviteUrl(decoded.url, decoded.code, decoded.key));
  },
});
