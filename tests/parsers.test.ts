import { describe, expect, it } from "vitest";
import { normName } from "@/lib/names";
import { parseSpread, toInjury } from "@/lib/sources/espn";
import { parseCsv } from "@/lib/sources/http";
import { rowsToLogs } from "@/lib/sources/nflverse";
import { parseProps } from "@/lib/sources/oddsApi";

describe("parsers", () => {
  it("normalises names across sources", () => {
    expect(normName("Marvin Harrison Jr.")).toBe("marvin harrison");
    expect(normName("Ja'Marr Chase")).toBe("jamarr chase");
    expect(normName("Amon-Ra St. Brown")).toBe(normName("Amon-Ra St Brown"));
  });

  it("parses ESPN spreads relative to the home team", () => {
    expect(parseSpread("KC -3.5", "KC")).toBe(-3.5);
    expect(parseSpread("KC -3.5", "BUF")).toBe(3.5);
    expect(parseSpread("EVEN", "KC")).toBe(0);
    expect(parseSpread(undefined, "KC")).toBeNull();
  });

  it("maps injury designations", () => {
    expect(toInjury("Injured Reserve")).toBe("Out");
    expect(toInjury("Questionable")).toBe("Questionable");
    expect(toInjury("Active")).toBe("Healthy");
  });

  it("parses nflverse CSV rows into game logs", () => {
    const csv = [
      "player_display_name,position,season,week,season_type,team,opponent_team,receptions,targets,receiving_yards,receiving_tds,carries",
      'Test Player,WR,2026,2,REG,KC,"LV",6,9,88,1,0',
      "Kicker Guy,K,2026,2,REG,KC,LV,0,0,0,0,0",
      "Post Guy,WR,2026,19,POST,KC,LV,1,1,1,0,0",
    ].join("\n");
    const logs = rowsToLogs(parseCsv(csv));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ name: "Test Player", team: "KC", opponent: "LV", rec: 6, targets: 9, rec_yds: 88, rec_tds: 1 });
  });

  it("parses DraftKings props from The Odds API", () => {
    const data = {
      bookmakers: [
        {
          key: "draftkings",
          markets: [
            {
              key: "player_reception_yds",
              outcomes: [
                { name: "Over", description: "Test Player", price: -115, point: 64.5 },
                { name: "Under", description: "Test Player", price: -105, point: 64.5 },
              ],
            },
            { key: "player_anytime_td", outcomes: [{ name: "Yes", description: "Test Player", price: 160 }] },
          ],
        },
      ],
    };
    const props = parseProps(data, "g1", "2026-09-23T00:00:00Z");
    expect(props).toHaveLength(2);
    expect(props.find((p) => p.stat === "rec_yds")).toMatchObject({ line: 64.5, overPrice: -115, underPrice: -105 });
    expect(props.find((p) => p.stat === "anytime_td")).toMatchObject({ line: 0.5, overPrice: 160, underPrice: null });
  });
});

describe("nflverse schedule", () => {
  it("returns the next unplayed week with home-relative spreads and starting QBs", async () => {
    const { upcomingFromSchedule } = await import("@/lib/sources/nflverse");
    const row = (week: string, gameday: string, home_score: string, spread_line: string) => ({
      game_id: `g${week}`,
      season: "2026",
      week,
      gameday,
      gametime: "13:00",
      home_team: "GB",
      away_team: "ATL",
      home_score,
      spread_line,
      total_line: "43.5",
      home_qb_name: "Jordan Love",
      away_qb_name: "Michael Penix Jr.",
    });
    const { games, starterQbs } = upcomingFromSchedule(
      [row("2", "2026-09-17", "24", "3"), row("3", "2026-09-24", "", "5.5"), row("4", "2026-10-01", "", "1")],
      2026,
      "2026-09-23",
    );
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ week: 3, home: "GB", away: "ATL", spread: -5.5, total: 43.5 });
    expect(starterQbs.get("GB")).toBe("Jordan Love");
  });
});
