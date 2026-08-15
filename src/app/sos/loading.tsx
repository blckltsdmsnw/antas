import { PageSkeleton } from "@/components/PageSkeleton";

/**
 * Tulong.
 *
 * A skeleton here does not slow anybody down - it replaces the old page
 * sitting frozen after the tap, which is the state that actually reads as
 * "nothing happened, press it again". Nothing on this screen can be acted on
 * before it is real in any case: an SOS is only sent by a live photo and a
 * three-second hold, and neither exists until the page does.
 *
 * Three blocks: the demonstration notice, the camera card, the hold button.
 * The notice leads on the real page and leads here too, so the shape somebody
 * sees while waiting is the shape they get.
 */
export default function Loading() {
  return <PageSkeleton blocks={3} lede={false} />;
}
