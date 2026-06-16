export const INVITE_PARAM = "vsync";
export const INVITE_KEY_PARAM = "k"; // base64url AES-GCM key for an encrypted session

/**
 * Build the in-page invite hash. For an encrypted session, pass the base64url
 * session key — it rides in the fragment (`#vsync=CODE&k=KEY`), which browsers
 * never send to the relay, so the relay never sees the key.
 */
export function buildInviteUrl(pageUrl: string, code: string, key?: string): string {
  const url = new URL(pageUrl);
  // The code and base64url key ([A-Za-z0-9_-]) need no escaping, so build the hash
  // by hand to keep it human-readable rather than letting URLSearchParams encode it.
  url.hash = key ? `${INVITE_PARAM}=${code}&${INVITE_KEY_PARAM}=${key}` : `${INVITE_PARAM}=${code}`;
  return url.toString();
}

/** Parse the room code (and encryption key, if any) out of a location hash. */
export function parseInvite(hash: string): { code: string; key: string | null } | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const code = params.get(INVITE_PARAM)?.trim();
  if (!code) return null;
  const key = params.get(INVITE_KEY_PARAM)?.trim() || null;
  return { code, key };
}

export function parseRoomCode(hash: string): string | null {
  return parseInvite(hash)?.code ?? null;
}

export function removeInvite(pageUrl: string): string {
  const url = new URL(pageUrl);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  params.delete(INVITE_PARAM);
  params.delete(INVITE_KEY_PARAM); // never leave the session key lingering in the URL bar/history
  const rest = params.toString();
  url.hash = rest ? rest : "";
  return url.toString();
}
