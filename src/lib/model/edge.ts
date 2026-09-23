import { MODEL_WEIGHT, POISSON_STATS } from "../config";
import type { BetEval, StatKey } from "../types";

/** Implied probability of American odds (includes the book's vig). */
export function americanToProb(odds: number): number {
  return odds < 0 ? -odds / (-odds + 100) : 100 / (odds + 100);
}

/** Remove the vig from a two-way market so the probabilities sum to 1. */
export function devig(overOdds: number, underOdds: number): { over: number; under: number } {
  const o = americanToProb(overOdds);
  const u = americanToProb(underOdds);
  return { over: o / (o + u), under: u / (o + u) };
}

// Abramowitz–Stegun 7.1.26 approximation of erf.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normalCdf(x: number, mean: number, sd: number): number {
  if (sd <= 0) return x >= mean ? 1 : 0;
  return 0.5 * (1 + erf((x - mean) / (sd * Math.SQRT2)));
}

export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return 1;
  let term = Math.exp(-lambda);
  let sum = term;
  for (let i = 1; i <= Math.floor(k); i++) {
    term *= lambda / i;
    sum += term;
  }
  return Math.min(1, sum);
}

/** P(stat > line) under the model's distribution for that stat. */
export function overProbability(stat: StatKey, mean: number, sd: number, line: number): number {
  if (POISSON_STATS.has(stat)) {
    // Over 4.5 receptions means 5+, i.e. 1 - P(X <= 4).
    return 1 - poissonCdf(Math.floor(line), mean);
  }
  return 1 - normalCdf(line, mean, sd);
}

export function evaluateBet(args: {
  playerId: string;
  stat: StatKey;
  mean: number;
  sd: number;
  confidence: number;
  line: number;
  overPrice: number | null;
  underPrice: number | null;
}): BetEval | null {
  const { overPrice, underPrice } = args;
  if (overPrice == null && underPrice == null) return null;
  const rawOver = overProbability(args.stat, args.mean, args.sd, args.line);

  let impliedOver: number;
  let impliedUnder: number;
  if (overPrice != null && underPrice != null) {
    const fair = devig(overPrice, underPrice);
    impliedOver = fair.over;
    impliedUnder = fair.under;
  } else if (overPrice != null) {
    // One-sided market (e.g. anytime TD "Yes"): no way to strip the vig, so compare to the raw price.
    impliedOver = americanToProb(overPrice);
    impliedUnder = 1 - impliedOver;
  } else {
    impliedUnder = americanToProb(underPrice!);
    impliedOver = 1 - impliedUnder;
  }

  // Blend toward the market so only disagreements the model is sure about survive.
  const pOver = MODEL_WEIGHT * rawOver + (1 - MODEL_WEIGHT) * impliedOver;
  const overEdge = overPrice != null ? pOver - impliedOver : -Infinity;
  const underEdge = underPrice != null ? 1 - pOver - impliedUnder : -Infinity;
  const takeOver = overEdge >= underEdge;

  return {
    playerId: args.playerId,
    stat: args.stat,
    line: args.line,
    overPrice,
    underPrice,
    projection: args.mean,
    lean: takeOver ? "OVER" : "UNDER",
    modelProb: takeOver ? pOver : 1 - pOver,
    impliedProb: takeOver ? impliedOver : impliedUnder,
    edge: takeOver ? overEdge : underEdge,
    confidence: args.confidence,
  };
}
