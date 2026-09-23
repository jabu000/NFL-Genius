export type Position = "QB" | "RB" | "WR" | "TE";
export type DepthSlot = "QB1" | "RB1" | "RB2" | "WR1" | "WR2" | "WR3" | "TE1";
export type InjuryStatus = "Healthy" | "Questionable" | "Doubtful" | "Out";

export type StatKey =
  | "pass_yds"
  | "pass_tds"
  | "pass_att"
  | "pass_cmp"
  | "pass_int"
  | "rush_att"
  | "rush_yds"
  | "rush_tds"
  | "targets"
  | "rec"
  | "rec_yds"
  | "rec_tds"
  | "anytime_td";

/** One player's box score for one game. */
export interface GameLog {
  name: string;
  team: string;
  position: Position;
  season: number;
  week: number;
  opponent: string;
  pass_att: number;
  pass_cmp: number;
  pass_yds: number;
  pass_tds: number;
  pass_int: number;
  rush_att: number;
  rush_yds: number;
  rush_tds: number;
  targets: number;
  rec: number;
  rec_yds: number;
  rec_tds: number;
  headshotUrl?: string;
}

/** A player listed on a team's depth chart. `rank` is 0 for the starter at that spot. */
export interface DepthEntry {
  name: string;
  team: string;
  position: Position;
  rank: number;
  espnId?: string;
  headshotUrl?: string;
}

export interface Game {
  id: string;
  season: number;
  week: number;
  home: string;
  away: string;
  kickoff: string;
  /** Home team spread (negative = home favored). */
  spread: number | null;
  total: number | null;
}

export interface PropLine {
  playerName: string;
  gameId: string;
  stat: StatKey;
  line: number;
  overPrice: number | null;
  underPrice: number | null;
  book: string;
  fetchedAt: string;
}

export interface Player {
  id: string;
  name: string;
  team: string;
  position: Position;
  slot: DepthSlot;
  headshotUrl?: string | null;
  injury: InjuryStatus;
}

export interface Factor {
  key: string;
  label: string;
  /** +1 boosts the projection, -1 lowers it, 0 neutral. */
  direction: 1 | -1 | 0;
  detail: string;
}

export interface StatProjection {
  stat: StatKey;
  mean: number;
  stdev: number;
  confidence: number;
}

export interface BetEval {
  playerId: string;
  stat: StatKey;
  line: number;
  overPrice: number | null;
  underPrice: number | null;
  projection: number;
  lean: "OVER" | "UNDER";
  modelProb: number;
  impliedProb: number;
  edge: number;
  confidence: number;
}

/** Everything the daily pipeline needs, regardless of where it came from (live APIs or mock). */
export interface ResearchInputs {
  season: number;
  games: Game[];
  depth: DepthEntry[];
  injuries: Map<string, InjuryStatus>;
  logs: GameLog[];
  props: PropLine[];
  /** Projected starting QB per team (from the nflverse schedule), used when a team has no depth chart. */
  starterQbs?: Map<string, string>;
}
