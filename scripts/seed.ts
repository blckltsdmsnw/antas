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
 *   npm run seed              -> marikina (default)
 *   npm run seed -- taguig    -> taguig
 *   npm run seed -- all       -> both
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

const requested = (process.argv[2] ?? "marikina").toLowerCase();
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

const REPORTS_PER_HOTSPOT = 25;
const SCATTER_DEGREES = 0.004;
const MAX_HOURS_AGO = 72;

async function main() {
  const { data, error } = await admin.auth.admin.createUser({
    email: `seed-${Date.now()}@example.test`,
    password: "seed-password-123",
    email_confirm: true,
  });
  if (error) throw error;
  const reporterId = data.user!.id;

  const rows = HOTSPOTS.flatMap((hotspot) =>
    Array.from({ length: REPORTS_PER_HOTSPOT }, () => {
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
    }),
  );

  const { error: insertError } = await admin.from("depth_reports").insert(rows);
  if (insertError) throw insertError;

  console.log(`Seeded ${rows.length} depth reports.`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Seed script failed: ${message}`);
  process.exit(1);
});
