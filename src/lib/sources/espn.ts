/**
 * ESPN's public (unofficial, keyless) JSON endpoints. They are undocumented and
 * occasionally change shape, so every parser here is defensive.
 */
import { canonTeam } from "../teams";
import type { DepthEntry, Game, InjuryStatus, Position } from "../types";
import { normName } from "../names";
import { fetchJson } from "./http";

const SITE = "https://site.api.espn.com/apis/site/v2/sports/football/nfl";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function fetchTeams(): Promise<{ id: string; abbr: string; name: string }[]> {
  const data = await fetchJson<any>(`${SITE}/teams`);
  const teams: any[] = data?.sports?.[0]?.leagues?.[0]?.teams ?? [];
  return teams.map((t) => ({ id: String(t.team.id), abbr: canonTeam(t.team.abbreviation), name: t.team.displayName }));
}

function toPosition(raw: string): Position | null {
  const p = raw.toUpperCase();
  if (p === "QB") return "QB";
  if (p === "RB" || p === "HB") return "RB";
  if (p === "WR" || p === "LWR" || p === "RWR" || p === "SWR" || p === "SLWR") return "WR";
  if (p === "TE") return "TE";
  return null;
}

export async function fetchDepthChart(teamId: string, abbr: string): Promise<DepthEntry[]> {
  const data = await fetchJson<any>(`${SITE}/teams/${teamId}/depthcharts`);
  const groups: any[] = data?.depthchart ?? data?.items ?? [];
  const best = new Map<string, DepthEntry>();
  for (const group of groups) {
    for (const [key, val] of Object.entries<any>(group?.positions ?? {})) {
      const pos = toPosition(val?.position?.abbreviation ?? key);
      if (!pos) continue;
      (val?.athletes ?? []).forEach((a: any, rank: number) => {
        const name: string | undefined = a?.displayName ?? a?.fullName ?? a?.athlete?.displayName;
        if (!name) return;
        const k = `${normName(name)}|${pos}`;
        const prev = best.get(k);
        if (prev && prev.rank <= rank) return;
        const id = a?.id ? String(a.id) : undefined;
        best.set(k, {
          name,
          team: abbr,
          position: pos,
          rank,
          espnId: id,
          headshotUrl: a?.headshot?.href ?? (id ? `https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png` : undefined),
        });
      });
    }
  }
  return [...best.values()];
}

function parseEvents(data: any, season: number): { games: Game[]; allFinal: boolean; week: number } {
  const week = Number(data?.week?.number ?? 0);
  const events: any[] = data?.events ?? [];
  let allFinal = events.length > 0;
  const games: Game[] = [];
  for (const ev of events) {
    const comp = ev?.competitions?.[0];
    const state = comp?.status?.type?.state ?? ev?.status?.type?.state;
    if (state !== "post") allFinal = false;
    if (state === "post") continue;
    const home = comp?.competitors?.find((c: any) => c.homeAway === "home")?.team?.abbreviation;
    const away = comp?.competitors?.find((c: any) => c.homeAway === "away")?.team?.abbreviation;
    if (!home || !away) continue;
    const odds = comp?.odds?.[0];
    games.push({
      id: String(ev.id),
      season,
      week,
      home: canonTeam(home),
      away: canonTeam(away),
      kickoff: ev.date,
      spread: parseSpread(odds?.details, canonTeam(home)),
      total: typeof odds?.overUnder === "number" ? odds.overUnder : null,
    });
  }
  return { games, allFinal, week };
}

/** "KC -3.5" → home spread (negative when the home team is favoured). "EVEN" → 0. */
export function parseSpread(details: string | undefined, home: string): number | null {
  if (!details) return null;
  if (/even|pk|pick/i.test(details)) return 0;
  const m = details.match(/([A-Z]{2,3})\s*([-+]?\d+(\.\d+)?)/);
  if (!m) return null;
  const fav = canonTeam(m[1]);
  const pts = Math.abs(Number(m[2]));
  return fav === home ? -pts : pts;
}

/** Upcoming games this week; if the current week is finished, the next week. */
export async function fetchUpcomingGames(season: number): Promise<Game[]> {
  const cur = parseEvents(await fetchJson<any>(`${SITE}/scoreboard`), season);
  if (cur.games.length && !cur.allFinal) return cur.games;
  const next = await fetchJson<any>(`${SITE}/scoreboard?seasontype=2&week=${cur.week + 1}`);
  return parseEvents(next, season).games;
}

export async function fetchInjuries(): Promise<Map<string, InjuryStatus>> {
  const data = await fetchJson<any>(`${SITE}/injuries`);
  const out = new Map<string, InjuryStatus>();
  for (const team of data?.injuries ?? []) {
    for (const inj of team?.injuries ?? []) {
      const name = inj?.athlete?.displayName;
      if (!name) continue;
      out.set(normName(name), toInjury(String(inj?.status ?? "")));
    }
  }
  return out;
}

export function toInjury(status: string): InjuryStatus {
  const s = status.toLowerCase();
  if (s.includes("out") || s.includes("reserve") || s.includes("suspend") || s.includes("pup")) return "Out";
  if (s.includes("doubt")) return "Doubtful";
  if (s.includes("question") || s.includes("day-to-day")) return "Questionable";
  return "Healthy";
}
