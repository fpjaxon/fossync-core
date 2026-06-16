import { buildInviteUrl } from "./invite";
import { encodeBrandedFragment } from "@fossync/sync-core";

// Pure share-link logic (no extension APIs), so it's unit-testable in plain node.
// The browser-storage side lives in branded-store.ts, mirroring relay-url/relay.

/** browser.storage.local key for the user's "branded share links" preference. */
export const BRANDED_KEY = "brandedUrls";

/**
 * Build the invite link to SHARE with a guest.
 *
 * When branded links are compiled in (`__BRANDED__`) AND the user has them on,
 * this returns a fragment-redirect link on the *configured* relay
 * (`<relayHttpOrigin>/j#vsync=CODE&u=<encoded pageUrl>`). The destination rides in
 * the fragment, so opening it never sends the page URL to the relay; the relay's
 * /j page redirects client-side.
 *
 * Otherwise it returns the plain page URL with the code in the hash — today's
 * default, which "defaults to the site they're on". In the official build
 * `__BRANDED__` is false, so the branded branch (and its sync-core import) is
 * dead-code-eliminated and never ships.
 *
 * Note: this is the SHARED link only. A host's own tab always stays on the plain
 * page URL (callers pass the branded value to the copy button, not to tabs.update).
 */
export function buildShareUrl(
  pageUrl: string,
  code: string,
  relayHttpOrigin: string,
  brandedOn: boolean,
  key?: string,
): string {
  if (__BRANDED__ && brandedOn) {
    return `${relayHttpOrigin}/j#${encodeBrandedFragment(pageUrl, code, key)}`;
  }
  return buildInviteUrl(pageUrl, code, key);
}
