// Build-time flag, injected by Vite `define` (see wxt.config.ts). True only when
// the extension is built with FOSSYNC_BRANDED=1 (a custom/self-hosted build).
//
// The OFFICIAL production build leaves it FALSE, so every `if (__BRANDED__) { … }`
// branch — the branded ("/j") share-link feature — is dead-code-eliminated and
// never ships. See apps/extension/src/branded.ts and
// docs/superpowers/specs/2026-06-15-branded-share-links-design.md for why.
declare const __BRANDED__: boolean;
