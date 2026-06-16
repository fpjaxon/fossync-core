import type { ConnectionQuality } from "@fossync/sync-core";

// Pure mapping from a connection-quality tier to how the signal-bars icon renders.
// Colors reuse the fossync palette (teal / amber / coral) + muted grey for measuring.

export interface QualityIcon {
  bars: 0 | 1 | 2 | 3; // filled signal bars
  color: string; // bar color for the filled bars
  pulse: boolean; // gentle pulse while measuring
  label: string; // tier word for the tooltip
}

export function qualityToIcon(q: ConnectionQuality): QualityIcon {
  switch (q) {
    case "good":
      return { bars: 3, color: "#15B8A0", pulse: false, label: "Good" };
    case "fair":
      return { bars: 2, color: "#FFC73E", pulse: false, label: "Fair" };
    case "poor":
      return { bars: 1, color: "#FF5A3C", pulse: false, label: "Poor" };
    case "measuring":
      return { bars: 0, color: "#9aa", pulse: true, label: "Measuring…" };
  }
}
