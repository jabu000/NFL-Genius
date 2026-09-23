import { describe, expect, it } from "vitest";
import { confidenceScore } from "@/lib/model/confidence";
import type { Factor } from "@/lib/types";

const up: Factor = { key: "a", label: "a", direction: 1, detail: "" };
const down: Factor = { key: "b", label: "b", direction: -1, detail: "" };

describe("confidenceScore", () => {
  it("stays within 5–95", () => {
    const hi = confidenceScore({ games: 20, cv: 0, roleTrend: 1, injury: "Healthy", factors: [up, up] });
    const lo = confidenceScore({ games: 0, cv: 5, roleTrend: 3, injury: "Out", factors: [up, down] });
    expect(hi).toBeLessThanOrEqual(95);
    expect(lo).toBeGreaterThanOrEqual(5);
  });

  it("rewards more history, lower variance and health", () => {
    const base = { games: 4, cv: 0.4, roleTrend: 1, injury: "Healthy" as const, factors: [up] };
    const s = confidenceScore(base);
    expect(confidenceScore({ ...base, games: 8 })).toBeGreaterThan(s);
    expect(confidenceScore({ ...base, cv: 0.8 })).toBeLessThan(s);
    expect(confidenceScore({ ...base, injury: "Questionable" })).toBeLessThan(s);
    expect(confidenceScore({ ...base, factors: [up, down] })).toBeLessThan(s);
  });
});
