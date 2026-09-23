import "server-only";
import { HEADLINE_STAT, RETENTION_DAYS, STATS_BY_POSITION, VALUE_EDGE, VALUE_MIN_CONFIDENCE } from "../config";
import { isoDate, retentionCutoff } from "../dates";
import type { DepthSlot, InjuryStatus, Position, StatKey } from "../types";
import { getDb } from "./index";

export interface Meta {
  lastUpdated: string | null;
  lastResearchDate: string | null;
  season: string | null;
  source: string | null;
}

export function getMeta(): Meta {
  const rows = getDb().prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[];
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    lastUpdated: m.last_updated ?? null,
    lastResearchDate: m.last_research_date ?? null,
    season: m.season ?? null,
    source: m.source ?? null,
  };
}

function latestDate(): string | null {
  const row = getDb().prepare("SELECT MAX(date) AS d FROM projections").get() as { d: string | null };
  return row.d;
}

export interface PlayerRow {
  id: string;
  name: string;
  team: string;
  position: Position;
  slot: DepthSlot;
  headshotUrl: string | null;
  injury: InjuryStatus;
  opponent: string | null;
  stat: StatKey;
  mean: number;
  confidence: number;
  bestEdge: number | null;
}

/** Every starter projected on the latest research date, with the headline stat. */
export function listPlayers(): PlayerRow[] {
  const date = latestDate();
  if (!date) return [];
  const rows = getDb()
    .prepare(
      `SELECT p.id, p.name, p.team, p.position, p.slot, p.headshot_url AS headshotUrl, p.injury,
              pr.opponent, pr.stat, pr.mean, pr.confidence,
              (SELECT MAX(b.edge) FROM bets b WHERE b.player_id = p.id AND b.date = pr.date AND b.confidence >= ?) AS bestEdge
       FROM players p JOIN projections pr ON pr.player_id = p.id AND pr.date = ?
       ORDER BY p.team, p.slot`,
    )
    .all(VALUE_MIN_CONFIDENCE, date) as PlayerRow[];
  return rows.filter((r) => r.stat === HEADLINE_STAT[r.position]);
}

export interface ProjectionRow {
  stat: StatKey;
  mean: number;
  stdev: number;
  confidence: number;
  opponent: string | null;
  gameId: string | null;
}

export interface WriteupRow {
  date: string;
  body: string;
  keyFactors: string[];
  source: string;
}

export interface BetRow {
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

export interface GameRow {
  home: string;
  away: string;
  kickoff: string;
  spread: number | null;
  total: number | null;
}

export function getPlayerDetail(id: string) {
  const db = getDb();
  const player = db
    .prepare("SELECT id, name, team, position, slot, headshot_url AS headshotUrl, injury, updated FROM players WHERE id = ?")
    .get(id) as (Omit<PlayerRow, "opponent" | "stat" | "mean" | "confidence" | "bestEdge"> & { updated: string }) | undefined;
  if (!player) return null;

  const date = (db.prepare("SELECT MAX(date) AS d FROM projections WHERE player_id = ?").get(id) as { d: string | null }).d;
  const projections = date
    ? (db
        .prepare("SELECT stat, mean, stdev, confidence, opponent, game_id AS gameId FROM projections WHERE player_id = ? AND date = ?")
        .all(id, date) as ProjectionRow[])
    : [];
  const order = STATS_BY_POSITION[player.position];
  projections.sort((a, b) => order.indexOf(a.stat) - order.indexOf(b.stat));
  const game = projections[0]?.gameId
    ? (db.prepare("SELECT home, away, kickoff, spread, total FROM games WHERE id = ?").get(projections[0].gameId) as GameRow | undefined)
    : undefined;

  // The UI enforces the 10-day window too, in case the pipeline hasn't pruned yet.
  const cutoff = retentionCutoff(isoDate(), RETENTION_DAYS);
  const writeups = (
    db
      .prepare("SELECT date, body, key_factors AS keyFactors, source FROM writeups WHERE player_id = ? AND date >= ? ORDER BY date DESC")
      .all(id, cutoff) as (Omit<WriteupRow, "keyFactors"> & { keyFactors: string })[]
  ).map((w) => ({ ...w, keyFactors: JSON.parse(w.keyFactors) as string[] }));

  const bets = date
    ? (db
        .prepare(
          `SELECT player_id AS playerId, stat, line, over_price AS overPrice, under_price AS underPrice, projection, lean,
                  model_prob AS modelProb, implied_prob AS impliedProb, edge, confidence
           FROM bets WHERE player_id = ? AND date = ? ORDER BY edge DESC`,
        )
        .all(id, date) as BetRow[])
    : [];
  const valueBets = bets.filter((b) => b.edge >= VALUE_EDGE && b.confidence >= VALUE_MIN_CONFIDENCE);

  return { player, date, projections, game: game ?? null, writeups, valueBets };
}

export interface BoardRow extends Omit<BetRow, "line"> {
  line: number | null;
  name: string;
  team: string;
  position: Position;
  slot: DepthSlot;
  opponent: string | null;
}

/** One row per DraftKings prop; players with no line get their headline projection instead. */
export function listBoard(): { date: string | null; rows: BoardRow[] } {
  const date = latestDate();
  if (!date) return { date, rows: [] };
  const db = getDb();
  const bets = db
    .prepare(
      `SELECT b.player_id AS playerId, b.stat, b.line, b.over_price AS overPrice, b.under_price AS underPrice, b.projection, b.lean,
              b.model_prob AS modelProb, b.implied_prob AS impliedProb, b.edge, b.confidence,
              p.name, p.team, p.position, p.slot, pr.opponent
       FROM bets b
       JOIN players p ON p.id = b.player_id
       LEFT JOIN projections pr ON pr.player_id = b.player_id AND pr.date = b.date AND pr.stat = b.stat
       WHERE b.date = ?`,
    )
    .all(date) as BoardRow[];
  const withLine = new Set(bets.map((b) => b.playerId));
  const noLine: BoardRow[] = listPlayers()
    .filter((p) => !withLine.has(p.id))
    .map((p) => ({
      playerId: p.id,
      stat: p.stat,
      line: null,
      overPrice: null,
      underPrice: null,
      projection: p.mean,
      lean: "OVER",
      modelProb: 0,
      impliedProb: 0,
      edge: 0,
      confidence: p.confidence,
      name: p.name,
      team: p.team,
      position: p.position,
      slot: p.slot,
      opponent: p.opponent,
    }));
  return { date, rows: [...bets, ...noLine].sort((a, b) => b.confidence - a.confidence || b.edge - a.edge) };
}
