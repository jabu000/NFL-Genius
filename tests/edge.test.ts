import { describe, expect, it } from "vitest";
import { americanToProb, devig, evaluateBet, normalCdf, overProbability, poissonCdf } from "@/lib/model/edge";

describe("odds math", () => {
  it("converts American odds to implied probability", () => {
    expect(americanToProb(-110)).toBeCloseTo(0.5238, 4);
    expect(americanToProb(+150)).toBeCloseTo(0.4, 4);
    expect(americanToProb(-200)).toBeCloseTo(0.6667, 4);
  });

  it("removes the vig so both sides sum to 1", () => {
    const { over, under } = devig(-110, -110);
    expect(over).toBeCloseTo(0.5, 6);
    expect(over + under).toBeCloseTo(1, 6);
    const skew = devig(-130, 110);
    expect(skew.over).toBeGreaterThan(0.5);
    expect(skew.over + skew.under).toBeCloseTo(1, 6);
  });
});

describe("distributions", () => {
  it("normal CDF matches known values", () => {
    expect(normalCdf(0, 0, 1)).toBeCloseTo(0.5, 5);
    expect(normalCdf(1.96, 0, 1)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1, 0, 1)).toBeCloseTo(0.1587, 3);
  });

  it("Poisson CDF matches known values", () => {
    expect(poissonCdf(0, 1)).toBeCloseTo(Math.exp(-1), 6);
    expect(poissonCdf(2, 3)).toBeCloseTo(0.4232, 4);
  });

  it("over probability uses the right distribution per stat", () => {
    // Yards: normal, line at the mean → 50%.
    expect(overProbability("rec_yds", 60, 25, 60)).toBeCloseTo(0.5, 5);
    // Receptions: Poisson, over 4.5 = 5 or more.
    expect(overProbability("rec", 5, Math.sqrt(5), 4.5)).toBeCloseTo(1 - poissonCdf(4, 5), 6);
    // Anytime TD: at least one.
    expect(overProbability("anytime_td", 0.5, 0.7, 0.5)).toBeCloseTo(1 - Math.exp(-0.5), 6);
  });
});

describe("evaluateBet", () => {
  const base = { playerId: "p", stat: "rec_yds" as const, sd: 20, confidence: 70, overPrice: -110, underPrice: -110 };

  it("leans over when the projection is above the line", () => {
    const b = evaluateBet({ ...base, mean: 80, line: 60.5 })!;
    expect(b.lean).toBe("OVER");
    expect(b.edge).toBeGreaterThan(0.1);
    expect(b.modelProb).toBeGreaterThan(b.impliedProb);
  });

  it("leans under when the projection is below the line", () => {
    const b = evaluateBet({ ...base, mean: 40, line: 60.5 })!;
    expect(b.lean).toBe("UNDER");
    expect(b.edge).toBeGreaterThan(0.1);
  });

  it("shows no edge when projection equals a fair line", () => {
    const b = evaluateBet({ ...base, mean: 60.5, line: 60.5 })!;
    expect(Math.abs(b.edge)).toBeLessThan(0.001);
  });

  it("handles one-sided anytime-TD markets", () => {
    const b = evaluateBet({ ...base, stat: "anytime_td", mean: 0.9, line: 0.5, overPrice: 150, underPrice: null })!;
    expect(b.lean).toBe("OVER");
    expect(b.impliedProb).toBeCloseTo(0.4, 4);
  });

  it("returns null without prices", () => {
    expect(evaluateBet({ ...base, mean: 50, line: 50.5, overPrice: null, underPrice: null })).toBeNull();
  });
});
