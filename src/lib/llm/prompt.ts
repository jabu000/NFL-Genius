import { STAT_LABELS } from "../config";
import { betLabel, formatOdds, formatProjection, pct } from "../format";
import type { WriteupInput } from "./types";

export const SYSTEM_PROMPT = `You are an NFL analyst writing short daily projection notes.
For each player, write ONE paragraph of 3-5 sentences explaining WHY the model projects what it does.
Rules:
- Use only the facts provided. Never invent injuries, quotes, stats or news.
- Lead with the headline projection and the matchup, then the 1-3 factors that matter most.
- Mention the confidence level in plain words.
- If a value bet is provided, end with one sentence on it (line, price, model vs book probability).
- Plain, confident prose. No bullet points, no hype, no emojis.
Return JSON: {"writeups":[{"id":"<player id>","body":"<paragraph>","keyFactors":["<short label>", ...]}]} in the same order as the input.`;

export function describe(input: WriteupInput): string {
  const p = input.player;
  const lines = [
    `id: ${p.id}`,
    `player: ${p.name}, ${p.team} ${p.slot}, injury status ${p.injury}, ${input.gamesPlayed} games played this season`,
    `opponent: ${input.opponent ?? "unknown/bye"}`,
    `projections: ${input.projections
      .map((x) => `${STAT_LABELS[x.stat]} ${formatProjection(x.stat, x.mean)} (±${x.stdev.toFixed(1)}, confidence ${x.confidence}/100)`)
      .join("; ")}`,
    `recent form: ${Object.entries(input.recent)
      .slice(0, 3)
      .map(([k, v]) => `${STAT_LABELS[k as keyof typeof STAT_LABELS]} last-3 avg ${v!.last3.toFixed(1)} vs season ${v!.season.toFixed(1)}`)
      .join("; ")}`,
    `factors: ${input.factors.map((f) => `[${f.direction > 0 ? "+" : f.direction < 0 ? "-" : "="}] ${f.label}: ${f.detail}`).join(" | ")}`,
  ];
  if (input.valueBet) {
    const b = input.valueBet;
    lines.push(
      `value bet: ${betLabel(b.stat, b.lean, b.line)} at ${formatOdds(b.lean === "OVER" ? b.overPrice : b.underPrice)} on DraftKings; model ${pct(b.modelProb)} vs book ${pct(b.impliedProb)} (edge ${pct(b.edge, 1)})`,
    );
  }
  return lines.join("\n");
}

export function userPrompt(inputs: WriteupInput[]): string {
  return `Date: ${inputs[0]?.date}\n\n${inputs.map(describe).join("\n\n")}`;
}

/** Parse the model's JSON reply and line it up with the inputs by id. */
export function parseReply(text: string, inputs: WriteupInput[], source: string) {
  const cleaned = text.replace(/^```(json)?/m, "").replace(/```\s*$/m, "");
  const parsed = JSON.parse(cleaned) as { writeups?: { id: string; body: string; keyFactors?: string[] }[] };
  const byId = new Map((parsed.writeups ?? []).map((w) => [w.id, w]));
  return inputs.map((input) => {
    const w = byId.get(input.player.id);
    if (!w?.body) throw new Error(`missing write-up for ${input.player.id}`);
    return { body: w.body.trim(), keyFactors: (w.keyFactors ?? []).slice(0, 5), source };
  });
}
