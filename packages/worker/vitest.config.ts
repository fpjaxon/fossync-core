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
        // singleWorker: true prevents workerd from registering the
        // RoomDurableObject migration twice (once per test file) in the same
        // workerd process, which triggers a fatal kj/table.c++:49 assert.
        // All test files share one runtime; unique room codes keep tests
        // from interfering with each other.
        singleWorker: true,
      },
    },
  },
});
