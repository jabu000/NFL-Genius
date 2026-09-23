import { betLabel, formatOdds, pct } from "@/lib/format";
import type { BetRow } from "@/lib/db/queries";

export function ValueBetCallout({ bets }: { bets: BetRow[] }) {
  if (!bets.length) return null;
  return (
    <section className="rounded-xl border border-value/40 bg-value/10 p-4">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-value">Value bet{bets.length > 1 ? "s" : ""} on DraftKings</h2>
      <ul className="space-y-2">
        {bets.map((b) => (
          <li key={b.stat} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="font-semibold">
              {betLabel(b.stat, b.lean, b.line)}{" "}
              <span className="tabular text-muted">({formatOdds(b.lean === "OVER" ? b.overPrice : b.underPrice)})</span>
            </span>
            <span className="tabular text-sm">
              Model {pct(b.modelProb)} vs book {pct(b.impliedProb)} ·{" "}
              <span className="font-semibold text-good">+{pct(b.edge, 1)} edge</span> · conf {b.confidence}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
