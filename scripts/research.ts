/**
 * Daily research run: pull rosters, stats, injuries and DraftKings lines, project
 * every starter, write the daily paragraphs and prune anything older than 10 days.
 *
 *   npm run research
 */
import "dotenv/config";
import { getDb } from "../src/lib/db";
import { isoDate, seasonFor } from "../src/lib/dates";
import { getProvider } from "../src/lib/llm";
import { runResearch } from "../src/lib/pipeline";
import { gatherLiveInputs } from "../src/lib/sources/live";

async function main() {
  const date = process.env.RESEARCH_DATE ?? isoDate();
  const season = Number(process.env.NFL_SEASON) || seasonFor();
  const db = getDb();
  const provider = getProvider();
  console.log(`NFL Genius research for ${date} (season ${season}), write-ups via ${provider.name}`);

  const inputs = await gatherLiveInputs(db, season);
  const prev = db.prepare("SELECT value FROM meta WHERE key = 'source'").get() as { value: string } | undefined;
  if (prev?.value === "mock") {
    console.log("• Clearing demo data before the first live run");
    for (const t of ["players", "games", "projections", "writeups", "bets", "prop_lines"]) db.exec(`DELETE FROM ${t}`);
  }
  console.log("• Projecting starters");
  const res = await runResearch(db, inputs, date, {
    provider,
    source: "live",
    llmDelayMs: Number(process.env.LLM_DELAY_MS ?? 6500),
    log: console.log,
  });
  console.log(`Done: ${res.players} players projected, ${res.bets} props compared.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
