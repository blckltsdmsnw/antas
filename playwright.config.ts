import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // 127.0.0.1, not localhost: browsers treat them as different origins, and the local
  // Supabase site_url is http://127.0.0.1:3000. On localhost the OTP redirect silently
  // lands on the site root instead of /auth/confirm.
  use: { baseURL: "http://127.0.0.1:3000" },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: true,
  },
});
