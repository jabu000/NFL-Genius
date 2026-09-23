import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Headshot } from "@/components/Headshot";
import { ValueBetCallout } from "@/components/ValueBetCallout";
import { WriteupCarousel } from "@/components/WriteupCarousel";
import { STAT_LABELS } from "@/lib/config";
import { getPlayerDetail } from "@/lib/db/queries";
import { formatProjection } from "@/lib/format";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = getPlayerDetail(id);
  if (!detail) notFound();
  const { player, projections, game, writeups, valueBets } = detail;
  const opp = projections[0]?.opponent;
  const isHome = game?.home === player.team;

  return (
    <div className="space-y-5">
      <Link href="/" className="text-sm text-muted hover:text-accent">
        ← All players
      </Link>

      <div className="flex items-center gap-4">
        <Headshot name={player.name} url={player.headshotUrl} size={72} />
        <div>
          <h1 className="text-2xl font-bold">{player.name}</h1>
          <div className="text-sm text-muted">
            {player.team} {player.slot}
            {opp && ` · ${isHome ? "vs" : "at"} ${opp}`}
            {game && ` · ${new Date(game.kickoff).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}`}
            {game?.total != null && ` · O/U ${game.total}`}
            {player.injury !== "Healthy" && <span className="ml-2 font-semibold text-bad">{player.injury}</span>}
          </div>
        </div>
      </div>

      <ValueBetCallout bets={valueBets} />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">Why we project this</h2>
          <WriteupCarousel writeups={writeups} />
        </div>

        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Projection</h2>
          <table className="tabular w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="pb-1 text-left font-medium">Stat</th>
                <th className="pb-1 text-right font-medium">Proj</th>
                <th className="pb-1 text-right font-medium">Range</th>
                <th className="pb-1 text-right font-medium">Conf</th>
              </tr>
            </thead>
            <tbody>
              {projections.map((p) => (
                <tr key={p.stat} className="border-t border-border">
                  <td className="py-1.5">{STAT_LABELS[p.stat]}</td>
                  <td className="py-1.5 text-right font-semibold">{formatProjection(p.stat, p.mean)}</td>
                  <td className="py-1.5 text-right text-muted">
                    {p.stat === "anytime_td" ? "—" : `${Math.max(0, p.mean - p.stdev).toFixed(0)}–${(p.mean + p.stdev).toFixed(0)}`}
                  </td>
                  <td className="py-1.5 text-right">
                    <ConfidenceBadge value={p.confidence} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">Range is the middle ~68% of outcomes (±1 standard deviation).</p>
        </section>
      </div>
    </div>
  );
}
