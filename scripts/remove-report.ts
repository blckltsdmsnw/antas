import { createClient } from "@supabase/supabase-js";
import { REPORT_PHOTO_BUCKET } from "../src/lib/reports/photo";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * Takes a depth report off the map and deletes its photograph.
 *
 *   npx tsx --env-file=.env.hosted scripts/remove-report.ts              -> list
 *   npx tsx --env-file=.env.hosted scripts/remove-report.ts --remove ID  -> remove
 *
 * HIDING THE REPORT IS NOT ENOUGH, and that is the whole reason this exists.
 * `report-photos` is a PUBLIC bucket - deliberately, so the map can render
 * dozens of thumbnails without a signing round-trip per pin. Setting
 * `status = 'hidden'` removes the pin from the map and leaves the image sitting
 * at a public URL that anyone holding the link can still open. So this deletes
 * the storage object first, then nulls `photo_path`, then hides the row.
 *
 * The row itself is hidden rather than deleted, matching what the in-app
 * "Tanggalin" control does: a report is evidence that somebody reported
 * something. What is destroyed here is the photograph, because that is what was
 * asked for and what cannot be un-published any other way.
 *
 * Order matters. Storage first: if the row were hidden first and the storage
 * delete then failed, the image would still be public with nothing on the map
 * pointing at it - the worst outcome, because it would look handled.
 */

const args = process.argv.slice(2);
const removeAt = args.indexOf("--remove");
const targetId = removeAt === -1 ? null : args[removeAt + 1];

interface Row {
  id: string;
  reporter_id: string;
  depth: string;
  photo_path: string | null;
  status: string;
  reported_at: string;
}

/** What `reports_near` gives back: coordinates computed from the geography. */
interface NearRow {
  id: string;
  depth: string;
  lat: number;
  lon: number;
  photo_path: string | null;
  reported_at: string;
}

/** Rough boxes, only for labelling the listing so a human can pick the right row. */
function area(lat: number, lon: number): string {
  if (lat > 14.6 && lon > 121.05) return "Marikina";
  if (lat < 14.58 && lon > 121.0) return "Taguig";
  return "other";
}

const COLUMNS = "id, reporter_id, depth, photo_path, status, reported_at";

/**
 * Listed through `reports_near` rather than by selecting the table.
 *
 * `depth_reports` stores a PostGIS `geography` column, not `lat`/`lon`, and
 * PostgREST hands that back as WKB hex - unreadable here. `reports_near` is the
 * function the map itself calls, so what it returns is by definition what is
 * visible to a viewer, which is exactly the question being asked.
 */
async function list() {
  const { data, error } = await admin.rpc("reports_near", {
    lat: 14.58,
    lon: 121.02,
    radius_m: 40000,
  });
  if (error) throw error;

  const rows = (data ?? []) as NearRow[];
  if (rows.length === 0) {
    console.log("No reports visible on the map.");
    return;
  }

  for (const r of rows) {
    console.log(
      `${r.id}  ${area(r.lat, r.lon).padEnd(8)}  ${r.depth.padEnd(10)}  ` +
        `${r.photo_path ? "PHOTO" : "no photo"}  ${r.reported_at}`,
    );
    console.log(`    ${r.lat}, ${r.lon}`);
    if (r.photo_path) console.log(`    photo_path: ${r.photo_path}`);
  }

  const exposed = rows.filter((r) => r.photo_path);
  console.log(
    `\n${rows.length} pins visible to viewers; ${exposed.length} carry a photograph.`,
  );
  console.log("Re-run with --remove <id> to delete a photograph and hide its report.");
}

async function remove(id: string) {
  const { data, error } = await admin
    .from("depth_reports")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`no report with id ${id}`);

  const row = data as unknown as Row;
  console.log(`Report:     ${row.id}`);
  console.log(`Depth:      ${row.depth}`);
  console.log(`Status:     ${row.status}`);
  console.log(`Photo path: ${row.photo_path ?? "(none)"}`);

  // Storage first. See the note at the top: a hidden row with a live public
  // image is worse than either problem alone, because it looks dealt with.
  if (row.photo_path) {
    const { error: storageError } = await admin.storage
      .from(REPORT_PHOTO_BUCKET)
      .remove([row.photo_path]);
    if (storageError) {
      throw new Error(
        `storage delete failed, nothing else changed: ${storageError.message}`,
      );
    }

    // Confirmed by asking for the object back rather than trusting the delete.
    const folder = row.photo_path.split("/")[0];
    const name = row.photo_path.split("/").pop();
    const { data: still } = await admin.storage
      .from(REPORT_PHOTO_BUCKET)
      .list(folder);
    const survived = (still ?? []).some((o) => o.name === name);
    console.log(
      survived
        ? "Photo:      STILL PRESENT after delete - investigate before trusting this"
        : "Photo:      deleted from storage, confirmed gone",
    );
  }

  const { error: updateError } = await admin
    .from("depth_reports")
    .update({ photo_path: null, status: "hidden" })
    .eq("id", row.id);
  if (updateError) throw updateError;

  console.log("Report:     photo_path cleared, status set to hidden (off the map)");
}

const run = targetId ? remove(targetId) : list();

run.catch((error: unknown) => {
  // Supabase rejects with a plain object, not an Error, so `String(error)`
  // renders "[object Object]" and hides the only useful part - the message and
  // the Postgres code. Print the whole thing rather than a summary of nothing.
  const message =
    error instanceof Error ? error.message : JSON.stringify(error, null, 2);
  console.error(`remove-report failed: ${message}`);
  process.exit(1);
});
