import { ConfidenceTable } from "@/components/ConfidenceTable";
import { VALUE_EDGE, VALUE_MIN_CONFIDENCE } from "@/lib/config";
import { listBoard } from "@/lib/db/queries";
import { pct } from "@/lib/format";

export default function ConfidencePage() {
  const { date, rows } = listBoard();
  return (
    <div>
      <h1 className="text-2xl font-bold">Confidence Board</h1>
      <p className="mb-5 mt-1 text-sm text-muted">
        Every projection ranked by how much the model trusts it, next to the DraftKings line. Rows marked{" "}
        <span className="font-semibold text-value">VALUE</span> have at least {pct(VALUE_EDGE)} edge over the no-vig price and
        confidence of {VALUE_MIN_CONFIDENCE} or higher.{date && ` Research date: ${date}.`}
      </p>
      {rows.length ? (
        <ConfidenceTable rows={rows} valueEdge={VALUE_EDGE} minConfidence={VALUE_MIN_CONFIDENCE} />
      ) : (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted">No research yet.</div>
      )}
    </div>
  );
}
