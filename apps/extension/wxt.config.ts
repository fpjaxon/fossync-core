import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Video Sync (dev)",
    description: "Start a watch party and sync the page's video.",
    // storage: display name. activeTab: read/redirect the active tab on Start-a-room.
    // hosts: the worker (/new + ws) and the harness page (content-script injection).
    permissions: ["storage", "activeTab"],
    host_permissions: ["http://localhost:8787/*", "http://localhost:5173/*"],
  },
});
