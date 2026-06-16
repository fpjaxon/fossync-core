// Connection-quality tier derived from the best round-trip time to the relay.
// Pure + display-only: higher latency means a noisier clock-offset estimate and
// later control signals, so a user is more likely to drift and re-sync. See
// SyncClient.getConnectionRtt() for the input and the extension for rendering.

export type ConnectionQuality = "measuring" | "good" | "fair" | "poor";

/** Classify best-RTT-to-relay (ms) into a quality tier. null = not yet measured. */
export function classifyConnection(rtt: number | null): ConnectionQuality {
  if (rtt === null) return "measuring";
  if (rtt < 100) return "good";
  if (rtt <= 250) return "fair";
  return "poor";
}
