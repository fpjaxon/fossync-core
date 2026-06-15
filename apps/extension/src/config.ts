export const WORKER_ORIGIN = "https://fossync.cloud";
export const WORKER_WS_ORIGIN = "wss://fossync.cloud";

// The relay Floatpoint operates — the fixed reference the in-extension warning
// compares the *configured* relay against (see relay.ts). The official build
// defaults to it; point the extension at another relay and the sidebar warns.
// (A custom build is free to change this reference or drop the warning.)
export const OFFICIAL_RELAY_WS_ORIGIN = "wss://fossync.cloud";

// The deployed harness (primary — enables cross-machine testing) and the local
// dev server. Order matters: HARNESS_ORIGIN (what "Open harness" opens) is the first.
export const HARNESS_ORIGINS = ["https://harness.fossync.cloud", "http://localhost:5173"] as const;
export const HARNESS_ORIGIN = HARNESS_ORIGINS[0];

export function isHarnessOrigin(origin: string): boolean {
  return (HARNESS_ORIGINS as readonly string[]).includes(origin);
}
