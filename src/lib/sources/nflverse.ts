/** Weekly player box scores from the free nflverse data releases on GitHub. */
import { canonTeam } from "../teams";
import type { Game, GameLog, Position } from "../types";
import { fetchTextCached, parseCsv } from "./http";

const BASE = "https://github.com/nflverse/nflverse-data/releases/download";

const num = (v: string | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function pick(row: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) if (row[k] !== undefined && row[k] !== "") return row[k];
  return undefined;
}

export function rowsToLogs(rows: Record<string, string>[]): GameLog[] {
  const logs: GameLog[] = [];
  for (const r of rows) {
    const pos = (pick(r, "position") ?? "").toUpperCase();
    if (!["QB", "RB", "WR", "TE"].includes(pos)) continue;
    if ((pick(r, "season_type") ?? "REG") !== "REG") continue;
    const team = pick(r, "team", "recent_team");
    const opp = pick(r, "opponent_team");
    if (!team || !opp) continue;
    logs.push({
      name: pick(r, "player_display_name", "player_name") ?? "",
      team: canonTeam(team),
      position: pos as Position,
      season: num(r.season),
      week: num(r.week),
      opponent: canonTeam(opp),
      pass_att: num(pick(r, "attempts")),
      pass_cmp: num(pick(r, "completions")),
      pass_yds: num(pick(r, "passing_yards")),
      pass_tds: num(pick(r, "passing_tds")),
      pass_int: num(pick(r, "passing_interceptions", "interceptions")),
      rush_att: num(pick(r, "carries")),
      rush_yds: num(pick(r, "rushing_yards")),
      rush_tds: num(pick(r, "rushing_tds")),
      targets: num(pick(r, "targets")),
      rec: num(pick(r, "receptions")),
      rec_yds: num(pick(r, "receiving_yards")),
      rec_tds: num(pick(r, "receiving_tds")),
      headshotUrl: pick(r, "headshot_url"),
    });
  }
  return logs;
}

/** All regular-season games for a season. Tries the current file layout, then the legacy one. */
export async function fetchSeasonLogs(season: number): Promise<GameLog[]> {
  const urls = [
    [`${BASE}/stats_player/stats_player_week_${season}.csv`, `stats_player_week_${season}.csv`],
    [`${BASE}/player_stats/player_stats_${season}.csv`, `player_stats_${season}.csv`],
  ];
  let lastErr: unknown;
  for (const [url, cache] of urls) {
    try {
      return rowsToLogs(parseCsv(await fetchTextCached(url, cache, 12)));
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * The next unplayed week from the nflverse schedule, with consensus spread/total
 * and each team's projected starting QB. Used when ESPN is unavailable.
 */
export async function fetchUpcomingSchedule(season: number, today: string): Promise<{ games: Game[]; starterQbs: Map<string, string> }> {
  const rows = parseCsv(await fetchTextCached("https://github.com/nflverse/nfldata/raw/master/data/games.csv", "games.csv", 6));
  return upcomingFromSchedule(rows, season, today);
}

export function upcomingFromSchedule(rows: Record<string, string>[], season: number, today: string) {
  const pending = rows.filter((r) => num(r.season) === season && r.home_score === "" && r.gameday >= today);
  const week = Math.min(...pending.map((r) => num(r.week)));
  const games: Game[] = [];
  const starterQbs = new Map<string, string>();
  for (const r of pending.filter((x) => num(x.week) === week)) {
    const home = canonTeam(r.home_team);
    const away = canonTeam(r.away_team);
    // nflverse spread_line is the home team's expected margin (positive = home favoured).
    const spread = r.spread_line !== "" ? -num(r.spread_line) : null;
    games.push({
      id: r.game_id,
      season,
      week,
      home,
      away,
      kickoff: `${r.gameday}T${r.gametime || "13:00"}:00-04:00`,
      spread: spread === 0 ? 0 : spread,
      total: r.total_line !== "" ? num(r.total_line) : null,
    });
    if (r.home_qb_name) starterQbs.set(home, r.home_qb_name);
    if (r.away_qb_name) starterQbs.set(away, r.away_qb_name);
  }
  return { games, starterQbs };
}
