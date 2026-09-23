import type { DepthSlot, Position, StatKey } from "./types";

/** Days a daily write-up stays on the site before it is pruned. */
export const RETENTION_DAYS = 10;

/** A prop is flagged as a "value bet" when both thresholds are met. */
export const VALUE_EDGE = 0.05;
export const VALUE_MIN_CONFIDENCE = 60;

/**
 * Weight on the model when forming the final probability; the rest goes to the
 * (de-vigged) DraftKings price. Books are sharp, so a raw model overstates edges.
 */
export const MODEL_WEIGHT = 0.65;

export const SLOTS: DepthSlot[] = ["QB1", "RB1", "RB2", "WR1", "WR2", "WR3", "TE1"];

export const SLOT_COUNTS: Record<Position, number> = { QB: 1, RB: 2, WR: 3, TE: 1 };

export const STATS_BY_POSITION: Record<Position, StatKey[]> = {
  QB: ["pass_yds", "pass_tds", "pass_cmp", "pass_att", "pass_int", "rush_yds", "anytime_td"],
  RB: ["rush_yds", "rush_att", "rec", "rec_yds", "anytime_td"],
  WR: ["rec_yds", "rec", "targets", "anytime_td"],
  TE: ["rec_yds", "rec", "targets", "anytime_td"],
};

export const HEADLINE_STAT: Record<Position, StatKey> = {
  QB: "pass_yds",
  RB: "rush_yds",
  WR: "rec_yds",
  TE: "rec_yds",
};

export const STAT_LABELS: Record<StatKey, string> = {
  pass_yds: "Pass Yds",
  pass_tds: "Pass TDs",
  pass_att: "Pass Att",
  pass_cmp: "Completions",
  pass_int: "Interceptions",
  rush_att: "Rush Att",
  rush_yds: "Rush Yds",
  rush_tds: "Rush TDs",
  targets: "Targets",
  rec: "Receptions",
  rec_yds: "Rec Yds",
  rec_tds: "Rec TDs",
  anytime_td: "Anytime TD",
};

/** Count stats modelled with a Poisson distribution instead of a normal. */
export const POISSON_STATS = new Set<StatKey>(["pass_tds", "pass_int", "rec", "anytime_td", "rush_tds", "rec_tds"]);

/** Volume stats get half-strength matchup adjustments (efficiency moves more than volume). */
export const VOLUME_STATS = new Set<StatKey>(["pass_att", "pass_cmp", "rush_att", "targets", "rec"]);

/** Typical coefficient of variation per stat, blended with observed variance. */
export const DEFAULT_CV: Partial<Record<StatKey, number>> = {
  pass_yds: 0.28,
  pass_att: 0.2,
  pass_cmp: 0.22,
  pass_tds: 0.6,
  pass_int: 0.9,
  rush_yds: 0.5,
  rush_att: 0.3,
  rec: 0.45,
  rec_yds: 0.55,
  targets: 0.4,
  anytime_td: 0.9,
};

/** Per-game priors by depth slot, used when a player has little or no history. */
export const SLOT_PRIORS: Record<DepthSlot, Partial<Record<StatKey, number>>> = {
  QB1: { pass_att: 33, pass_cmp: 21.5, pass_yds: 225, pass_tds: 1.4, pass_int: 0.8, rush_att: 3.5, rush_yds: 16, rush_tds: 0.12 },
  RB1: { rush_att: 15, rush_yds: 65, rush_tds: 0.45, targets: 3.5, rec: 2.7, rec_yds: 20, rec_tds: 0.08 },
  RB2: { rush_att: 7.5, rush_yds: 31, rush_tds: 0.2, targets: 2.2, rec: 1.7, rec_yds: 13, rec_tds: 0.05 },
  WR1: { targets: 8.2, rec: 5.4, rec_yds: 70, rec_tds: 0.45, rush_att: 0.3, rush_yds: 2 },
  WR2: { targets: 6.2, rec: 4, rec_yds: 50, rec_tds: 0.3, rush_att: 0.2, rush_yds: 1 },
  WR3: { targets: 4.3, rec: 2.8, rec_yds: 34, rec_tds: 0.2 },
  TE1: { targets: 5.5, rec: 3.9, rec_yds: 40, rec_tds: 0.3 },
};

/** The Odds API market key → our stat. */
export const ODDS_MARKETS: Record<string, StatKey> = {
  player_pass_yds: "pass_yds",
  player_pass_tds: "pass_tds",
  player_pass_attempts: "pass_att",
  player_pass_completions: "pass_cmp",
  player_pass_interceptions: "pass_int",
  player_rush_yds: "rush_yds",
  player_rush_attempts: "rush_att",
  player_receptions: "rec",
  player_reception_yds: "rec_yds",
  player_anytime_td: "anytime_td",
};

/** Markets requested by default: ~1 Odds API credit per market per game. */
export const DEFAULT_ODDS_MARKETS = [
  "player_pass_yds",
  "player_pass_tds",
  "player_rush_yds",
  "player_reception_yds",
  "player_receptions",
  "player_anytime_td",
];
