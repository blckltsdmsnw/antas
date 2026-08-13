import type { Reason } from "@/lib/scoring/types";

const KIND_MARK: Record<Reason["kind"], string> = {
  supporting: "+",
  concerning: "!",
  unknown: "?",
};

/**
 * The console never shows a bare number alone. A moderator can act on a
 * sentence in seconds and can argue with it; a score of 34 tells them only to
 * obey or ignore.
 */
export function ReasonList({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) {
    return <p className="reason-empty">Wala pang pagsusuri.</p>;
  }

  return (
    <ul className="reason-list">
      {reasons.map((reason) => (
        <li key={reason.text} className="reason" data-kind={reason.kind}>
          <span className="reason-mark" aria-hidden="true">
            {KIND_MARK[reason.kind]}
          </span>
          {reason.text}
        </li>
      ))}
    </ul>
  );
}
