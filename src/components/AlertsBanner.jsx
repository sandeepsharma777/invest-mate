import { formatCurrency } from "../lib/utils";
import "../styles/alerts.css";

export default function AlertsBanner({
  triggeredAlerts = [],
  currency = "INR",
  onDismiss,
  onDismissAll,
  onOpenManage,
}) {
  if (!triggeredAlerts || triggeredAlerts.length === 0) return null;

  return (
    <div className="alerts-banner-container">
      {triggeredAlerts.map((alert) => (
        <div
          key={alert.id}
          className={`alert-strip ${alert.condition === "below" ? "alert-strip--below" : ""}`}
        >
          <div className="alert-strip__content">
            <div className="alert-strip__icon">
              {alert.condition === "above" ? "📈" : "📉"}
            </div>
            <div className="alert-strip__msg">
              <strong>Price Alert: </strong>
              <strong>{alert.holding_name}</strong>
              {alert.identifier ? ` (${alert.identifier})` : ""} has crossed{" "}
              <strong>{alert.condition === "above" ? "above" : "below"} {formatCurrency(alert.target_price, currency)}</strong>!
              {" "}Current price is <span className="num" style={{ fontWeight: 700 }}>{formatCurrency(alert.current_price, currency)}</span>.
              {alert.notes && <span style={{ opacity: 0.85, marginLeft: 6 }}>({alert.notes})</span>}
            </div>
          </div>

          <div className="alert-strip__actions">
            <button
              type="button"
              className="btn btn--sm btn--ghost-paper"
              onClick={() => onDismiss(alert.id)}
            >
              Dismiss
            </button>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              onClick={() => onOpenManage(alert.investment_id)}
            >
              Manage
            </button>
          </div>
        </div>
      ))}

      {triggeredAlerts.length > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn--sm btn--ghost-paper"
            style={{ fontSize: "var(--fs-2xs)" }}
            onClick={onDismissAll}
          >
            Dismiss all alerts ({triggeredAlerts.length})
          </button>
        </div>
      )}
    </div>
  );
}
