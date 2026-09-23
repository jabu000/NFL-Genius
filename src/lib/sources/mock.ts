/**
 * Deterministic fake data for developing the UI without API keys. Player names
 * are invented and every page is labelled "Demo data" when this source is used.
 */
import { ODDS_MARKETS, SLOT_PRIORS } from "../config";
import { TEAM_ABBR } from "../teams";
import type { DepthEntry, DepthSlot, Game, GameLog, InjuryStatus, Position, PropLine, ResearchInputs, StatKey } from "../types";
import { normName } from "../names";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: string) {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
}

const FIRST = ["Marcus", "Jalen", "Tyrell", "Derek", "Caleb", "Andre", "Brandon", "Isaiah", "Malik", "Trevor", "Darius", "Evan", "Julian", "Cole", "Xavier", "Quincy", "Terrance", "Devon", "Nate", "Rashad", "Owen", "Micah", "Grant", "Tavon", "Elijah", "Corey", "Damon", "Reggie", "Silas", "Wes", "Jaylen", "Kendrick", "Luke", "Roman", "Tobias", "Zion", "Amari", "Beau", "Cedric", "Dante"];
const LAST = ["Hale", "Whitaker", "Brooks", "Mercer", "Dalton", "Pryor", "Vance", "Holloway", "Sutton", "Garrison", "Maddox", "Kincaid", "Rowe", "Lockhart", "Easton", "Barrett", "Crane", "Fowler", "Ashby", "Tatum", "Rhodes", "Calloway", "Prescott", "Winslow", "Harlan", "Keaton", "Langford", "Monroe", "Stroud", "Beckett", "Carver", "Dillard", "Ellison", "Fontaine", "Grayson", "Hendrix", "Irving", "Jennings", "Kessler", "Larkin", "Mathis", "Norwood", "Oakley", "Penrose", "Radcliffe", "Sterling", "Thorne", "Underwood", "Voss", "Wakefield"];

const ROSTER: { pos: Position; count: number; slots: DepthSlot[] }[] = [
  { pos: "QB", count: 2, slots: ["QB1", "QB1"] },
  { pos: "RB", count: 3, slots: ["RB1", "RB2", "RB2"] },
  { pos: "WR", count: 5, slots: ["WR1", "WR2", "WR3", "WR3", "WR3"] },
  { pos: "TE", count: 2, slots: ["TE1", "TE1"] },
];

interface MockPlayer extends DepthEntry {
  slot: DepthSlot;
  talent: number;
  rookie: boolean;
}

function roster(): MockPlayer[] {
  const used = new Set<string>();
  const out: MockPlayer[] = [];
  for (const team of Object.values(TEAM_ABBR)) {
    for (const { pos, count, slots } of ROSTER) {
      for (let i = 0; i < count; i++) {
        const r = rng(`${team}-${pos}-${i}`);
        let name = "";
        do name = `${FIRST[Math.floor(r() * FIRST.length)]} ${LAST[Math.floor(r() * LAST.length)]}`;
        while (used.has(name));
        used.add(name);
        const depthScale = i === 0 ? 1 : i === 1 ? 0.8 : 0.6;
        out.push({
          name,
          team,
          position: pos,
          rank: i,
          slot: slots[i],
          talent: Math.max(0.55, (1 + gauss(r) * 0.18) * (i === 0 ? 1 : depthScale + 0.15)),
          rookie: r() < 0.2,
        });
      }
    }
  }
  return out;
}

function schedule(week: number): [string, string][] {
  const teams = Object.values(TEAM_ABBR);
  const r = rng(`schedule-${week}`);
  const shuffled = [...teams].sort(() => r() - 0.5);
  const pairs: [string, string][] = [];
  for (let i = 0; i < shuffled.length; i += 2) pairs.push([shuffled[i], shuffled[i + 1]]);
  return pairs; // [away, home]
}

function statLine(p: MockPlayer, r: () => number, env: number): Omit<GameLog, "name" | "team" | "position" | "season" | "week" | "opponent"> {
  const prior = SLOT_PRIORS[p.slot];
  const f = (k: StatKey, cv: number) => Math.max(0, (prior[k] ?? 0) * p.talent * env * (1 + gauss(r) * cv));
  const pois = (lambda: number) => {
    let k = 0;
    let t = Math.exp(-lambda);
    let s = t;
    const u = r();
    while (u > s && k < 8) {
      k++;
      t *= lambda / k;
      s += t;
    }
    return k;
  };
  const isQb = p.position === "QB";
  const pass_att = isQb ? Math.round(f("pass_att", 0.18)) : 0;
  const targets = isQb ? 0 : Math.round(f("targets", 0.35));
  const rec = Math.min(targets, Math.round(targets * (0.6 + r() * 0.2)));
  return {
    pass_att,
    pass_cmp: Math.round(pass_att * (0.6 + r() * 0.1)),
    pass_yds: isQb ? Math.round(f("pass_yds", 0.25)) : 0,
    pass_tds: isQb ? pois((prior.pass_tds ?? 0) * p.talent * env) : 0,
    pass_int: isQb ? pois(prior.pass_int ?? 0) : 0,
    rush_att: Math.round(f("rush_att", 0.3)),
    rush_yds: Math.round(f("rush_yds", 0.5)),
    rush_tds: pois((prior.rush_tds ?? 0) * p.talent * env),
    targets,
    rec,
    rec_yds: Math.round(rec * (p.position === "RB" ? 7.5 : 12.5) * (0.7 + r() * 0.6)),
    rec_tds: pois((prior.rec_tds ?? 0) * p.talent * env),
  };
}

export function generateMockInputs(date: string, season: number): ResearchInputs {
  const players = roster();
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date(y, m - 1, d);
  const kickoff1 = new Date(season, 8, 7);
  const weeksDone = Math.min(17, Math.max(3, Math.floor((now.getTime() - kickoff1.getTime()) / (7 * 86_400_000)) + 1));

  // Defense quality per team, so matchups mean something.
  const defense = new Map(Object.values(TEAM_ABBR).map((t) => [t, 1 + gauss(rng(`def-${t}`)) * 0.12]));

  const logs: GameLog[] = [];
  for (const [yr, weeks, tag] of [
    [season, weeksDone, "cur"],
    [season - 1, 17, "prev"],
  ] as const) {
    for (let week = 1; week <= weeks; week++) {
      for (const [away, home] of schedule(week + (tag === "prev" ? 100 : 0))) {
        for (const [team, opp] of [
          [away, home],
          [home, away],
        ]) {
          for (const p of players.filter((x) => x.team === team)) {
            if (tag === "prev" && p.rookie) continue;
            const r = rng(`${p.name}-${yr}-${week}`);
            if (r() < 0.06) continue; // missed game
            logs.push({ name: p.name, team, position: p.position, season: yr, week, opponent: opp, ...statLine(p, r, defense.get(opp)!) });
          }
        }
      }
    }
  }

  const dayR = rng(`day-${date}`);
  const week = weeksDone + 1;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + ((7 - now.getDay()) % 7 || 7));
  sunday.setHours(13, 0, 0, 0);
  const games: Game[] = schedule(week).map(([away, home]) => {
    const r = rng(`game-${week}-${away}-${home}`);
    const base = Math.round((gauss(r) * 5) * 2) / 2;
    const drift = Math.round(gauss(dayR) * 0.6 * 2) / 2;
    return {
      id: `mock-${season}-w${week}-${away}-${home}`,
      season,
      week,
      home,
      away,
      kickoff: sunday.toISOString(),
      spread: base + drift,
      total: Math.round((44 + gauss(r) * 4 + gauss(dayR) * 0.5) * 2) / 2,
    };
  });

  const injuries = new Map<string, InjuryStatus>();
  for (const p of players) {
    const r = rng(`inj-${p.name}-${date}`)();
    if (r < 0.01) injuries.set(normName(p.name), "Out");
    else if (r < 0.02) injuries.set(normName(p.name), "Doubtful");
    else if (r < 0.07) injuries.set(normName(p.name), "Questionable");
  }

  const props: PropLine[] = [];
  const gameFor = (team: string) => games.find((g) => g.home === team || g.away === team)!;
  const statsFor: Record<Position, StatKey[]> = {
    QB: ["pass_yds", "pass_tds", "anytime_td"],
    RB: ["rush_yds", "rec_yds", "rec", "anytime_td"],
    WR: ["rec_yds", "rec", "anytime_td"],
    TE: ["rec_yds", "rec", "anytime_td"],
  };
  const statToMarket = new Map(Object.entries(ODDS_MARKETS).map(([k, v]) => [v, k]));
  for (const p of players.filter((x) => x.rank < (x.position === "WR" ? 3 : x.position === "RB" ? 2 : 1))) {
    const g = gameFor(p.team);
    for (const stat of statsFor[p.position]) {
      if (!statToMarket.has(stat)) continue;
      const r = rng(`prop-${p.name}-${stat}-${date}`);
      const prior = SLOT_PRIORS[p.slot];
      if (stat === "anytime_td") {
        const lambda = ((prior.rush_tds ?? 0) + (prior.rec_tds ?? 0)) * p.talent * (1 + gauss(r) * 0.25);
        const prob = Math.min(0.75, Math.max(0.05, 1 - Math.exp(-lambda)) * 1.08);
        const price = prob >= 0.5 ? -Math.round((prob / (1 - prob)) * 100) : Math.round(((1 - prob) / prob) * 100);
        props.push({ playerName: p.name, gameId: g.id, stat, line: 0.5, overPrice: Math.round(price / 5) * 5, underPrice: null, book: "draftkings", fetchedAt: new Date().toISOString() });
        continue;
      }
      const mine = logs.filter((l) => l.name === p.name && l.season === season).map((l) => l[stat as keyof GameLog] as number);
      const seasonAvg = mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : (prior[stat] ?? 1) * p.talent;
      const base = (0.6 * seasonAvg + 0.4 * (prior[stat] ?? 1) * p.talent) * (1 + gauss(r) * 0.07);
      const line = Math.max(0.5, Math.floor(base) + 0.5);
      const juice = Math.round(gauss(r) * 12);
      props.push({
        playerName: p.name,
        gameId: g.id,
        stat,
        line,
        overPrice: -110 + juice,
        underPrice: -110 - juice,
        book: "draftkings",
        fetchedAt: new Date().toISOString(),
      });
    }
  }

  const depth: DepthEntry[] = players.map((p) => ({ name: p.name, team: p.team, position: p.position, rank: p.rank }));
  return { season, games, depth, injuries, logs, props };
}
