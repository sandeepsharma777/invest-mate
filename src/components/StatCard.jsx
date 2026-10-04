/**
 * Reusable stat card for dashboard top-line metrics.
 * Matches .ledger-card.stat-card markup from dashboard.js renderStatCards().
 */
export default function StatCard({ label, value, sub, delta, deltaPositive, badge }) {
  return (
    <div className="ledger-card stat-card">
      <span className="stat-card__label">{label}</span>
      <span
        className="stat-card__value num"
        style={{ whiteSpace: "nowrap", fontSize: "clamp(1.25rem, 2vw, 1.75rem)" }}
      >
        {value}
      </span>
      {badge ? (
        badge
      ) : delta != null ? (
        <span className={`stat-card__delta ${deltaPositive ? "is-positive" : "is-negative"}`}>
          {deltaPositive ? "▲" : "▼"} {delta}
        </span>
      ) : null}
      {sub && <span className="stat-card__sub">{sub}</span>}
    </div>
  );
}
