/** Local calendar date as YYYY-MM-DD. */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return isoDate(new Date(y, m - 1, d + days));
}

/** Oldest date still inside a retention window that includes `today`. */
export function retentionCutoff(today: string, retentionDays: number): string {
  return addDays(today, -(retentionDays - 1));
}

/** NFL season a date belongs to (January/February games belong to the previous season). */
export function seasonFor(d: Date = new Date()): number {
  return d.getMonth() < 2 ? d.getFullYear() - 1 : d.getFullYear();
}
