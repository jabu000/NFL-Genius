import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { retentionCutoff } from "../dates";

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "src/lib/db/schema.sql"), "utf8");

let db: Database.Database | null = null;

export function dbPath(): string {
  return process.env.NFL_GENIUS_DB ?? path.join(process.cwd(), "data", "nfl-genius.db");
}

export function getDb(file = dbPath()): Database.Database {
  if (db && db.name === file) return db;
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

/** Fold the write-ahead log into the main file and close, so the .db file alone is complete (e.g. to copy it). */
export function closeDb(): void {
  if (!db) return;
  db.pragma("wal_checkpoint(TRUNCATE)");
  db.close();
  db = null;
}

/** Delete dated research older than the retention window (today counts as day 1). */
export function pruneOld(database: Database.Database, today: string, retentionDays: number): number {
  const cutoff = retentionCutoff(today, retentionDays);
  let removed = 0;
  for (const table of ["writeups", "projections", "bets"]) {
    removed += database.prepare(`DELETE FROM ${table} WHERE date < ?`).run(cutoff).changes;
  }
  return removed;
}

export function setMeta(database: Database.Database, key: string, value: string) {
  database.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}
