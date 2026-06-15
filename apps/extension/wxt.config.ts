import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "fossync (dev)",
    description: "Start a watch party and sync the page's video.",
    // storage: display name. activeTab: read/redirect the active tab on Start Sync.
    // hosts: the deployed worker (fossync.cloud) + the harness page (injection).
    permissions: ["storage", "activeTab"],
    host_permissions: ["https://fossync.cloud/*", "http://localhost:5173/*", "*://www.youtube.com/*"],
  },
});
