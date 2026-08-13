/**
 * Public URL for a depth-report photo.
 *
 * `report-photos` is a public bucket, so this needs no signing round-trip - the
 * map renders dozens of pins and asking the server for a signed URL per pin
 * would make the sheet wait on the network just to show a thumbnail. SOS photos
 * are the opposite case and deliberately go through `createSignedUrl` instead.
 */
export const REPORT_PHOTO_BUCKET = "report-photos";

/** Storage path shape, keyed by user so the upload policy can scope by folder. */
export function reportPhotoPath(userId: string, at: Date = new Date()): string {
  return `${userId}/${at.getTime()}.jpg`;
}

/**
 * Returns null rather than a broken URL when there is no photo, so callers have
 * to decide what an absent photo looks like instead of rendering an empty box.
 */
export function reportPhotoUrl(
  photoPath: string | null,
  baseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string | null {
  if (!photoPath || !baseUrl) return null;

  const base = baseUrl.replace(/\/+$/, "");
  // Each segment is encoded separately: the slashes in the path are real
  // separators, but a filename may contain characters that are not URL-safe.
  const encoded = photoPath.split("/").map(encodeURIComponent).join("/");

  return `${base}/storage/v1/object/public/${REPORT_PHOTO_BUCKET}/${encoded}`;
}
