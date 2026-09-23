export function confidenceTone(c: number): string {
  return c >= 70 ? "bg-good/15 text-good" : c >= 50 ? "bg-warn/15 text-warn" : "bg-bad/15 text-bad";
}

export function ConfidenceBadge({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span
      title="Model confidence (0–100)"
      className={`tabular inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${confidenceTone(value)} ${className}`}
    >
      {value}
    </span>
  );
}
