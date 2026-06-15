export const WORKER_ORIGIN = "https://fossync.cloud";
export const WORKER_WS_ORIGIN = "wss://fossync.cloud";

// The relay Floatpoint operates. The in-extension warning compares the configured
// relay (WORKER_WS_ORIGIN) against this fixed reference, so a build repointed at a
// self-hosted/third-party relay surfaces the warning. The official build leaves them
// equal, so it never shows. (A custom build is free to remove the warning.)
export const OFFICIAL_RELAY_WS_ORIGIN = "wss://fossync.cloud";
export const isOfficialRelay = WORKER_WS_ORIGIN === OFFICIAL_RELAY_WS_ORIGIN;

// The deployed harness (primary — enables cross-machine testing) and the local
// dev server. Order matters: HARNESS_ORIGIN (what "Open harness" opens) is the first.
export const HARNESS_ORIGINS = ["https://harness.fossync.cloud", "http://localhost:5173"] as const;
export const HARNESS_ORIGIN = HARNESS_ORIGINS[0];

export function isHarnessOrigin(origin: string): boolean {
  return (HARNESS_ORIGINS as readonly string[]).includes(origin);
}
