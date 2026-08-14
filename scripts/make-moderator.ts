import { createClient } from "@supabase/supabase-js";

/**
 * Grants an existing user the moderator role for one barangay.
 *
 *   npm run make-moderator -- someone@example.com Malanday
 *   npm run make-moderator -- someone@example.com Malanday --admin
 *
 * Deliberately a script and not a UI: in a real deployment a moderator is a
 * vetted person at a barangay desk, not someone who signed up. Self-service
 * would be the wrong shape entirely.
 *
 * `--admin` grants the admin role, which sees EVERY barangay's queue rather
 * than one. It is the same act of vetting, one level wider, and it stays here
 * rather than moving into the application for exactly the reason above: an SOS
 * carries a distressed person's exact location and photograph, so if scope
 * could be changed from inside the product, one account could reach every
 * signal in the country by typing a different barangay.
 *
 * A barangay is still required with --admin. The row has to name somewhere -
 * an admin is a person at a desk who can also cover others, not a floating
 * permission - and it is where they land when the wider role is taken away.
 */
const args = process.argv.slice(2);
const isAdmin = args.includes("--admin");

// Positional arguments only, so the flag can sit anywhere in the command.
const [email, barangay] = args.filter((arg) => !arg.startsWith("--"));

if (!email || !barangay) {
  console.error("usage: npm run make-moderator -- <email> <barangay> [--admin]");
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

  const role = isAdmin ? "admin" : "moderator";

  // The role is written every time, not only when --admin is passed. Omitting
  // it would make re-running without the flag silently leave an existing admin
  // as an admin, so there would be no way to narrow somebody again.
  const { error } = await admin
    .from("moderators")
    .upsert({ user_id: user.id, barangay, role }, { onConflict: "user_id" });
  if (error) throw error;

  console.log(
    isAdmin
      ? `${email} is now an admin, based at ${barangay} and able to see every barangay.`
      : `${email} is now a moderator for ${barangay}.`,
  );
}

main().catch((error: unknown) => {
  console.error(
    "make-moderator failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
