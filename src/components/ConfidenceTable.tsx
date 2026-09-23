"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STAT_LABELS } from "@/lib/config";
import { betLabel, formatOdds, formatProjection, pct } from "@/lib/format";
import type { BoardRow } from "@/lib/db/queries";
import type { StatKey } from "@/lib/types";
import { ConfidenceBadge } from "./ConfidenceBadge";

type SortKey = "confidence" | "edge";

export function ConfidenceTable({ rows, valueEdge, minConfidence }: { rows: BoardRow[]; valueEdge: number; minConfidence: number }) {
  const [pos, setPos] = useState("ALL");
  const [market, setMarket] = useState<"ALL" | StatKey>("ALL");
  const [sort, setSort] = useState<SortKey>("confidence");
  const [valueOnly, setValueOnly] = useState(false);
  const [bestPerPlayer, setBestPerPlayer] = useState(true);

  const markets = useMemo(() => [...new Set(rows.filter((r) => r.line != null).map((r) => r.stat))], [rows]);

  const shown = useMemo(() => {
    let out = rows.filter(
      (r) =>
        (pos === "ALL" || r.position === pos) &&
        (market === "ALL" || r.stat === market) &&
        (!valueOnly || (r.line != null && r.edge >= valueEdge && r.confidence >= minConfidence)),
    );
    const cmp = (a: BoardRow, b: BoardRow) =>
      sort === "confidence" ? b.confidence - a.confidence || b.edge - a.edge : b.edge - a.edge || b.confidence - a.confidence;
    out = [...out].sort(cmp);
    if (bestPerPlayer) {
      const seen = new Set<string>();
      out = out.filter((r) => (seen.has(r.playerId) ? false : (seen.add(r.playerId), true)));
    }
    return out;
  }, [rows, pos, market, sort, valueOnly, bestPerPlayer, valueEdge, minConfidence]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <select value={pos} onChange={(e) => setPos(e.target.value)} className="rounded-lg border border-border bg-surface px-2 py-1.5" aria-label="Position">
          {["ALL", "QB", "RB", "WR", "TE"].map((p) => (
            <option key={p} value={p}>
              {p === "ALL" ? "All positions" : p}
            </option>
          ))}
        </select>
        <select
          value={market}
          onChange={(e) => setMarket(e.target.value as typeof market)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5"
          aria-label="Market"
        >
          <option value="ALL">All markets</option>
          {markets.map((m) => (
            <option key={m} value={m}>
              {STAT_LABELS[m]}
            </option>
          ))}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-lg border border-border bg-surface px-2 py-1.5" aria-label="Sort">
          <option value="confidence">Sort: confidence</option>
          <option value="edge">Sort: edge</option>
        </select>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={bestPerPlayer} onChange={(e) => setBestPerPlayer(e.target.checked)} /> One row per player
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={valueOnly} onChange={(e) => setValueOnly(e.target.checked)} /> Value bets only
        </label>
        <span className="ml-auto text-muted">{shown.length} rows</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="tabular w-full min-w-[820px] text-sm">
          <thead className="bg-surface-2 text-xs text-muted">
            <tr>
              <th className="px-3 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">Player</th>
              <th className="px-3 py-2 text-left font-medium">Opp</th>
              <th className="px-3 py-2 text-left font-medium">Market</th>
              <th className="px-3 py-2 text-right font-medium">Projection</th>
              <th className="px-3 py-2 text-left font-medium">DK line · lean</th>
              <th className="px-3 py-2 text-right font-medium">Odds</th>
              <th className="px-3 py-2 text-right font-medium">Model / Book</th>
              <th className="px-3 py-2 text-right font-medium">Edge</th>
              <th className="px-3 py-2 text-right font-medium">Conf</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const isValue = r.line != null && r.edge >= valueEdge && r.confidence >= minConfidence;
              return (
                <tr key={`${r.playerId}-${r.stat}`} className={`border-t border-border ${isValue ? "bg-value/5" : ""}`}>
                  <td className="px-3 py-2 text-muted">{i + 1}</td>
                  <td className="px-3 py-2">
                    <Link href={`/player/${r.playerId}`} className="font-semibold hover:text-accent">
                      {r.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {r.team} {r.slot}
                    </div>
                  </td>
                  <td className="px-3 py-2">{r.opponent ?? "—"}</td>
                  <td className="px-3 py-2">{STAT_LABELS[r.stat]}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatProjection(r.stat, r.projection)}</td>
                  {r.line != null ? (
                    <>
                      <td className="px-3 py-2">
                        {betLabel(r.stat, r.lean, r.line)}
                        {isValue && <span className="ml-1.5 rounded bg-value/15 px-1.5 text-[11px] font-semibold text-value">VALUE</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{formatOdds(r.lean === "OVER" ? r.overPrice : r.underPrice)}</td>
                      <td className="px-3 py-2 text-right">
                        {pct(r.modelProb)} / {pct(r.impliedProb)}
                      </td>
                      <td className={`px-3 py-2 text-right font-semibold ${r.edge > 0 ? "text-good" : "text-bad"}`}>
                        {r.edge > 0 ? "+" : ""}
                        {pct(r.edge, 1)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={4} className="px-3 py-2 text-muted">
                      No DraftKings line
                    </td>
                  )}
                  <td className="px-3 py-2 text-right">
                    <ConfidenceBadge value={r.confidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
