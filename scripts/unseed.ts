import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Removes everything `seed.ts` wrote, and nothing else.
 *
 *   npx tsx --env-file=.env.hosted scripts/unseed.ts        -> shows what it would delete
 *   npx tsx --env-file=.env.hosted scripts/unseed.ts --yes  -> actually deletes
 *
 * DRY RUN BY DEFAULT, because the natural place to point this is production.
 * The cleanup existed only as SQL pasted into the dashboard, where there is no
 * dry run, no count beforehand, and no second chance - and where a mistyped
 * `like` pattern takes the real accounts with it.
 *
 * Everything seeded is under `@example.test`: the reporter as
 * `seed-<ts>@example.test`, and the `--standing` voters as
 * `seed-voter-<ts>-<n>@example.test`. Both carry the `seed-` prefix, so one
 * pattern catches the lot. Deleting the account cascades to its
 * `depth_reports` and `report_updates`.
 *
 * WHY THIS MATTERS MORE THAN ORDINARY DEMO DATA. `--standing` writes a
 * fabricated track record: hidden reports, each confirmed inside the hour, so
 * `reporter_standing` returns `reliable` for the seeded pins. That badge means
 * "other people checked this and it held up". Left on a map real people are
 * reading, it is not clutter - it is evidence of something that never happened.
 */

const CONFIRMED = process.argv.includes("--yes");

/** Matches what `seed.ts` creates, and deliberately nothing looser. */
function isSeeded(email: string | undefined): boolean {
  return (
    email !== undefined &&
    email.startsWith("seed-") &&
    email.endsWith("@example.test")
  );
}

async function allUsers() {
  const users: { id: string; email?: string }[] = [];

  // Paginated because the default page is 50 and a standing seed alone creates
  // several voters; a single unpaginated call would quietly miss the tail and
  // report a clean database with rows still in it.
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email })));
    if (data.users.length < 200) return users;
  }
}

async function countFor(
  ids: string[],
): Promise<{ reports: number; updates: number }> {
  if (ids.length === 0) return { reports: 0, updates: 0 };

  const { count: reports, error: reportError } = await admin
    .from("depth_reports")
    .select("id", { count: "exact", head: true })
    .in("reporter_id", ids);
  if (reportError) throw reportError;

  const { count: updates, error: updateError } = await admin
    .from("report_updates")
    .select("report_id", { count: "exact", head: true })
    .in("reporter_id", ids);
  if (updateError) throw updateError;

  return { reports: reports ?? 0, updates: updates ?? 0 };
}

async function main() {
  const users = await allUsers();
  const seeded = users.filter((u) => isSeeded(u.email));
  const real = users.filter((u) => !isSeeded(u.email));

  const seededCounts = await countFor(seeded.map((u) => u.id));
  const realCounts = await countFor(real.map((u) => u.id));

  console.log(`Seeded accounts:  ${seeded.length}`);
  for (const user of seeded) console.log(`  ${user.email}`);
  console.log(`Seeded reports:   ${seededCounts.reports}`);
  console.log(`Seeded updates:   ${seededCounts.updates}`);
  console.log("");

  // Printed every run, so the blast radius is visible before the delete rather
  // than inferred from it afterwards.
  console.log(`Real accounts kept: ${real.length}`);
  console.log(`Real reports kept:  ${realCounts.reports}`);

  if (seeded.length === 0) {
    console.log("\nNothing to remove.");
    return;
  }

  if (!CONFIRMED) {
    console.log(
      "\nDry run. Re-run with --yes to delete the accounts listed above.",
    );
    return;
  }

  for (const user of seeded) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw new Error(`could not delete ${user.email}: ${error.message}`);
  }

  // Re-counted from the database rather than assumed from the delete calls -
  // the cascade is what actually removes the reports, and trusting it without
  // looking is how a map keeps showing pins whose owners are gone.
  const after = await countFor(seeded.map((u) => u.id));
  console.log(`\nDeleted ${seeded.length} accounts.`);
  console.log(`Reports remaining for them: ${after.reports} (expected 0)`);
  console.log(`Updates remaining for them: ${after.updates} (expected 0)`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Unseed script failed: ${message}`);
  process.exit(1);
});
