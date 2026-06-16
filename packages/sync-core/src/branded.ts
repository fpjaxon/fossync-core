// ---- Branded ("/j") share-link format ----
//
// A branded link is a fossync relay URL that carries the real destination in the
// URL *fragment*, e.g.
//
//   https://fossync.cloud/j#vsync=ABC123&u=<base64url(pageUrl)>
//
// The fragment is never sent in any HTTP request, so the relay that serves /j
// receives neither the room code nor the page the party is watching. The fossync
// extension's /j content script reads the fragment in the browser and redirects
// locally to `<pageUrl>#vsync=ABC123`; the relay's /j route is just a passive
// "install the extension" landing page.
//
// The format lives here, shared, so the extension's encoder
// (apps/extension/src/branded.ts) and its /j resolver
// (apps/extension/entrypoints/join.content.ts) always agree.
//
// SECURITY: resolution happens in the extension, and the official build only ever
// follows links on its own relay — the content script matches WORKER_ORIGIN/j
// (= fossync.cloud/j). A branded link pointing at any other relay is ignored, so
// an untrusted relay can't use one to run a redirect in your browser. Following
// branded links on your own relay requires a self-hosted build (changed WORKER_ORIGIN).

const PARAM_CODE = "vsync";
const PARAM_URL = "u";
const PARAM_KEY = "k"; // base64url session key for an encrypted session (optional)

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Encode a destination page URL (any hash stripped) + room code into a /j fragment.
 * For an encrypted session, pass the base64url session `key`; it travels in the
 * fragment only, so the relay serving /j never sees it.
 */
export function encodeBrandedFragment(pageUrl: string, code: string, key?: string): string {
  const noHash = pageUrl.split("#")[0]!;
  const p = new URLSearchParams();
  p.set(PARAM_CODE, code);
  p.set(PARAM_URL, toBase64Url(noHash));
  if (key) p.set(PARAM_KEY, key);
  return p.toString();
}

/**
 * Parse a /j fragment back into { url, code }, or null if it is malformed or the
 * decoded URL is not https (rejects javascript:/data:/http: — an open-redirect &
 * XSS guard for the redirect page).
 *
 * Self-contained and dependency-free, so it's easy to audit: the extension's /j
 * content script calls it to resolve a branded link into its real destination.
 */
export function decodeBranded(fragment: string): { url: string; code: string; key?: string } | null {
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
    const key = (params.get("k") || "").trim();
    return key ? { url: u.toString(), code, key } : { url: u.toString(), code };
  } catch {
    return null;
  }
}
