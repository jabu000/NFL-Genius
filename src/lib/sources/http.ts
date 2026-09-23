import fs from "node:fs";
import path from "node:path";

const CACHE_DIR = path.join(process.cwd(), "data", "cache");

/** GET with a timeout and a couple of retries. */
export async function fetchWithRetry(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (res.status >= 500 && attempt < retries) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
  throw lastErr;
}

export async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetchWithRetry(url, { headers: { "User-Agent": "nfl-genius/0.1" } });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Fetch text, caching it on disk for `maxAgeHours` (for large, slow-changing files). */
export async function fetchTextCached(url: string, cacheName: string, maxAgeHours: number): Promise<string> {
  const file = path.join(CACHE_DIR, cacheName);
  try {
    const age = (Date.now() - fs.statSync(file).mtimeMs) / 3_600_000;
    if (age < maxAgeHours) return fs.readFileSync(file, "utf8");
  } catch {
    // not cached yet
  }
  const res = await fetchWithRetry(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  const text = await res.text();
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(file, text);
  return text;
}

/** Minimal RFC-4180 CSV parser returning one object per row keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') inQuotes = false;
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
