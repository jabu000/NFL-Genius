import { describe, expect, it } from "vitest";
import { getDb } from "@/lib/db";
import { templateProvider } from "@/lib/llm/template";
import { runResearch } from "@/lib/pipeline";
import { generateMockInputs } from "@/lib/sources/mock";

describe("research pipeline (mock inputs)", () => {
  it("projects all 7 starter slots for every team and writes one paragraph each", async () => {
    const db = getDb(":memory:");
    const res = await runResearch(db, generateMockInputs("2026-10-01", 2026), "2026-10-01", { provider: templateProvider, source: "mock" });
    expect(res.players).toBe(32 * 7);
    const slots = db.prepare("SELECT slot, COUNT(*) AS n FROM players GROUP BY slot").all() as { slot: string; n: number }[];
    expect(Object.fromEntries(slots.map((s) => [s.slot, s.n]))).toEqual({ QB1: 32, RB1: 32, RB2: 32, WR1: 32, WR2: 32, WR3: 32, TE1: 32 });
    const writeups = db.prepare("SELECT COUNT(*) AS n FROM writeups WHERE date = '2026-10-01'").get() as { n: number };
    expect(writeups.n).toBe(224);
    expect(res.bets).toBeGreaterThan(0);
  });
});
