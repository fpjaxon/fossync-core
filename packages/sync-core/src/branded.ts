// ---- Branded ("/j") share-link format ----
//
// A branded link is a fossync relay URL that carries the real destination in the
// URL *fragment*, e.g.
//
//   https://fossync.cloud/j#vsync=ABC123&u=<base64url(pageUrl)>
//
// The fragment is never sent in any HTTP request, so the relay that serves /j
// receives neither the room code nor the page the party is watching. A static
// page at /j (see packages/worker) reads the fragment in the browser and
// redirects locally to `<pageUrl>#vsync=ABC123`.
//
// The format lives here, shared, so the extension's encoder
// (apps/extension/src/branded.ts) and the worker's /j decoder can never drift:
// the worker embeds `decodeBranded`'s own source into the page it serves.
//
// SECURITY: a relay you don't operate serves attacker-controlled JS at /j and
// could read the fragment (the destination URL) before redirecting. That is why
// the official extension never points branded links at a self-hosted relay — see
// the build flag in apps/extension/src/branded.ts.

const PARAM_CODE = "vsync";
const PARAM_URL = "u";

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Encode a destination page URL (any hash stripped) + room code into a /j fragment. */
export function encodeBrandedFragment(pageUrl: string, code: string): string {
  const noHash = pageUrl.split("#")[0]!;
  const p = new URLSearchParams();
  p.set(PARAM_CODE, code);
  p.set(PARAM_URL, toBase64Url(noHash));
  return p.toString();
}

/**
 * Parse a /j fragment back into { url, code }, or null if it is malformed or the
 * decoded URL is not https (rejects javascript:/data:/http: — an open-redirect &
 * XSS guard for the redirect page).
 *
 * Deliberately self-contained (no references to module-scope helpers): the worker
 * serves `decodeBranded.toString()` verbatim as the /j page's inline script, so
 * the page and the extension always agree on the format. Keep it dependency-free.
 */
export function decodeBranded(fragment: string): { url: string; code: string } | null {
  try {
    const raw = fragment.charAt(0) === "#" ? fragment.slice(1) : fragment;
    const params = new URLSearchParams(raw);
    const code = (params.get("vsync") || "").trim();
    const enc = params.get("u") || "";
    if (!code || !enc) return null;
    const b64 = enc.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.length % 4 === 0 ? b64 : b64 + "=".repeat(4 - (b64.length % 4));
    const bin = atob(padded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const decoded = new TextDecoder().decode(bytes);
    const u = new URL(decoded);
    if (u.protocol !== "https:") return null;
    return { url: u.toString(), code };
  } catch {
    return null;
  }
}
