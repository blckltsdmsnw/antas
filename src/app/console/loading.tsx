import { PageSkeleton } from "@/components/PageSkeleton";

/**
 * The moderator queue: a title, then signal cards.
 *
 * No lede - the real page goes straight from heading to list. Four blocks,
 * because a genuinely empty queue says so in one sentence, and a fallback
 * taller than that sentence would make an empty desk look busy for a moment.
 */
export default function Loading() {
  return <PageSkeleton blocks={4} lede={false} />;
}
