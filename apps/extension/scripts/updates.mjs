// Release-side helpers for the self-hosted Firefox update manifest. Node ESM —
// kept separate from packages/worker/src/updates.ts because the two run in
// different runtimes. Keep compareVersions in sync with that file.

/**
 * Compare dotted numeric versions (MAJOR.MINOR.PATCH). No pre-release handling
 * (YAGNI). Segments are assumed numeric (versions originate from package.json);
 * non-numeric input yields undefined ordering. Keep in sync with
 * packages/worker/src/updates.ts.
 */
export function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** A fresh manifest with one empty add-on bucket. */
export function emptyManifest(addonId) {
  return { addons: { [addonId]: { updates: [] } } };
}

/**
 * Return a new manifest with `entry` inserted for `addonId` (replacing any entry
 * with the same version), updates sorted ascending. Other add-on ids are kept.
 */
export function upsertVersion(manifest, addonId, entry) {
  // Shallow copy — other addon buckets share references with the input; callers
  // must not mutate them in place.
  const addons = { ...(manifest?.addons ?? {}) };
  const existing = addons[addonId]?.updates ?? [];
  const updates = existing
    .filter((u) => u.version !== entry.version)
    .concat(entry)
    .sort((a, b) => compareVersions(a.version, b.version));
  addons[addonId] = { updates };
  return { addons };
}
