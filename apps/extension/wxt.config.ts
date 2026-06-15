import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Video Sync (dev)",
    description: "Staging popup: runs the sync-core SyncClient and launches the harness.",
    // Needed for the /new fetch and the ws://localhost:8787 WebSocket. WXT places
    // host permissions correctly per manifest version (MV2 vs MV3).
    host_permissions: ["http://localhost:8787/*"],
  },
});
