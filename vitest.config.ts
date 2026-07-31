import { defineConfig } from "vitest/config";
import { sharedTest } from "./vitest.shared.ts";

export default defineConfig({
  test: {
    projects: [
      "packages/*",
      {
        // The integration suite lives outside `packages/` on purpose: the
        // eslint boundary rules scope "chain packages can't import each
        // other" to `packages/chain-*`, so a root-level harness is the one
        // place that may import all three chains at once. It has no vitest
        // config of its own, so it's declared inline here rather than as a
        // bare glob.
        test: {
          ...sharedTest,
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
        },
      },
      {
        // Unit tests for the WXT extension's pure background logic (units,
        // account ids, settings rules, error classification). Kept in `test/`
        // rather than colocated, and driven from source so no build is needed.
        test: {
          ...sharedTest,
          name: "extension",
          include: ["test/extension/**/*.test.ts"],
        },
      },
      {
        // Unit tests for the API's pure logic (aggregator route parsing), driven
        // from apps/api source. Same rationale as the extension project above.
        test: {
          ...sharedTest,
          name: "api",
          include: ["test/api/**/*.test.ts"],
        },
      },
    ],
  },
});
