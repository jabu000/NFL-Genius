import { describe, expect, it } from "vitest";
import { selectStarters, type Candidate } from "@/lib/model/depth";

const c = (name: string, position: Candidate["position"], rank: number, usage: number, injury: Candidate["injury"] = "Healthy"): Candidate => ({
  name,
  team: "KC",
  position,
  rank,
  usage,
  injury,
});

describe("selectStarters", () => {
  it("fills QB1, RB1-2, WR1-3 and TE1", () => {
    const slots = selectStarters([
      c("Q1", "QB", 0, 35),
      c("Q2", "QB", 1, 2),
      c("R1", "RB", 0, 18),
      c("R2", "RB", 1, 8),
      c("R3", "RB", 2, 1),
      c("W1", "WR", 0, 9),
      c("W2", "WR", 0, 7),
      c("W3", "WR", 0, 5),
      c("W4", "WR", 1, 1),
      c("T1", "TE", 0, 6),
    ]).map((s) => `${s.slot}:${s.entry.name}`);
    expect(slots).toEqual(["QB1:Q1", "RB1:R1", "RB2:R2", "WR1:W1", "WR2:W2", "WR3:W3", "TE1:T1"]);
  });

  it("orders receivers by usage, not just depth listing", () => {
    const slots = selectStarters([c("A", "WR", 0, 4), c("B", "WR", 0, 10), c("C", "WR", 0, 6)]);
    expect(slots.map((s) => s.entry.name)).toEqual(["B", "C", "A"]);
  });

  it("skips players ruled out and follows the depth chart at QB", () => {
    const slots = selectStarters([c("Starter", "QB", 0, 35, "Out"), c("Backup", "QB", 1, 3), c("Third", "QB", 2, 0)]);
    expect(slots).toHaveLength(1);
    expect(slots[0].entry.name).toBe("Backup");
  });
});
