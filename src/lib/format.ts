import { STAT_LABELS } from "./config";
import type { StatKey } from "./types";

/** Anytime-TD projections are stored as expected TDs; show them as a probability. */
export function formatProjection(stat: StatKey, mean: number): string {
  if (stat === "anytime_td") return `${Math.round((1 - Math.exp(-mean)) * 100)}%`;
  if (stat.endsWith("_yds")) return mean.toFixed(1);
  return mean.toFixed(1);
}

export function formatLine(stat: StatKey, line: number): string {
  return stat === "anytime_td" ? "Yes" : line.toFixed(1);
}

export function formatOdds(price: number | null): string {
  if (price == null) return "—";
  return price > 0 ? `+${price}` : `${price}`;
}

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function betLabel(stat: StatKey, lean: "OVER" | "UNDER", line: number): string {
  if (stat === "anytime_td") return lean === "OVER" ? "Anytime TD: Yes" : "Anytime TD: No";
  return `${lean === "OVER" ? "Over" : "Under"} ${line.toFixed(1)} ${STAT_LABELS[stat]}`;
}
