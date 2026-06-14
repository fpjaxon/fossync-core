export interface PingSample {
  offset: number; // serverClock - clientClock (ms)
  rtt: number; // round-trip time (ms)
}

/**
 * Cristian's algorithm. The server replies with a single timestamp t1 stamped
 * on receipt; we treat server send-time ≈ t1 (DO handling is sub-millisecond).
 *   offset ≈ serverClock − clientClock
 */
export function computeSample(t0: number, t1: number, t3: number): PingSample {
  return { offset: (t1 - t0 + (t1 - t3)) / 2, rtt: t3 - t0 };
}

/** The lowest-RTT sample has the least queuing jitter, so its offset is most trustworthy. */
export function pickBestOffset(samples: PingSample[]): number {
  if (samples.length === 0) throw new Error("pickBestOffset: no samples");
  return samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
}
