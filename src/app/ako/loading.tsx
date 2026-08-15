import { PageSkeleton } from "@/components/PageSkeleton";

/**
 * Ako: title, whose session this is, the phone field, then your reports.
 *
 * Three blocks. The list length is unknowable here - it depends on what you
 * have filed - and guessing high would leave the page shrinking when the real
 * answer turns out to be "wala ka pang naipadalang report".
 */
export default function Loading() {
  return <PageSkeleton blocks={3} />;
}
