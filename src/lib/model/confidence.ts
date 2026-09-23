import type { Factor, InjuryStatus } from "../types";

export interface ConfidenceInputs {
  /** Games of history behind the projection this season. */
  games: number;
  /** stdev / mean of the projected stat. */
  cv: number;
  /** Recent usage share ÷ season usage share (1 = stable role). */
  roleTrend: number;
  injury: InjuryStatus;
  factors: Factor[];
}

const INJURY_SCORE: Record<InjuryStatus, number> = { Healthy: 1, Questionable: 0.55, Doubtful: 0.15, Out: 0 };

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * 0–100 score for how much to trust a projection: more history, lower variance,
 * a stable role, a healthy player and matchup signals that agree all raise it.
 */
export function confidenceScore(c: ConfidenceInputs): number {
  const sample = clamp(c.games / 8, 0, 1);
  const consistency = clamp(1 - c.cv, 0, 1);
  const role = clamp(1 - Math.abs(c.roleTrend - 1) * 2, 0, 1);
  const injury = INJURY_SCORE[c.injury];
  const directional = c.factors.filter((f) => f.direction !== 0);
  const ups = directional.filter((f) => f.direction > 0).length;
  const agreement = directional.length ? Math.abs(ups * 2 - directional.length) / directional.length : 0.5;

  const score = 100 * (0.25 * sample + 0.3 * consistency + 0.15 * role + 0.15 * injury + 0.15 * agreement);
  return Math.round(clamp(score, 5, 95));
}
