import { WORKER_ORIGIN, OFFICIAL_RELAY_WS_ORIGIN } from "./config";

// Pure relay helpers — no extension APIs, so they're unit-testable in plain node.

export interface Relay {
  httpOrigin: string; // for /new (popup fetch)
  wsOrigin: string; // for the /room WebSocket (content script)
  isOfficial: boolean;
}

/** Derive the http+ws relay pair from a stored origin (or the built-in default). */
export function relayFromOrigin(httpOrigin: string): Relay {
  const http = httpOrigin || WORKER_ORIGIN;
  const ws = http.replace(/^http/, "ws"); // https→wss, http→ws
  return { httpOrigin: http, wsOrigin: ws, isOfficial: ws === OFFICIAL_RELAY_WS_ORIGIN };
}

/** Normalize a user-entered relay URL to an http(s) origin, or null if invalid. */
export function normalizeRelayUrl(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
  let u: URL;
  try {
    u = new URL(withScheme);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  return u.origin; // drops any path/query, e.g. https://relay.example.com
}
