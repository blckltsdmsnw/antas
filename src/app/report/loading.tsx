import { PageSkeleton } from "@/components/PageSkeleton";

/**
 * The report form: title, lede, then the depth gauge and the photo card.
 *
 * Two blocks rather than four - the gauge is tall, and a column of equal bars
 * would promise a list where one large control is coming.
 */
export default function Loading() {
  return <PageSkeleton blocks={2} />;
}
