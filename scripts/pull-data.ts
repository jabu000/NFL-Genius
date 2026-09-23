/**
 * Download the database produced by the daily GitHub Action (stored on the
 * `data` branch) into data/nfl-genius.db. Stop `npm run dev` first.
 *
 *   npm run pull-data
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dbPath } from "../src/lib/db";

const BRANCH = process.env.DATA_BRANCH ?? "data";

const file = dbPath();
execFileSync("git", ["fetch", "--depth=1", "origin", BRANCH], { stdio: "inherit" });
const db = execFileSync("git", ["show", `origin/${BRANCH}:nfl-genius.db`], { maxBuffer: 1024 * 1024 * 1024 });
fs.mkdirSync(path.dirname(file), { recursive: true });
// A leftover write-ahead log from the old database would be replayed onto the new one.
for (const f of [`${file}-wal`, `${file}-shm`]) fs.rmSync(f, { force: true });
fs.writeFileSync(file, db);
const updated = execFileSync("git", ["log", "-1", "--format=%cd", `origin/${BRANCH}`]).toString().trim();
console.log(`Pulled ${(db.length / 1024 / 1024).toFixed(1)} MB of research (published ${updated}) into ${file}`);
