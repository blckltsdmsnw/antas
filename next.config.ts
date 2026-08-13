import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Playwright's E2E baseURL is http://127.0.0.1:3000 (see playwright.config.ts) to
  // match the local Supabase site_url. Next's dev server only implicitly trusts
  // "localhost", so 127.0.0.1 requests for JS chunks get a 403 unless allow-listed.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
