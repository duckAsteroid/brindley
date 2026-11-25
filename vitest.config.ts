import { configDefaults, defineConfig } from "vitest/config";

// sidebar/ is a Claude Code plugin tested with `claude plugin test` (its tests import
// claude-code/testing), so vitest leaves it out.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "sidebar/**"],
  },
});
