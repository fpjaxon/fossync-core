import type { Playback } from "./types";

export interface ReconcileConfig {
  hardSeekThreshold: number; // seconds — above this we hard-seek
  softThreshold: number; // seconds — below this we leave rate at nominal
  rateGain: number; // proportional gain k for the rate nudge
  minRate: number;
  maxRate: number;
  seekLead: number; // seconds added on a hard seek to absorb seek latency
}

export const DEFAULT_CONFIG: ReconcileConfig = {
  hardSeekThreshold: 0.75,
  softThreshold: 0.04,
  rateGain: 0.5,
  minRate: 0.9,
  maxRate: 1.1,
  seekLead: 0.05,
};

export interface PlayerView {
  paused: boolean;
  currentTime: number;
}

export type ReconcileAction =
  | { type: "none" }
  | { type: "play" }
  | { type: "pause" }
  | { type: "seek"; to: number }
  | { type: "setRate"; rate: number };

export function expectedPosition(pb: Playback, serverNow: number): number {
  if (pb.paused) return pb.anchorMediaTime;
  return pb.anchorMediaTime + ((serverNow - pb.anchorServerTime) / 1000) * pb.rate;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round10 = (v: number) => Math.round(v * 1e10) / 1e10;

export function reconcile(
  pb: Playback,
  player: PlayerView,
  serverNow: number,
  cfg: ReconcileConfig = DEFAULT_CONFIG,
): ReconcileAction {
  if (pb.paused) {
    if (!player.paused) return { type: "pause" };
    if (Math.abs(pb.anchorMediaTime - player.currentTime) > cfg.hardSeekThreshold) {
      return { type: "seek", to: pb.anchorMediaTime };
    }
    return { type: "none" };
  }

  if (player.paused) return { type: "play" };

  const target = expectedPosition(pb, serverNow);
  const error = target - player.currentTime; // positive => we are behind
  const abs = Math.abs(error);

  if (abs > cfg.hardSeekThreshold) return { type: "seek", to: target + cfg.seekLead };
  if (abs > cfg.softThreshold) {
    return { type: "setRate", rate: round10(clamp(pb.rate + cfg.rateGain * error, cfg.minRate, cfg.maxRate)) };
  }
  return { type: "setRate", rate: pb.rate };
}
