import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "fossync (dev)",
    description: "Start a watch party and sync the page's video.",
    // storage: display name. activeTab: read/redirect the active tab on Start Sync.
    // hosts: the deployed worker (fossync.cloud) + harness (fossync.cloud) for injection.
    permissions: ["storage", "activeTab"],
    host_permissions: [
      "https://fossync.cloud/*",
      "https://harness.fossync.cloud/*",
      "http://localhost:5173/*",
      "*://www.youtube.com/*",
    ],
    browser_specific_settings: {
      // `data_collection_permissions` postdates wxt 0.19's manifest types.
      gecko: {
        // Permanent add-on ID — AMO requires it for new submissions.
        id: "fossync@floatpoint.net",
        // fossync collects nothing: the display name is stored locally (a
        // default-random pseudonym), and only playback control signals are sent.
        data_collection_permissions: { required: ["none"] },
      } as any,
    },
  },
});
