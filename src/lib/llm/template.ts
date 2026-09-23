import { STAT_LABELS } from "../config";
import { betLabel, formatOdds, formatProjection, pct } from "../format";
import type { WriteupInput, Writeup, WriteupProvider } from "./types";

/** Deterministic, key-free write-ups built from the model's own factors. */
export function templateWriteup(input: WriteupInput): Writeup {
  const { player, projections, factors, opponent } = input;
  const head = projections[0];
  const matchup = opponent ? ` against ${opponent}` : "";
  const parts: string[] = [];

  const secondary = projections
    .slice(1, 3)
    .map((p) => `${formatProjection(p.stat, p.mean)} ${STAT_LABELS[p.stat].toLowerCase()}`)
    .join(" and ");
  parts.push(
    `We project ${player.name} (${player.team} ${player.slot}) for ${formatProjection(head.stat, head.mean)} ${STAT_LABELS[head.stat].toLowerCase()}${matchup}${secondary ? `, with ${secondary}` : ""}.`,
  );

  const ups = factors.filter((f) => f.direction > 0);
  const downs = factors.filter((f) => f.direction < 0);
  if (ups.length) parts.push(`Working in his favor: ${ups.map((f) => lower(f.detail)).join("; ")}.`);
  if (downs.length) parts.push(`Holding the number back: ${downs.map((f) => lower(f.detail)).join("; ")}.`);
  if (!ups.length && !downs.length) parts.push(`The matchup grades out as neutral, so the projection leans on his baseline production.`);

  const conf = head.confidence;
  parts.push(
    conf >= 70
      ? `Confidence is high (${conf}/100): a steady role and consistent output.`
      : conf >= 50
        ? `Confidence is moderate (${conf}/100).`
        : `Confidence is low (${conf}/100). Limited or volatile data means a wide range of outcomes.`,
  );

  if (input.valueBet) {
    const b = input.valueBet;
    parts.push(
      `Best value: ${betLabel(b.stat, b.lean, b.line)} (${formatOdds(b.lean === "OVER" ? b.overPrice : b.underPrice)} on DraftKings), where the model gives ${pct(b.modelProb)} against the book's ${pct(b.impliedProb)}.`,
    );
  }

  return {
    body: parts.join(" "),
    keyFactors: factors.filter((f) => f.direction !== 0).map((f) => f.label),
    source: "template",
  };
}

/** Lower-case the first letter unless the sentence starts with an acronym like a team code. */
const lower = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

export const templateProvider: WriteupProvider = {
  name: "template",
  async writeBatch(inputs) {
    return inputs.map(templateWriteup);
  },
};
