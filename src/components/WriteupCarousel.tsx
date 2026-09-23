"use client";

import { useEffect, useRef, useState } from "react";
import type { WriteupRow } from "@/lib/db/queries";

function label(date: string, i: number): string {
  const d = new Date(`${date}T12:00:00`);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return i === 0 ? `Latest · ${day}` : day;
}

/** Daily write-ups, newest first. Arrow buttons, dots, keyboard arrows and swipe move between days. */
export function WriteupCarousel({ writeups }: { writeups: WriteupRow[] }) {
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const n = writeups.length;
  const older = () => setI((x) => Math.min(n - 1, x + 1));
  const newer = () => setI((x) => Math.max(0, x - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") setI((x) => Math.min(n - 1, x + 1));
      if (e.key === "ArrowRight") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n]);

  if (!n) return <p className="text-sm text-muted">No write-ups in the last 10 days.</p>;
  const w = writeups[i];

  return (
    <section
      aria-roledescription="carousel"
      className="rounded-xl border border-border bg-surface p-4"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current == null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        if (dx > 40) older();
        if (dx < -40) newer();
        touchX.current = null;
      }}
    >
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={older}
          disabled={i === n - 1}
          aria-label="Older write-up"
          className="rounded-lg border border-border px-2.5 py-1 text-sm disabled:opacity-30 hover:bg-surface-2"
        >
          ←
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold">{label(w.date, i)}</div>
          <div className="text-xs text-muted">
            Day {n - i} of {n} · {w.source === "template" ? "model summary" : `written by ${w.source}`}
          </div>
        </div>
        <button
          onClick={newer}
          disabled={i === 0}
          aria-label="Newer write-up"
          className="rounded-lg border border-border px-2.5 py-1 text-sm disabled:opacity-30 hover:bg-surface-2"
        >
          →
        </button>
      </div>

      <p className="min-h-24 leading-relaxed" aria-live="polite">
        {w.body}
      </p>

      {w.keyFactors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {w.keyFactors.map((f) => (
            <span key={f} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
              {f}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex justify-center gap-1.5">
        {writeups.map((x, j) => (
          <button
            key={x.date}
            onClick={() => setI(j)}
            aria-label={`Write-up from ${x.date}`}
            className={`h-2 rounded-full transition-all ${j === i ? "w-5 bg-accent" : "w-2 bg-border hover:bg-muted"}`}
          />
        ))}
      </div>
    </section>
  );
}
