import { PageSkeleton } from "@/components/PageSkeleton";

/** Sign in: title, lede, one email field and one button. */
export default function Loading() {
  return <PageSkeleton blocks={2} />;
}
