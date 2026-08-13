import { createClient } from "@supabase/supabase-js";

/**
 * Grants an existing user the moderator role for one barangay.
 *
 *   npm run make-moderator -- someone@example.com Malanday
 *
 * Deliberately a script and not a UI: in a real deployment a moderator is a
 * vetted person at a barangay desk, not someone who signed up. Self-service
 * would be the wrong shape entirely.
 */
const [email, barangay] = process.argv.slice(2);

if (!email || !barangay) {
  console.error("usage: npm run make-moderator -- <email> <barangay>");
  process.exit(1);
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  const { data: known, error: barangayError } = await admin
    .from("barangays")
    .select("name")
    .eq("name", barangay)
    .maybeSingle();
  if (barangayError) throw barangayError;
  if (!known) {
    const { data: all } = await admin.from("barangays").select("name");
    throw new Error(
      `unknown barangay "${barangay}". Known: ${(all ?? []).map((b) => b.name).join(", ")}`,
    );
  }

  const { data: list, error: listError } = await admin.auth.admin.listUsers();
  if (listError) throw listError;
  const user = list.users.find((u) => u.email === email);
  if (!user) {
    throw new Error(`no user with email ${email} - they must sign in once first`);
  }

  const { error } = await admin
    .from("moderators")
    .upsert({ user_id: user.id, barangay }, { onConflict: "user_id" });
  if (error) throw error;

  console.log(`${email} is now a moderator for ${barangay}.`);
}

main().catch((error: unknown) => {
  console.error(
    "make-moderator failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
