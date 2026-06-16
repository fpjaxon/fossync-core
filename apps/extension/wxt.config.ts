import { defineConfig } from "wxt";

export default defineConfig({
  // Build flag: branded ("/j") share links are compiled in only when
  // FOSSYNC_BRANDED=1. The official release build (scripts/release.mjs runs a
  // plain `pnpm build`) leaves it false, so all `if (__BRANDED__)` branches are
  // dead-code-eliminated and the feature never ships. See src/branded.ts.
  vite: () => ({
    define: { __BRANDED__: JSON.stringify(process.env.FOSSYNC_BRANDED === "1") },
  }),
  manifest: {
    name: "fossync",
    description: "Start a watch party and sync the page's video.",
    // storage: display name. activeTab: read/redirect the active tab on Start Sync.
    // hosts: the deployed worker (fossync.cloud) + harness (fossync.cloud) for injection.
    permissions: ["storage", "activeTab"],
    // Animated reaction emoji, loaded from the content script via runtime.getURL.
    web_accessible_resources: ["emoji/*.webp"],
    host_permissions: [
      "https://fossync.cloud/*",
      "https://harness.fossync.cloud/*",
      "http://localhost:5173/*",
      "*://www.youtube.com/*",
      "*://www.crunchyroll.com/*",
    ],
    browser_specific_settings: {
      // `data_collection_permissions` postdates wxt 0.19's manifest types.
      gecko: {
        // Permanent add-on ID — AMO requires it for new submissions.
        id: "fossync@floatpoint.net",
        // Self-hosted update manifest (see docs/superpowers/specs/
        // 2026-06-15-self-hosted-extension-updates-design.md). Installed copies
        // poll this; legal because we self-distribute (unlisted), not list on AMO.
        update_url: "https://fossync.cloud/updates.json",
        // fossync collects nothing: the display name is stored locally (a
        // default-random pseudonym), and only playback control signals are sent.
        data_collection_permissions: { required: ["none"] },
      } as any,
    },
  },
});
