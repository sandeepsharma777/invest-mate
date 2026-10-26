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
            <div className="alert-strip__icon" aria-hidden="true">
              {alert.condition === "above" ? "📈" : "📉"}
            </div>
            <div className="alert-strip__msg">
              <span className="alert-strip__title">
                Price Alert: {alert.holding_name}
              </span>
              {alert.identifier ? <span className="alert-strip__id"> ({alert.identifier})</span> : null}
              {" "}has crossed{" "}
              <span className="alert-strip__condition">
                {alert.condition === "above" ? "above" : "below"}{" "}
                <span className="alert-strip__highlight">
                  {formatCurrency(alert.target_price, currency)}
                </span>
              </span>
              ! Current price is{" "}
              <span className="alert-strip__current-price num">
                {formatCurrency(alert.current_price, currency)}
              </span>.
              {alert.notes && <span className="alert-strip__notes"> ({alert.notes})</span>}
            </div>
          </div>

          <div className="alert-strip__actions">
            <button
              type="button"
              className="alert-strip__btn-dismiss"
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
            className="alert-strip__btn-dismiss"
            style={{ fontSize: "var(--fs-2xs, 12px)" }}
            onClick={onDismissAll}
          >
            Dismiss all alerts ({triggeredAlerts.length})
          </button>
        </div>
      )}
    </div>
  );
}
