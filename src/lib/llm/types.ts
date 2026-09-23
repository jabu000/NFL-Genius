import type { BetEval, Factor, Player, StatKey, StatProjection } from "../types";

export interface WriteupInput {
  player: Player;
  date: string;
  opponent: string | null;
  gamesPlayed: number;
  projections: StatProjection[];
  factors: Factor[];
  recent: Partial<Record<StatKey, { last3: number; season: number }>>;
  /** Best-priced bet for this player, if any line clears the value threshold. */
  valueBet: BetEval | null;
}

export interface Writeup {
  body: string;
  keyFactors: string[];
  source: string;
}

export interface WriteupProvider {
  name: string;
  /** Write paragraphs for a batch of players. May throw; callers fall back to templates. */
  writeBatch(inputs: WriteupInput[]): Promise<Writeup[]>;
}
