import { describe, it, expect } from "vitest";
import { REPORT_PHOTO_BUCKET, reportPhotoPath, reportPhotoUrl } from "./photo";

const USER = "a1b2c3d4-0000-4000-8000-000000000000";
const BASE = "https://example.supabase.co";

describe("reportPhotoPath", () => {
  it("puts the photo in a folder named for the uploader", () => {
    // The storage policy scopes uploads by first path segment, so this shape is
    // load-bearing, not cosmetic.
    const path = reportPhotoPath(USER, new Date(1_755_100_000_000));
    expect(path).toBe(`${USER}/1755100000000.jpg`);
    expect(path.split("/")[0]).toBe(USER);
  });

  it("gives two photos from the same user distinct names", () => {
    const first = reportPhotoPath(USER, new Date(1_755_100_000_000));
    const second = reportPhotoPath(USER, new Date(1_755_100_000_001));
    expect(first).not.toBe(second);
  });
});

describe("reportPhotoUrl", () => {
  it("addresses the public bucket", () => {
    expect(reportPhotoUrl(`${USER}/1755100000000.jpg`, BASE)).toBe(
      `${BASE}/storage/v1/object/public/${REPORT_PHOTO_BUCKET}/${USER}/1755100000000.jpg`,
    );
  });

  it("keeps path separators while escaping the filename", () => {
    const url = reportPhotoUrl(`${USER}/a b.jpg`, BASE);
    expect(url).toContain(`/${USER}/a%20b.jpg`);
    expect(url).not.toContain(`${USER}%2F`);
  });

  it("tolerates a trailing slash on the configured base", () => {
    expect(reportPhotoUrl("u/1.jpg", `${BASE}/`)).toBe(
      `${BASE}/storage/v1/object/public/${REPORT_PHOTO_BUCKET}/u/1.jpg`,
    );
  });

  it("returns null when there is no photo", () => {
    // A report without a photo is the common case, not an error - callers must
    // render something deliberate rather than an empty image box.
    expect(reportPhotoUrl(null, BASE)).toBeNull();
  });

  it("returns null when the project URL is missing", () => {
    // Empty string, not undefined: `undefined` triggers the default parameter
    // and falls back to the env var, so it cannot exercise this guard at all.
    expect(reportPhotoUrl("u/1.jpg", "")).toBeNull();
  });
});
