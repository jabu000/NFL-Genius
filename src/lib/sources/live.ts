import type Database from "better-sqlite3";
import { DEFAULT_ODDS_MARKETS } from "../config";
import type { DepthEntry, Game, GameLog, InjuryStatus, PropLine, ResearchInputs } from "../types";
import { fetchDepthChart, fetchInjuries, fetchTeams, fetchUpcomingGames } from "./espn";
import { fetchSeasonLogs, fetchUpcomingSchedule } from "./nflverse";
import { isoDate } from "../dates";
import { fetchEventProps, fetchGameLines } from "./oddsApi";

type Log = (msg: string) => void;

async function attempt<T>(label: string, fn: () => Promise<T>, fallback: T, log: Log): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    log(`  ! ${label} failed: ${(err as Error).message}`);
    return fallback;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Gather today's inputs from ESPN, nflverse and (if a key is set) The Odds API. */
export async function gatherLiveInputs(db: Database.Database, season: number, env = process.env, log: Log = console.log): Promise<ResearchInputs> {
  log("• ESPN: teams, depth charts, schedule, injuries");
  const teams = await attempt("ESPN teams", fetchTeams, [], log);
  const depthLists = await mapLimit(teams, 6, (t) => attempt(`depth chart ${t.abbr}`, () => fetchDepthChart(t.id, t.abbr), [] as DepthEntry[], log));
  const depth = depthLists.flat();
  let games = await attempt("ESPN scoreboard", () => fetchUpcomingGames(season), [] as Game[], log);
  const injuries = await attempt("ESPN injuries", fetchInjuries, new Map<string, InjuryStatus>(), log);
  log(`  ${teams.length} teams, ${depth.length} depth-chart players, ${games.length} upcoming games, ${injuries.size} injury designations`);

  log("• nflverse: weekly player stats");
  const [cur, prev] = await Promise.all([
    attempt(`nflverse ${season}`, () => fetchSeasonLogs(season), [] as GameLog[], log),
    attempt(`nflverse ${season - 1}`, () => fetchSeasonLogs(season - 1), [] as GameLog[], log),
  ]);
  const logs = [...cur, ...prev];
  log(`  ${cur.length} player-games in ${season}, ${prev.length} in ${season - 1}`);

  const schedule = await attempt(
    "nflverse schedule",
    () => fetchUpcomingSchedule(season, isoDate()),
    { games: [] as Game[], starterQbs: new Map<string, string>() },
    log,
  );
  if (!games.length && schedule.games.length) {
    log(`  using nflverse schedule: ${schedule.games.length} games in week ${schedule.games[0].week}`);
    games = schedule.games;
  }

  if (!depth.length && !cur.length && !prev.length) {
    throw new Error("No roster or stats data could be fetched; aborting without touching existing research.");
  }

  const props = await gatherOdds(db, games, env, log).then((r) => {
    games = r.games;
    return r.props;
  });

  return { season, games, depth, injuries, logs, props, starterQbs: schedule.starterQbs };
}

async function gatherOdds(db: Database.Database, games: Game[], env: NodeJS.ProcessEnv, log: Log): Promise<{ games: Game[]; props: PropLine[] }> {
  const apiKey = env.ODDS_API_KEY;
  if (!apiKey) {
    log("• The Odds API: no ODDS_API_KEY set, skipping DraftKings lines");
    return { games, props: loadCachedProps(db, games) };
  }
  log("• The Odds API: DraftKings game lines and player props");
  const lines = await attempt("game lines", () => fetchGameLines(apiKey), null, log);
  if (!lines) return { games, props: loadCachedProps(db, games) };

  // Attach DraftKings spreads/totals to ESPN games; build games from odds events if ESPN had none.
  const eventFor = new Map<string, string>();
  const merged = games.length
    ? games.map((g) => {
        const ev = lines.events.find((e) => e.home === g.home && e.away === g.away);
        if (!ev) return g;
        eventFor.set(g.id, ev.id);
        return { ...g, spread: ev.spread ?? g.spread, total: ev.total ?? g.total };
      })
    : lines.events.map((e) => {
        eventFor.set(e.id, e.id);
        return { id: e.id, season: 0, week: 0, home: e.home, away: e.away, kickoff: e.kickoff, spread: e.spread, total: e.total };
      });

  const custom = env.ODDS_MARKETS?.split(",").map((s) => s.trim()).filter(Boolean);
  const markets = custom?.length ? custom : DEFAULT_ODDS_MARKETS;
  const maxAgeH = Number(env.ODDS_MAX_AGE_HOURS ?? 24);
  const reserve = Number(env.ODDS_CREDIT_RESERVE ?? 10);
  let remaining = lines.quota.remaining ?? Infinity;
  const weekAhead = Date.now() + 7 * 86_400_000;

  const lastFetch = db.prepare("SELECT MAX(fetched_at) AS t FROM prop_lines WHERE game_id = ?");
  const clear = db.prepare("DELETE FROM prop_lines WHERE game_id = ?");
  const insert = db.prepare(
    `INSERT OR REPLACE INTO prop_lines (game_id, player_name, stat, line, over_price, under_price, book, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let fetched = 0;
  for (const g of merged) {
    const eventId = eventFor.get(g.id);
    if (!eventId || new Date(g.kickoff).getTime() > weekAhead) continue;
    const t = (lastFetch.get(g.id) as { t: string | null }).t;
    if (t && (Date.now() - new Date(t).getTime()) / 3_600_000 < maxAgeH) continue;
    if (remaining - markets.length < reserve) {
      log(`  credit budget reached (${remaining} left); using cached lines for the rest`);
      break;
    }
    const res = await attempt(`props ${g.away}@${g.home}`, () => fetchEventProps(apiKey, eventId, g.id, markets), null, log);
    if (!res) continue;
    remaining = res.quota.remaining ?? remaining - markets.length;
    db.transaction(() => {
      clear.run(g.id);
      for (const p of res.props) insert.run(g.id, p.playerName, p.stat, p.line, p.overPrice, p.underPrice, p.book, p.fetchedAt);
    })();
    fetched++;
  }
  log(`  refreshed props for ${fetched} games; ${Number.isFinite(remaining) ? remaining : "?"} credits left this month`);
  return { games: merged, props: loadCachedProps(db, merged) };
}

function loadCachedProps(db: Database.Database, games: Game[]): PropLine[] {
  if (!games.length) return [];
  const rows = db
    .prepare(`SELECT * FROM prop_lines WHERE game_id IN (${games.map(() => "?").join(",")})`)
    .all(...games.map((g) => g.id)) as {
    game_id: string;
    player_name: string;
    stat: PropLine["stat"];
    line: number;
    over_price: number | null;
    under_price: number | null;
    book: string;
    fetched_at: string;
  }[];
  return rows.map((r) => ({
    playerName: r.player_name,
    gameId: r.game_id,
    stat: r.stat,
    line: r.line,
    overPrice: r.over_price,
    underPrice: r.under_price,
    book: r.book,
    fetchedAt: r.fetched_at,
  }));
}
