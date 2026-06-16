// Helpers for the self-hosted Firefox update manifest. See
// docs/superpowers/specs/2026-06-15-self-hosted-extension-updates-design.md.

export const ADDON_ID = "fossync@floatpoint.net";

export interface UpdateEntry {
  version: string;
  update_link: string;
  update_hash?: string;
}

export interface UpdatesManifest {
  addons: Record<string, { updates: UpdateEntry[] }>;
}

/**
 * Compare dotted numeric versions (MAJOR.MINOR.PATCH). No pre-release handling
 * (YAGNI). Segments are assumed numeric (versions originate from package.json);
 * non-numeric input yields undefined ordering. Keep in sync with
 * apps/extension/scripts/updates.mjs.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The download link of the highest-version entry for ADDON_ID, or null if there are none. */
export function pickLatest(manifest: UpdatesManifest): string | null {
  const updates = manifest.addons?.[ADDON_ID]?.updates ?? [];
  let best: UpdateEntry | null = null;
  for (const u of updates) {
    if (!best || compareVersions(u.version, best.version) > 0) best = u;
  }
  return best?.update_link ?? null;
}
