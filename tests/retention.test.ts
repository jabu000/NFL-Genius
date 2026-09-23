import { describe, expect, it } from "vitest";
import { getDb, pruneOld } from "@/lib/db";
import { addDays, retentionCutoff } from "@/lib/dates";

describe("10-day retention", () => {
  it("keeps today plus the previous 9 days", () => {
    expect(retentionCutoff("2026-09-23", 10)).toBe("2026-09-14");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("prunes write-ups, projections and bets older than the window", () => {
    const db = getDb(":memory:");
    const ins = db.prepare("INSERT INTO writeups (player_id, date, body, key_factors, source) VALUES ('p', ?, 'x', '[]', 'template')");
    for (let i = 0; i < 14; i++) ins.run(addDays("2026-09-23", -i));
    db.prepare(
      "INSERT INTO projections (player_id, date, stat, mean, stdev, confidence) VALUES ('p', '2026-09-01', 'rec_yds', 1, 1, 50)",
    ).run();
    const removed = pruneOld(db, "2026-09-23", 10);
    expect(removed).toBe(5);
    const dates = (db.prepare("SELECT date FROM writeups ORDER BY date").all() as { date: string }[]).map((r) => r.date);
    expect(dates).toHaveLength(10);
    expect(dates[0]).toBe("2026-09-14");
  });
});
