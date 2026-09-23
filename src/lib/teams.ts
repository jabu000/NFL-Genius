/** Full team names (as used by sportsbooks) → standard abbreviations. */
export const TEAM_ABBR: Record<string, string> = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Las Vegas Raiders": "LV",
  "Los Angeles Chargers": "LAC",
  "Los Angeles Rams": "LAR",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "San Francisco 49ers": "SF",
  "Seattle Seahawks": "SEA",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS",
};

export const TEAM_NAME: Record<string, string> = Object.fromEntries(Object.entries(TEAM_ABBR).map(([n, a]) => [a, n]));

/** ESPN and nflverse disagree on a few abbreviations; map everything to one set. */
const ALIASES: Record<string, string> = { WSH: "WAS", JAC: "JAX", LA: "LAR", OAK: "LV", SD: "LAC", STL: "LAR" };

export function canonTeam(abbr: string): string {
  const a = abbr.toUpperCase();
  return ALIASES[a] ?? a;
}
