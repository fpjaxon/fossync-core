import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
        // isolatedStorage uses push/pop of SQLite files; v0.5.41 chokes on
        // WAL auxiliary files (.sqlite-shm/.sqlite-wal). These tests carry
        // no shared DO state so isolation is not needed.
        isolatedStorage: false,
      },
    },
  },
});
