import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.ts"],
    // Several test files run real transactions against the same local
    // Postgres instance (docker-compose, 100 max_connections). Each file
    // gets its own PrismaClient/connection pool — running many files'
    // workers in parallel can exhaust that limit under load, and a pool
    // timeout gets silently absorbed into placeOrderForBasket's generic
    // UNKNOWN error path, surfacing as sporadic, hard-to-reproduce
    // assertion failures rather than a clear connection error. Running
    // files sequentially trades a little wall-clock time for a
    // deterministic suite.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
