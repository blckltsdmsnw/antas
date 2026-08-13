import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "tests/**/*.test.ts"],
    env: loadEnv("", process.cwd(), ""),
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
