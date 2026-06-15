export const WORKER_ORIGIN = "https://fossync.cloud";
export const WORKER_WS_ORIGIN = "wss://fossync.cloud";

// The deployed harness (primary — enables cross-machine testing) and the local
// dev server. Order matters: HARNESS_ORIGIN (what "Open harness" opens) is the first.
export const HARNESS_ORIGINS = ["https://harness.fossync.cloud", "http://localhost:5173"] as const;
export const HARNESS_ORIGIN = HARNESS_ORIGINS[0];

export function isHarnessOrigin(origin: string): boolean {
  return (HARNESS_ORIGINS as readonly string[]).includes(origin);
}
