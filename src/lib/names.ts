/** Normalise a player name so ESPN, nflverse and sportsbook spellings match. */
export function normName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’`-]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function playerId(name: string, position: string): string {
  return `${normName(name).replace(/ /g, "-")}-${position.toLowerCase()}`;
}
