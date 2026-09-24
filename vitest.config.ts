import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so unit tests do not boot the Workers runtime.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "worker/**/*.test.ts", "shared/**/*.test.ts"],
    environment: "node",
  },
});
