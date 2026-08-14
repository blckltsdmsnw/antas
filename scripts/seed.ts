import { createClient } from "@supabase/supabase-js";
import { DEPTH_LEVELS } from "../src/lib/depth/scale";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Low-lying areas flood deeper; these anchor points shape the scenario.
 *
 * Riverside and lakeside barangays carry the higher severities, because that is
 * where these cities actually flood - Marikina along its river, Taguig toward
 * the Napindan channel and the Laguna de Bay side.
 *
 *   npm run seed                 -> marikina (default), 25 per hotspot
 *   npm run seed -- taguig       -> taguig
 *   npm run seed -- all          -> both
 *   npm run seed -- taguig 10    -> taguig, 10 reports TOTAL
 *
 * The optional count is a total, not a per-hotspot figure. Seeding a live map
 * is not the same as filling a test database: a handful of pins reads as a
 * neighbourhood reporting, while a hundred reads as noise and buries the real
 * reports underneath it.
 */
const AREAS: Record<string, { lat: number; lon: number; severity: number }[]> = {
  marikina: [
    { lat: 14.6507, lon: 121.1029, severity: 4 },
    { lat: 14.6412, lon: 121.0968, severity: 3 },
    { lat: 14.6688, lon: 121.1104, severity: 2 },
    { lat: 14.6301, lon: 121.0885, severity: 1 },
  ],
  taguig: [
    { lat: 14.545, lon: 121.09, severity: 4 }, // Napindan, at the river junction
    { lat: 14.529, lon: 121.068, severity: 3 }, // Ususan
    { lat: 14.497, lon: 121.053, severity: 3 }, // New Lower Bicutan
    { lat: 14.503, lon: 121.064, severity: 2 }, // Lower Bicutan
  ],
};

/**
 * `--standing` also gives the seed reporter an earned-looking track record, so
 * the `reporter_standing` line on the report card has something to show.
 *
 * OPT-IN, AND IT SHOULD STAY OPT-IN. Seeded pins are ordinary demo data; a
 * seeded standing is different in kind, because the badge's entire meaning is
 * "other people checked this and it held up". Writing one by hand fabricates
 * exactly the evidence it reports. Fine on a portfolio demo with no real users,
 * wrong anywhere it would be read as true - so it never happens unless it is
 * asked for by name.
 *
 * The rows it writes are deliberately findable: the reports are `status =
 * 'hidden'` so they never reach the map, and every account involved is under
 * @example.test. docs/STATUS.md carries the cleanup.
 */
const WITH_STANDING = process.argv.includes("--standing");

// Positional arguments only, so the flag can sit anywhere in the command.
const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const requested = (positional[0] ?? "marikina").toLowerCase();
const areaNames = requested === "all" ? Object.keys(AREAS) : [requested];

for (const name of areaNames) {
  if (!AREAS[name]) {
    console.error(
      `unknown area "${name}". Known: ${Object.keys(AREAS).join(", ")}, all`,
    );
    process.exit(1);
  }
}

const HOTSPOTS = areaNames.flatMap((name) => AREAS[name]);

const DEFAULT_PER_HOTSPOT = 25;
const SCATTER_DEGREES = 0.004;
const MAX_HOURS_AGO = 72;

/**
 * Total rows to write. Without an explicit count this keeps the old
 * per-hotspot default, so existing invocations behave as they always did.
 */
const totalArg = positional[1];
const TOTAL =
  totalArg === undefined
    ? HOTSPOTS.length * DEFAULT_PER_HOTSPOT
    : Number(totalArg);

if (!Number.isInteger(TOTAL) || TOTAL < 1) {
  console.error(`count must be a positive whole number, got "${totalArg}"`);
  process.exit(1);
}

async function main() {
  const email = `seed-${Date.now()}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: "seed-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  const reporterId = data.user!.id;

  // Printed because these rows outlive the command that made them. Against a
  // live project, "which account owns this demo data" is the first thing you
  // need and the hardest to work out afterwards.
  console.log(`Seed account: ${email} (${reporterId})`);

  // Round-robin across hotspots so a small count still spreads over every area
  // rather than piling all of it onto the first one.
  const rows = Array.from({ length: TOTAL }, (_, index) => {
    const hotspot = HOTSPOTS[index % HOTSPOTS.length];
    const jitter = () => (Math.random() - 0.5) * SCATTER_DEGREES;
    const level = Math.max(
      0,
      Math.min(
        DEPTH_LEVELS.length - 1,
        hotspot.severity + Math.round((Math.random() - 0.5) * 2),
      ),
    );
    const hoursAgo = Math.floor(Math.random() * MAX_HOURS_AGO);

    return {
      reporter_id: reporterId,
      location: `SRID=4326;POINT(${hotspot.lon + jitter()} ${hotspot.lat + jitter()})`,
      depth: DEPTH_LEVELS[level],
      source: "seed" as const,
      reported_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
    };
  });

  const { error: insertError } = await admin.from("depth_reports").insert(rows);
  if (insertError) throw insertError;

  console.log(`Seeded ${rows.length} depth reports.`);

  if (WITH_STANDING) await seedStanding(reporterId);
}

/** How much history `reporter_standing` needs before it will say anything. */
const STANDING_REPORTS = 4;
const STANDING_VOTERS = 3;
const CONFIRMED_AFTER_MINUTES = 10;

/**
 * A track record for the seed reporter, so their pins carry the standing line.
 *
 * These reports are `source: "user"` because `reporter_standing` deliberately
 * ignores seeded rows - somebody's demo data is not their track record. That
 * makes these four rows indistinguishable from real reports at the database
 * level, which is the honest cost of seeding this at all, and the reason it is
 * behind a flag. They are hidden, so at least they never reach the map.
 */
async function seedStanding(reporterId: string) {
  const voters: string[] = [];
  for (let index = 0; index < STANDING_VOTERS; index += 1) {
    const { data, error } = await admin.auth.admin.createUser({
      email: `seed-voter-${Date.now()}-${index}@example.test`,
      email_confirm: true,
    });
    if (error) throw error;
    voters.push(data.user!.id);
  }

  for (let index = 0; index < STANDING_REPORTS; index += 1) {
    // Older than the map's own window, so this reads as history rather than as
    // something that just happened.
    const reportedAt = new Date(Date.now() - (index + 4) * 3_600_000);

    const { data: past, error } = await admin
      .from("depth_reports")
      .insert({
        reporter_id: reporterId,
        location: `SRID=4326;POINT(${HOTSPOTS[0].lon} ${HOTSPOTS[0].lat})`,
        depth: "knee" as const,
        source: "user" as const,
        status: "hidden" as const,
        reported_at: reportedAt.toISOString(),
      })
      .select("id")
      .single();
    if (error) throw error;

    // Confirmed inside the hour, which is the only window that counts: after
    // that, "wala na" describes the weather rather than a bad report.
    const { error: updateError } = await admin.from("report_updates").insert({
      report_id: past!.id,
      reporter_id: voters[index % voters.length],
      state: "same" as const,
      created_at: new Date(
        reportedAt.getTime() + CONFIRMED_AFTER_MINUTES * 60_000,
      ).toISOString(),
    });
    if (updateError) throw updateError;
  }

  console.log(
    `Seeded a standing for the seed reporter: ${STANDING_REPORTS} hidden reports, each confirmed.`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed script failed: ${message}`);
  process.exit(1);
});
