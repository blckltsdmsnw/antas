/**
 * What a task page looks like before its content arrives.
 *
 * WORDLESS, and that is a requirement rather than a style choice. A
 * `loading.tsx` that read the language cookie could not be prerendered, and an
 * un-prerendered fallback cannot be prefetched - which is the whole reason this
 * exists. So the skeleton says nothing, needs no translation, and is the same
 * file in both languages.
 *
 * It mirrors the real page's geometry - same `task-page` container, a title
 * band at the display size, a lede, then blocks - so the swap when content
 * lands is a fill rather than a jump. A skeleton that does not match the thing
 * it stands in for trades one kind of roughness for another.
 *
 * Hidden from assistive technology on purpose. These bars are decoration, and
 * announcing them would either say nothing useful or say "Loading" in whichever
 * language this file happened to guess. The real page announces itself when it
 * arrives, which is the honest moment to speak.
 */

interface PageSkeletonProps {
  /**
   * How many content blocks to stand in for. Roughly what the real page opens
   * with - enough to fill the screen, never so many that the fallback is
   * taller than the page replacing it.
   */
  blocks?: number;
  /** Skips the lede lines, for the few pages whose title stands alone. */
  lede?: boolean;
}

export function PageSkeleton({ blocks = 3, lede = true }: PageSkeletonProps) {
  return (
    <main className="task-page" aria-hidden="true">
      <div className="skeleton-title skeleton-bar" />
      {lede && (
        <>
          <div className="skeleton-lede skeleton-bar" />
          <div className="skeleton-lede skeleton-bar skeleton-lede--short" />
        </>
      )}

      <div className="skeleton-blocks">
        {Array.from({ length: blocks }, (_, i) => (
          <div key={i} className="skeleton-block skeleton-bar" />
        ))}
      </div>
    </main>
  );
}
