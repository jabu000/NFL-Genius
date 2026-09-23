import type { Metadata } from "next";
import Link from "next/link";
import { getMeta } from "@/lib/db/queries";
import "./globals.css";

export const metadata: Metadata = {
  title: "NFL Genius",
  description: "Daily NFL player projections, write-ups and DraftKings prop value.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMeta();
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-tight">
              NFL <span className="text-accent">Genius</span>
            </Link>
            <nav className="flex gap-4 text-sm font-medium">
              <Link href="/" className="hover:text-accent">
                Players
              </Link>
              <Link href="/confidence" className="hover:text-accent">
                Confidence Board
              </Link>
            </nav>
            <div className="ml-auto flex items-center gap-2 text-xs text-muted">
              {meta.source === "mock" && (
                <span className="rounded bg-warn/15 px-2 py-0.5 font-semibold text-warn">Demo data</span>
              )}
              {meta.lastUpdated ? `Updated ${new Date(meta.lastUpdated).toLocaleString()}` : "No research yet: run npm run research"}
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">
          Projections are model estimates for research and entertainment, not guarantees. Lines from DraftKings via The Odds API
          and may be stale. Bet responsibly (21+, 1-800-GAMBLER).
        </footer>
      </body>
    </html>
  );
}
