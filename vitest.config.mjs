import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      "server-only": fileURLToPath(
        new URL("./tests/empty-server-only.ts", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    restoreMocks: true,
  },
});
