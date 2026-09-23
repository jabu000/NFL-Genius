"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { STAT_LABELS } from "@/lib/config";
import { formatProjection, pct } from "@/lib/format";
import type { PlayerRow } from "@/lib/db/queries";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Headshot } from "./Headshot";

const POSITIONS = ["ALL", "QB", "RB", "WR", "TE"] as const;

export function PlayerGrid({ players, valueEdge }: { players: PlayerRow[]; valueEdge: number }) {
  const [pos, setPos] = useState<(typeof POSITIONS)[number]>("ALL");
  const [team, setTeam] = useState("ALL");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"team" | "confidence" | "value">("team");

  const teams = useMemo(() => [...new Set(players.map((p) => p.team))].sort(), [players]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = players.filter(
      (p) => (pos === "ALL" || p.position === pos) && (team === "ALL" || p.team === team) && (!q || p.name.toLowerCase().includes(q)),
    );
    if (sort === "confidence") return [...rows].sort((a, b) => b.confidence - a.confidence);
    if (sort === "value") return [...rows].sort((a, b) => (b.bestEdge ?? -1) - (a.bestEdge ?? -1));
    return rows;
  }, [players, pos, team, query, sort]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => setPos(p)}
              className={`px-3 py-1.5 text-sm font-medium ${pos === p ? "bg-accent text-white" : "bg-surface hover:bg-surface-2"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <select
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
          aria-label="Team"
        >
          <option value="ALL">All teams</option>
          {teams.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as typeof sort)}
          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
          aria-label="Sort"
        >
          <option value="team">Sort: team</option>
          <option value="confidence">Sort: confidence</option>
          <option value="value">Sort: best edge</option>
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm sm:max-w-xs"
        />
        <span className="text-sm text-muted">{shown.length} players</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p) => (
          <Link
            key={p.id}
            href={`/player/${p.id}`}
            className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3 transition hover:border-accent"
          >
            <Headshot name={p.name} url={p.headshotUrl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold group-hover:text-accent">{p.name}</span>
                {p.injury !== "Healthy" && (
                  <span className="rounded bg-bad/15 px-1.5 text-[10px] font-bold uppercase text-bad">{p.injury[0]}</span>
                )}
              </div>
              <div className="text-xs text-muted">
                {p.team} {p.slot}
                {p.opponent ? ` · vs ${p.opponent}` : " · no game"}
              </div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className="tabular font-medium">
                  {formatProjection(p.stat, p.mean)} {STAT_LABELS[p.stat]}
                </span>
                {p.bestEdge != null && p.bestEdge >= valueEdge && (
                  <span className="rounded bg-value/15 px-1.5 text-[11px] font-semibold text-value">
                    Value +{pct(p.bestEdge, 0)}
                  </span>
                )}
              </div>
            </div>
            <ConfidenceBadge value={p.confidence} />
          </Link>
        ))}
      </div>
      {!shown.length && <p className="py-12 text-center text-muted">No players match these filters.</p>}
    </div>
  );
}
