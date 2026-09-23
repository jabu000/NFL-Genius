import type Database from "better-sqlite3";
import { RETENTION_DAYS, VALUE_EDGE, VALUE_MIN_CONFIDENCE } from "./config";
import { pruneOld, setMeta } from "./db";
import { writeAll, type WriteupInput } from "./llm";
import type { WriteupProvider } from "./llm/types";
import { selectStarters, type Candidate } from "./model/depth";
import { evaluateBet } from "./model/edge";
import { buildDefenseTable, projectPlayer, type ProjectionResult } from "./model/project";
import { normName, playerId } from "./names";
import type { BetEval, DepthEntry, Game, GameLog, Player, ResearchInputs } from "./types";

export interface RunOptions {
  provider: WriteupProvider;
  llmDelayMs?: number;
  source: string;
  log?: (msg: string) => void;
}

const key = (name: string, pos: string) => `${normName(name)}|${pos}`;

function groupLogs(logs: GameLog[]): Map<string, GameLog[]> {
  const m = new Map<string, GameLog[]>();
  for (const l of logs) {
    const k = key(l.name, l.position);
    const arr = m.get(k) ?? [];
    arr.push(l);
    m.set(k, arr);
  }
  return m;
}

function usagePerGame(logs: GameLog[] | undefined): number {
  if (!logs?.length) return 0;
  const recent = [...logs].sort((a, b) => b.week - a.week).slice(0, 3);
  const u = recent.map((l) => (l.position === "QB" ? l.pass_att : l.targets + l.rush_att));
  return u.reduce((a, b) => a + b, 0) / u.length;
}

/**
 * Depth-chart candidates per team. Teams without a depth chart fall back to the
 * players with the most recent usage, with the nflverse projected QB on top.
 */
function buildCandidates(inputs: ResearchInputs, current: Map<string, GameLog[]>, prior: Map<string, GameLog[]>): Map<string, Candidate[]> {
  const byTeam = new Map<string, DepthEntry[]>();
  for (const d of inputs.depth) byTeam.set(d.team, [...(byTeam.get(d.team) ?? []), d]);

  // Early in a season nobody has played yet, so last season's rosters stand in.
  const roster = current.size ? current : prior;
  const latest = new Map<string, GameLog>();
  for (const [k, logs] of roster) latest.set(k, logs.reduce((a, b) => (b.week > a.week ? b : a)));
  const headshot = (name: string, pos: string) =>
    (current.get(key(name, pos)) ?? prior.get(key(name, pos)))?.find((l) => l.headshotUrl)?.headshotUrl;

  const teams = new Set([...byTeam.keys(), ...[...latest.values()].map((l) => l.team)]);
  const out = new Map<string, Candidate[]>();
  for (const team of teams) {
    let entries = byTeam.get(team);
    if (!entries?.length) {
      const ranked = [...latest.entries()]
        .filter(([, l]) => l.team === team)
        .map(([k, l]) => ({ name: l.name, team, position: l.position, u: usagePerGame(roster.get(k)) }))
        .sort((a, b) => b.u - a.u);
      const qb = inputs.starterQbs?.get(team);
      if (qb && !ranked.some((r) => r.position === "QB" && normName(r.name) === normName(qb))) {
        ranked.push({ name: qb, team, position: "QB", u: 0 });
      }
      const isStarterQb = (r: { name: string; position: string }) => r.position === "QB" && !!qb && normName(r.name) === normName(qb);
      ranked.sort((a, b) => Number(isStarterQb(b)) - Number(isStarterQb(a)));
      entries = ranked.map((e, i) => ({
        name: e.name,
        team,
        position: e.position,
        rank: ranked.slice(0, i).filter((x) => x.position === e.position).length,
      }));
    }
    out.set(
      team,
      entries.map((e) => ({
        ...e,
        headshotUrl: e.headshotUrl ?? headshot(e.name, e.position),
        usage: usagePerGame(current.get(key(e.name, e.position))),
        injury: inputs.injuries.get(normName(e.name)) ?? "Healthy",
      })),
    );
  }
  return out;
}

export async function runResearch(db: Database.Database, inputs: ResearchInputs, date: string, opts: RunOptions) {
  const log = opts.log ?? (() => {});
  const current = groupLogs(inputs.logs.filter((l) => l.season === inputs.season));
  const prior = groupLogs(inputs.logs.filter((l) => l.season === inputs.season - 1));

  // 1. Starters
  const candidates = buildCandidates(inputs, current, prior);
  const players: { player: Player; team: Candidate[] }[] = [];
  for (const [team, cands] of candidates) {
    for (const { entry, slot } of selectStarters(cands)) {
      players.push({
        team: cands,
        player: {
          id: playerId(entry.name, entry.position),
          name: entry.name,
          team,
          position: entry.position,
          slot,
          headshotUrl: entry.headshotUrl ?? null,
          injury: entry.injury,
        },
      });
    }
  }
  log(`  ${players.length} starters across ${candidates.size} teams`);

  // 2. Games, Vegas context, defense table
  const gameByTeam = new Map<string, Game>();
  for (const g of [...inputs.games].sort((a, b) => a.kickoff.localeCompare(b.kickoff))) {
    if (!gameByTeam.has(g.home)) gameByTeam.set(g.home, g);
    if (!gameByTeam.has(g.away)) gameByTeam.set(g.away, g);
  }
  const implied = inputs.games.filter((g) => g.total != null).map((g) => g.total! / 2);
  const leagueAvgImplied = implied.length ? implied.reduce((a, b) => a + b, 0) / implied.length : 22.5;
  const weeksThisSeason = new Set(inputs.logs.filter((l) => l.season === inputs.season).map((l) => l.week)).size;
  const defense = buildDefenseTable(weeksThisSeason >= 3 ? inputs.logs.filter((l) => l.season === inputs.season) : inputs.logs);

  // 3. Project
  const results = new Map<string, { player: Player; result: ProjectionResult; game: Game | null }>();
  for (const { player, team } of players) {
    const game = gameByTeam.get(player.team) ?? null;
    const teammatesOut = team
      .filter((c) => c.injury === "Out" && c.rank === 0 && normName(c.name) !== normName(player.name))
      .map((c) => ({ name: c.name, position: c.position }));
    const result = projectPlayer({
      player,
      logs: current.get(key(player.name, player.position)) ?? [],
      priorLogs: prior.get(key(player.name, player.position)) ?? [],
      game,
      defense,
      leagueAvgImplied,
      teammatesOut,
    });
    results.set(player.id, { player, result, game });
  }

  // 4. Compare with DraftKings lines
  const idByName = new Map([...results.values()].map((r) => [normName(r.player.name), r.player.id]));
  const bets: BetEval[] = [];
  for (const prop of inputs.props) {
    const id = idByName.get(normName(prop.playerName));
    if (!id) continue;
    const r = results.get(id)!;
    const proj = r.result.projections.find((p) => p.stat === prop.stat);
    if (!proj) continue;
    const bet = evaluateBet({
      playerId: id,
      stat: prop.stat,
      mean: proj.mean,
      sd: proj.stdev,
      confidence: proj.confidence,
      line: prop.line,
      overPrice: prop.overPrice,
      underPrice: prop.underPrice,
    });
    if (bet) bets.push(bet);
  }
  log(`  ${bets.length} DraftKings props matched to projections`);

  // 5. Write-ups
  const writeupInputs: WriteupInput[] = [...results.values()].map(({ player, result }) => {
    const valueBet =
      bets
        .filter((b) => b.playerId === player.id && b.edge >= VALUE_EDGE && b.confidence >= VALUE_MIN_CONFIDENCE)
        .sort((a, b) => b.edge - a.edge)[0] ?? null;
    return {
      player,
      date,
      opponent: result.opponent,
      gamesPlayed: result.gamesPlayed,
      projections: result.projections,
      factors: result.factors,
      recent: result.recent,
      valueBet,
    };
  });
  log(`  writing ${writeupInputs.length} write-ups with ${opts.provider.name}`);
  const writeups = await writeAll(writeupInputs, opts.provider, { delayMs: opts.llmDelayMs, log });

  // 6. Persist
  const save = db.transaction(() => {
    const now = new Date().toISOString();
    const upPlayer = db.prepare(
      `INSERT INTO players (id, name, team, position, slot, headshot_url, injury, updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name, team=excluded.team, position=excluded.position, slot=excluded.slot,
         headshot_url=COALESCE(excluded.headshot_url, players.headshot_url), injury=excluded.injury, updated=excluded.updated`,
    );
    const upGame = db.prepare(
      `INSERT INTO games (id, season, week, home, away, kickoff, spread, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET week=excluded.week, kickoff=excluded.kickoff, spread=excluded.spread, total=excluded.total`,
    );
    const insProj = db.prepare(
      `INSERT OR REPLACE INTO projections (player_id, date, game_id, opponent, stat, mean, stdev, confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insBet = db.prepare(
      `INSERT OR REPLACE INTO bets (player_id, date, stat, line, over_price, under_price, projection, lean, model_prob, implied_prob, edge, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insWriteup = db.prepare(
      `INSERT OR REPLACE INTO writeups (player_id, date, body, key_factors, source) VALUES (?, ?, ?, ?, ?)`,
    );

    for (const table of ["projections", "bets", "writeups"]) db.prepare(`DELETE FROM ${table} WHERE date = ?`).run(date);
    for (const g of inputs.games) upGame.run(g.id, g.season, g.week, g.home, g.away, g.kickoff, g.spread, g.total);
    for (const { player, result, game } of results.values()) {
      upPlayer.run(player.id, player.name, player.team, player.position, player.slot, player.headshotUrl ?? null, player.injury, now);
      for (const p of result.projections) {
        insProj.run(player.id, date, game?.id ?? null, result.opponent, p.stat, p.mean, p.stdev, p.confidence);
      }
    }
    for (const b of bets) {
      insBet.run(b.playerId, date, b.stat, b.line, b.overPrice, b.underPrice, b.projection, b.lean, b.modelProb, b.impliedProb, b.edge, b.confidence);
    }
    writeupInputs.forEach((input, i) => {
      const w = writeups[i];
      insWriteup.run(input.player.id, date, w.body, JSON.stringify(w.keyFactors), w.source);
    });
    setMeta(db, "last_updated", now);
    setMeta(db, "last_research_date", date);
    setMeta(db, "season", String(inputs.season));
    setMeta(db, "source", opts.source);
  });
  save();

  const pruned = pruneOld(db, date, RETENTION_DAYS);
  log(`  pruned ${pruned} rows older than ${RETENTION_DAYS} days`);

  return { players: results.size, bets: bets.length };
}
