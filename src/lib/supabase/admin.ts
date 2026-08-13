import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses every row-level security policy, so it must
 * never be constructed anywhere reachable from the browser.
 *
 * It exists for exactly one job: post-submission enrichment of an SOS signal.
 * By design `authenticated` has INSERT and SELECT on `sos_signals` but NOT
 * UPDATE, and nothing at all on `env_snapshots` - a reporter must not be able
 * to write their own trust score. Enrichment is the server acting on its own
 * behalf, not on the user's, so it needs its own credentials.
 *
 * Never pass a user-supplied value into a query made with this client without
 * validating it first; RLS is not there to catch mistakes here.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured - SOS enrichment cannot run",
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
