import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The app's data layer is plain TypeScript — the collection store, the domain
 * mappings and the URL vocabulary — so it is tested in Node with a small
 * `localStorage` stand-in rather than under a full DOM. Only the `@/` alias has
 * to be taught to the runner.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
