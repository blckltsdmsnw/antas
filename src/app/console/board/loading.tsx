import { PageSkeleton } from "@/components/PageSkeleton";

/** A title and four blocks: the columns, before they have anything in them. */
export default function Loading() {
  return <PageSkeleton blocks={4} lede={false} />;
}
