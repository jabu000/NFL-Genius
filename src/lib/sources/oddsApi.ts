/**
 * DraftKings lines via The Odds API (https://the-odds-api.com/liveapi/guides/v4/).
 * Every call costs credits: game lines cost 1 per market; player props cost
 * 1 per market per event. The remaining quota is returned with each response.
 */
import { ODDS_MARKETS } from "../config";
import { TEAM_ABBR } from "../teams";
import type { PropLine } from "../types";
import { fetchWithRetry } from "./http";

const BASE = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl";
const BOOK = "draftkings";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface OddsEvent {
  id: string;
  home: string;
  away: string;
  kickoff: string;
  spread: number | null;
  total: number | null;
}

export interface Quota {
  remaining: number | null;
  used: number | null;
}

function quota(res: Response): Quota {
  const r = res.headers.get("x-requests-remaining");
  const u = res.headers.get("x-requests-used");
  return { remaining: r != null ? Number(r) : null, used: u != null ? Number(u) : null };
}

async function get(url: string): Promise<{ data: any; quota: Quota }> {
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`Odds API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { data: await res.json(), quota: quota(res) };
}

/** Upcoming games with DraftKings spread and total (2 credits). */
export async function fetchGameLines(apiKey: string): Promise<{ events: OddsEvent[]; quota: Quota }> {
  const { data, quota } = await get(
    `${BASE}/odds?apiKey=${apiKey}&regions=us&markets=spreads,totals&bookmakers=${BOOK}&oddsFormat=american`,
  );
  const events: OddsEvent[] = (data as any[]).map((ev) => {
    const home = TEAM_ABBR[ev.home_team] ?? ev.home_team;
    const away = TEAM_ABBR[ev.away_team] ?? ev.away_team;
    const markets: any[] = ev.bookmakers?.find((b: any) => b.key === BOOK)?.markets ?? [];
    const spreadMkt = markets.find((m) => m.key === "spreads");
    const totalMkt = markets.find((m) => m.key === "totals");
    const homeSpread = spreadMkt?.outcomes?.find((o: any) => o.name === ev.home_team)?.point;
    const total = totalMkt?.outcomes?.[0]?.point;
    return {
      id: ev.id,
      home,
      away,
      kickoff: ev.commence_time,
      spread: typeof homeSpread === "number" ? homeSpread : null,
      total: typeof total === "number" ? total : null,
    };
  });
  return { events, quota };
}

/** DraftKings player props for one game (1 credit per market). */
export async function fetchEventProps(
  apiKey: string,
  eventId: string,
  gameId: string,
  markets: string[],
): Promise<{ props: PropLine[]; quota: Quota }> {
  const { data, quota } = await get(
    `${BASE}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=${markets.join(",")}&bookmakers=${BOOK}&oddsFormat=american`,
  );
  return { props: parseProps(data, gameId, new Date().toISOString()), quota };
}

export function parseProps(data: any, gameId: string, fetchedAt: string): PropLine[] {
  const book = data?.bookmakers?.find((b: any) => b.key === BOOK);
  const byKey = new Map<string, PropLine>();
  for (const market of book?.markets ?? []) {
    const stat = ODDS_MARKETS[market.key];
    if (!stat) continue;
    for (const o of market.outcomes ?? []) {
      // Over/Under markets put the player in `description`; anytime TD uses name "Yes"/"No" or the player's name.
      const isSide = ["Over", "Under", "Yes", "No"].includes(o.name);
      const player: string | undefined = isSide ? o.description : o.name;
      if (!player) continue;
      const line = typeof o.point === "number" ? o.point : 0.5;
      const key = `${player}|${stat}|${line}`;
      const prop = byKey.get(key) ?? {
        playerName: player,
        gameId,
        stat,
        line,
        overPrice: null,
        underPrice: null,
        book: BOOK,
        fetchedAt,
      };
      if (o.name === "Under" || o.name === "No") prop.underPrice = o.price;
      else prop.overPrice = o.price;
      byKey.set(key, prop);
    }
  }
  // DraftKings sometimes lists alternate lines; keep the one priced closest to even per player/stat.
  const best = new Map<string, PropLine>();
  for (const p of byKey.values()) {
    const k = `${p.playerName}|${p.stat}`;
    const cur = best.get(k);
    if (!cur || balance(p) < balance(cur)) best.set(k, p);
  }
  return [...best.values()];
}

function balance(p: PropLine): number {
  if (p.overPrice == null || p.underPrice == null) return 1000;
  return Math.abs(Math.abs(p.overPrice) - Math.abs(p.underPrice));
}
