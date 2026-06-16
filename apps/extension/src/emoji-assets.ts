// The supported reaction set and the mapping to their animated assets.
//
// Assets are pre-rendered animated WebP (128px) under public/emoji/, derived
// from Google's Noto Animated Emoji (CC BY 4.0 — see NOTICE). They're shipped
// with the extension and loaded lazily by the reaction layer via
// browser.runtime.getURL; this module stays pure (no `browser`) so it's unit
// testable in the node test env.

export const REACTIONS = ["😂", "❤️", "😮", "👏", "🔥"] as const;
export type Reaction = (typeof REACTIONS)[number];

const FILES: Record<string, string> = {
  "😂": "joy.webp",
  "❤️": "heart.webp",
  "😮": "open_mouth.webp",
  "👏": "clap.webp",
  "🔥": "fire.webp",
};

/**
 * Path (relative to the extension root) of the animated asset for an emoji, or
 * null when there's no asset — callers fall back to rendering the native glyph.
 */
export function assetPath(emoji: string): string | null {
  const file = FILES[emoji];
  return file ? `emoji/${file}` : null;
}
