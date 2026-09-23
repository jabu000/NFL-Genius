/**
 * Fill the database with 10 days of demo research so the site can be built
 * and browsed without any API keys. Replaces existing data.
 *
 *   npm run seed:mock
 */
import fs from "node:fs";
import { dbPath, getDb } from "../src/lib/db";
import { addDays, isoDate, seasonFor } from "../src/lib/dates";
import { templateProvider } from "../src/lib/llm/template";
import { runResearch } from "../src/lib/pipeline";
import { generateMockInputs } from "../src/lib/sources/mock";
import { RETENTION_DAYS } from "../src/lib/config";

async function main() {
  const file = dbPath();
  for (const f of [file, `${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
  const db = getDb(file);
  const today = isoDate();
  const season = seasonFor();
  for (let i = RETENTION_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const res = await runResearch(db, generateMockInputs(date, season), date, { provider: templateProvider, source: "mock" });
    console.log(`${date}: ${res.players} players, ${res.bets} props`);
  }
  console.log(`Mock data written to ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
