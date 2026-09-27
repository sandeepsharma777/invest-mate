/**
 * Reusable stat card for dashboard top-line metrics.
 * Matches .ledger-card.stat-card markup from dashboard.js renderStatCards().
 */
export default function StatCard({ label, value, sub, delta, deltaPositive }) {
  return (
    <div className="ledger-card stat-card">
      <span className="stat-card__label">{label}</span>
      <span className="stat-card__value num">{value}</span>
      {delta != null && (
        <span className={`stat-card__delta ${deltaPositive ? "is-positive" : "is-negative"}`}>
          {deltaPositive ? "▲" : "▼"} {delta}
        </span>
      )}
      {sub && <span className="text-muted" style={{ fontSize: "var(--fs-2xs)" }}>{sub}</span>}
    </div>
  );
}
