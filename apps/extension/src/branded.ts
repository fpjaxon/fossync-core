import { buildInviteUrl } from "./invite";
import { encodeBrandedFragment } from "@fossync/sync-core";
import { WORKER_ORIGIN } from "./config";

// Pure share-link logic (no extension APIs), so it's unit-testable in plain node.
// The browser-storage side lives in branded-store.ts, mirroring relay-url/relay.

/** browser.storage.local key for the user's "branded share links" preference. */
export const BRANDED_KEY = "brandedUrls";

/**
 * Build the invite link to SHARE with a guest.
 *
 * When the user has branded links on, this returns a short fragment link on THIS
 * build's relay (`${WORKER_ORIGIN}/j#vsync=CODE&u=<encoded pageUrl>`). The official
 * build's WORKER_ORIGIN is fossync.cloud, so it only ever produces fossync-branded
 * links; a self-hosted build (which sets WORKER_ORIGIN in config.ts to its own
 * relay) produces links on that relay — and its /j content script resolves them.
 * The destination, room code, and any encrypted-session `key` ride in the fragment,
 * so opening the link never sends them to the relay; the extension reads the
 * fragment and redirects (the relay's /j page is a passive install nudge).
 *
 * Otherwise it returns the plain page URL with the code (+ key) in the hash — the
 * default, which "defaults to the site they're on".
 *
 * Note: this is the SHARED link only. A host's own tab always stays on the plain
 * page URL (callers pass the branded value to the copy button, not to tabs.update).
 */
export function buildShareUrl(
  pageUrl: string,
  code: string,
  brandedOn: boolean,
  key?: string,
): string {
  if (brandedOn) {
    return `${WORKER_ORIGIN}/j#${encodeBrandedFragment(pageUrl, code, key)}`;
  }
  return buildInviteUrl(pageUrl, code, key);
}
