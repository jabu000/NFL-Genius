import { SLOT_COUNTS } from "../config";
import type { DepthEntry, DepthSlot, InjuryStatus, Position } from "../types";

export interface Candidate extends DepthEntry {
  /** Recent opportunities per game (pass att for QBs; carries + targets otherwise). */
  usage: number;
  injury: InjuryStatus;
}

/**
 * Pick the starters for one team. QBs follow the depth chart; skill players are
 * ordered by recent usage with the depth chart as a tiebreaker, so a WR listed
 * third who leads the team in targets is still that team's WR1. Players ruled
 * Out are skipped.
 */
export function selectStarters(candidates: Candidate[]): { entry: Candidate; slot: DepthSlot }[] {
  const out: { entry: Candidate; slot: DepthSlot }[] = [];
  const positions: Position[] = ["QB", "RB", "WR", "TE"];
  for (const pos of positions) {
    const pool = candidates.filter((c) => c.position === pos && c.injury !== "Out");
    const ranked =
      pos === "QB"
        ? pool.sort((a, b) => a.rank - b.rank || b.usage - a.usage)
        : pool.sort((a, b) => score(b) - score(a) || a.rank - b.rank);
    ranked.slice(0, SLOT_COUNTS[pos]).forEach((entry, i) => {
      out.push({ entry, slot: `${pos}${i + 1}` as DepthSlot });
    });
  }
  return out;
}

function score(c: Candidate): number {
  // A starter-level depth listing is worth ~2 opportunities a game.
  return c.usage + Math.max(0, 3 - c.rank) * 0.7;
}
