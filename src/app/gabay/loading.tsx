import { PageSkeleton } from "@/components/PageSkeleton";

/**
 * The guide opens with a title, a lede, and the hotline cards.
 *
 * Four blocks: the two number cards, the note under them, and the start of the
 * go bag. Enough to fill a phone screen without standing taller than the page
 * it is holding a place for.
 */
export default function Loading() {
  return <PageSkeleton blocks={4} />;
}
