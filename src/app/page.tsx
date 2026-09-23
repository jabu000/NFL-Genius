import { PlayerGrid } from "@/components/PlayerGrid";
import { VALUE_EDGE } from "@/lib/config";
import { listPlayers } from "@/lib/db/queries";

export default function Home() {
  const players = listPlayers();
  return (
    <div>
      <h1 className="text-2xl font-bold">Starter projections</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Every starting QB, RB1–RB2, WR1–WR3 and TE1, re-researched daily. Click a player for the reasoning behind the number.
      </p>
      {players.length ? (
        <PlayerGrid players={players} valueEdge={VALUE_EDGE} />
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">
          No research yet. Run <code>npm run research</code> (or <code>npm run seed:mock</code> for demo data).
        </div>
      )}
    </div>
  );
}
