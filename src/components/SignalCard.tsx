import Link from "next/link";
import { depthLabel, type DepthLevel } from "@/lib/depth/scale";

export interface QueueSignal {
  id: string;
  barangay: string | null;
  /** Null on every signal sent since the SOS form stopped asking for one. */
  depth: DepthLevel | null;
  status: string;
  trust_score: number | null;
  confidence: string | null;
  created_at: string;
}

function minutesAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "ngayon lang";
  if (mins < 60) return `${mins} min ang nakalipas`;
  return `${Math.round(mins / 60)} oras ang nakalipas`;
}

export function SignalCard({ signal }: { signal: QueueSignal }) {
  // An unscored signal is not a low-priority signal - we simply do not know.
  const band = signal.confidence ?? "none";

  return (
    <Link href={`/console/${signal.id}`} className="signal-card">
      <span className="signal-head">
        <span className="signal-band" data-band={band}>
          {signal.confidence ?? "hindi pa nasusuri"}
        </span>
        {/* A signal is a person asking for help, not a depth reading. Where a
            sender did choose one it is still their word and still shown; where
            they were never asked, the card says the thing that is actually
            true rather than inventing a level. */}
        <strong>
          {signal.depth ? depthLabel(signal.depth).tl : "Humihingi ng tulong"}
        </strong>
      </span>
      <span className="signal-meta">
        {signal.barangay ?? "walang barangay"} · {minutesAgo(signal.created_at)}
        {signal.trust_score !== null ? ` · ${signal.trust_score}/100` : ""}
      </span>
    </Link>
  );
}
