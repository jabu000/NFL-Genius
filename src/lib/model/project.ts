import { DEFAULT_CV, POISSON_STATS, SLOT_PRIORS, STATS_BY_POSITION, VOLUME_STATS } from "../config";
import type { Factor, Game, GameLog, InjuryStatus, Player, Position, StatKey, StatProjection } from "../types";
import { confidenceScore } from "./confidence";

export function statValue(log: GameLog, stat: StatKey): number {
  if (stat === "anytime_td") return log.rush_tds + log.rec_tds;
  return log[stat];
}

/** Yardage a defense gives up to each position group, used as the matchup signal. */
function defenseMetric(log: GameLog): number {
  if (log.position === "QB") return log.pass_yds;
  if (log.position === "RB") return log.rush_yds + log.rec_yds;
  return log.rec_yds;
}

const METRIC_LABEL: Record<Position, string> = {
  QB: "passing yards",
  RB: "scrimmage yards",
  WR: "receiving yards",
  TE: "receiving yards",
};

export interface DefenseRow {
  allowed: number;
  rank: number;
}

/** Per-game yards allowed by each defense to each position; rank 1 = most generous. */
export function buildDefenseTable(logs: GameLog[]): { table: Map<string, Map<Position, DefenseRow>>; leagueAvg: Map<Position, number> } {
  const perGame = new Map<string, number>(); // opp|pos|season|week → total
  for (const l of logs) {
    const key = `${l.opponent}|${l.position}|${l.season}|${l.week}`;
    perGame.set(key, (perGame.get(key) ?? 0) + defenseMetric(l));
  }
  const sums = new Map<string, { total: number; games: number }>();
  for (const [key, total] of perGame) {
    const [opp, pos] = key.split("|");
    const k = `${opp}|${pos}`;
    const s = sums.get(k) ?? { total: 0, games: 0 };
    s.total += total;
    s.games += 1;
    sums.set(k, s);
  }
  const table = new Map<string, Map<Position, DefenseRow>>();
  const leagueAvg = new Map<Position, number>();
  for (const pos of ["QB", "RB", "WR", "TE"] as Position[]) {
    const rows = [...sums.entries()]
      .filter(([k]) => k.endsWith(`|${pos}`))
      .map(([k, s]) => ({ opp: k.split("|")[0], allowed: s.total / s.games }))
      .sort((a, b) => b.allowed - a.allowed);
    if (!rows.length) continue;
    leagueAvg.set(pos, rows.reduce((a, r) => a + r.allowed, 0) / rows.length);
    rows.forEach((r, i) => {
      const m = table.get(r.opp) ?? new Map<Position, DefenseRow>();
      m.set(pos, { allowed: r.allowed, rank: i + 1 });
      table.set(r.opp, m);
    });
  }
  return { table, leagueAvg };
}

export interface ProjectionContext {
  player: Player;
  /** This player's games this season, any order. */
  logs: GameLog[];
  /** This player's games last season. */
  priorLogs: GameLog[];
  game: Game | null;
  defense: ReturnType<typeof buildDefenseTable>;
  leagueAvgImplied: number;
  /** Starters on the same team ruled out this week. */
  teammatesOut: { name: string; position: Position }[];
}

export interface ProjectionResult {
  projections: StatProjection[];
  factors: Factor[];
  opponent: string | null;
  gamesPlayed: number;
  recent: Partial<Record<StatKey, { last3: number; season: number }>>;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function usage(l: GameLog): number {
  return l.position === "QB" ? l.pass_att : l.targets + l.rush_att;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const INJURY_MULT: Record<InjuryStatus, number> = { Healthy: 1, Questionable: 0.93, Doubtful: 0.6, Out: 0 };

export function projectPlayer(ctx: ProjectionContext): ProjectionResult {
  const { player, game } = ctx;
  const logs = [...ctx.logs].sort((a, b) => a.week - b.week);
  const n = logs.length;
  const last3 = logs.slice(-3);
  const factors: Factor[] = [];

  const isHome = game ? game.home === player.team : false;
  const opponent = game ? (isHome ? game.away : game.home) : null;

  // --- Matchup: defense vs position ---
  let defMult = 1;
  const defRow = opponent ? ctx.defense.table.get(opponent)?.get(player.position) : undefined;
  const leaguePos = ctx.defense.leagueAvg.get(player.position);
  if (defRow && leaguePos) {
    defMult = 1 + (clamp(defRow.allowed / leaguePos, 0.8, 1.2) - 1) * 0.5;
    const soft = defRow.rank <= 10;
    const tough = defRow.rank >= 23;
    factors.push({
      key: "defense",
      label: "Matchup",
      direction: soft ? 1 : tough ? -1 : 0,
      detail: `${opponent} allows ${defRow.allowed.toFixed(0)} ${METRIC_LABEL[player.position]} per game to ${player.position}s (${ordinal(defRow.rank)}-most in the NFL)`,
    });
  }

  // --- Vegas: implied team total and game script ---
  let impliedRatio = 1;
  let teamSpread = 0;
  if (game && game.total != null && game.spread != null) {
    teamSpread = isHome ? game.spread : -game.spread;
    const implied = game.total / 2 - teamSpread / 2;
    impliedRatio = clamp(implied / ctx.leagueAvgImplied, 0.75, 1.3);
    factors.push({
      key: "implied",
      label: "Team total",
      direction: impliedRatio > 1.05 ? 1 : impliedRatio < 0.95 ? -1 : 0,
      detail: `${player.team} is implied for ${implied.toFixed(1)} points (slate average ${ctx.leagueAvgImplied.toFixed(1)})`,
    });
    if (Math.abs(teamSpread) >= 3) {
      const favored = teamSpread < 0;
      const runBoost = player.position === "RB" ? (favored ? 1 : -1) : 0;
      const passBoost = player.position !== "RB" ? (favored ? -1 : 1) : 0;
      factors.push({
        key: "script",
        label: "Game script",
        direction: (runBoost || passBoost) as 1 | -1,
        detail: `${player.team} ${favored ? "favored" : "an underdog"} by ${Math.abs(teamSpread)}, which points to ${favored ? "a run-heavy finish" : "more passing volume while trailing"}`,
      });
    }
  }

  // --- Role trend ---
  const seasonUsage = avg(logs.map(usage));
  const recentUsage = avg(last3.map(usage));
  const roleTrend = n >= 4 && seasonUsage > 0 ? recentUsage / seasonUsage : 1;
  if (n >= 4 && Math.abs(roleTrend - 1) >= 0.1) {
    factors.push({
      key: "role",
      label: "Usage trend",
      direction: roleTrend > 1 ? 1 : -1,
      detail: `${player.position === "QB" ? "Pass attempts" : "Opportunities (targets + carries)"} ${roleTrend > 1 ? "up" : "down"} ${Math.round(Math.abs(roleTrend - 1) * 100)}% over the last 3 games (${recentUsage.toFixed(1)} vs ${seasonUsage.toFixed(1)} per game)`,
    });
  }

  // --- Teammate injuries ---
  const vacated = ctx.teammatesOut.filter((t) => t.position !== "QB" && player.position !== "QB");
  const qbOut = ctx.teammatesOut.some((t) => t.position === "QB");
  if (vacated.length) {
    factors.push({
      key: "teammates",
      label: "Vacated targets",
      direction: 1,
      detail: `${vacated.map((t) => t.name).join(", ")} ruled out, freeing up opportunities`,
    });
  }
  if (qbOut && player.position !== "QB") {
    factors.push({ key: "qb", label: "QB change", direction: -1, detail: `Starting QB ruled out; a backup is under center` });
  }

  if (player.injury !== "Healthy") {
    factors.push({ key: "injury", label: "Injury", direction: -1, detail: `Listed as ${player.injury} on the injury report` });
  }
  factors.push({
    key: "venue",
    label: "Venue",
    direction: 0,
    detail: game ? `${isHome ? "Home" : "Road"} game ${isHome ? "vs" : "at"} ${opponent}` : "No game found this week (bye or schedule unavailable)",
  });

  // --- Per-stat projections ---
  const recent: ProjectionResult["recent"] = {};
  const projections: StatProjection[] = STATS_BY_POSITION[player.position].map((stat) => {
    const values = logs.map((l) => statValue(l, stat));
    const weights = logs.map((_, i) => (i >= n - 3 ? 2 : 1));
    const wSum = weights.reduce((a, b) => a + b, 0);
    const wAvg = n ? values.reduce((a, v, i) => a + v * weights[i], 0) / wSum : 0;
    recent[stat] = { last3: avg(last3.map((l) => statValue(l, stat))), season: avg(values) };

    const priors = SLOT_PRIORS[player.slot];
    const slotPrior = stat === "anytime_td" ? (priors.rush_tds ?? 0) + (priors.rec_tds ?? 0) : (priors[stat] ?? 0);
    const hasPrior = ctx.priorLogs.length >= 4;
    const prior = hasPrior ? avg(ctx.priorLogs.map((l) => statValue(l, stat))) : slotPrior;
    const K = hasPrior ? 3 : 2;
    let mean = (n * wAvg + K * prior) / (n + K);

    const isVolume = VOLUME_STATS.has(stat);
    const isTd = stat === "pass_tds" || stat === "anytime_td";
    const strength = isVolume ? 0.5 : 1;
    let m = 1;
    if (stat !== "pass_int") m *= 1 + (defMult - 1) * strength;
    m *= Math.pow(impliedRatio, isTd ? 1 : isVolume ? 0.3 : 0.5);
    if (stat === "rush_yds" || stat === "rush_att") m *= 1 + clamp(-teamSpread, -10, 10) * 0.01;
    if (stat === "pass_att" || stat === "pass_cmp") m *= 1 + clamp(teamSpread, -10, 10) * 0.008;
    if (stat === "pass_yds" || stat === "rec_yds") m *= 1 + clamp(teamSpread, -10, 10) * 0.004;
    if (player.position !== "QB") m *= clamp(1 + (roleTrend - 1) * 0.5, 0.85, 1.15);
    if (vacated.length && ["targets", "rec", "rec_yds"].includes(stat)) m *= 1.08;
    if (qbOut && ["rec", "rec_yds", "targets", "anytime_td"].includes(stat)) m *= 0.9;
    m *= isHome ? 1.02 : 0.98;
    m *= INJURY_MULT[player.injury];
    mean = Math.max(0, mean * m);

    let sd: number;
    if (POISSON_STATS.has(stat)) {
      sd = Math.sqrt(mean);
    } else {
      const defaultSd = (DEFAULT_CV[stat] ?? 0.5) * mean;
      const obs = n >= 3 ? Math.sqrt(avg(values.map((v) => (v - avg(values)) ** 2))) : defaultSd;
      sd = Math.sqrt((n * obs ** 2 + 4 * defaultSd ** 2) / (n + 4));
    }
    const cv = mean > 0 ? sd / mean : 1;
    const confidence = confidenceScore({ games: n, cv, roleTrend, injury: player.injury, factors });
    return { stat, mean: round(mean), stdev: round(sd), confidence };
  });

  // Recent form (already in the baseline) is surfaced as a factor for the write-up.
  const headline = projections[0].stat;
  const form = recent[headline];
  if (form && n >= 4 && form.season > 0) {
    const r = form.last3 / form.season;
    if (Math.abs(r - 1) >= 0.12) {
      factors.unshift({
        key: "form",
        label: "Recent form",
        direction: r > 1 ? 1 : -1,
        detail: `Averaging ${form.last3.toFixed(1)} over the last 3 games vs ${form.season.toFixed(1)} on the season`,
      });
    }
  }

  return { projections, factors, opponent, gamesPlayed: n, recent };
}

const round = (x: number) => Math.round(x * 100) / 100;
