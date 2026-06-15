import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Video Sync (dev)",
    description: "Staging popup: runs the sync-core SyncClient and launches the harness.",
    // storage: persist the display name. host: the /new fetch + ws://localhost:8787.
    // WXT places these correctly per manifest version (MV2 vs MV3).
    permissions: ["storage"],
    host_permissions: ["http://localhost:8787/*"],
  },
});
