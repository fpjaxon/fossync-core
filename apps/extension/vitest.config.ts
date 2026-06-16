import { defineConfig } from "vitest/config";

export default defineConfig({
  // Tests run with branded enabled so both code paths are reachable; the off-state
  // (official build) is proven by the build-exclusion grep in the release flow.
  define: { __BRANDED__: "true" },
  test: { environment: "node", include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"] },
});
