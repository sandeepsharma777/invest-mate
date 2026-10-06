import { useState, useEffect } from "react";
import { alerts, investments } from "../lib/db";
import { formatCurrency, getCurrencySymbol, handleFormEnterKeyNavigation } from "../lib/utils";
import { useToast } from "../context/ToastContext";
import "../styles/alerts.css";

const DEL_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

export default function AlertsModal({
  isOpen,
  onClose,
  presetHoldingId = null,
  currency = "INR",
  onAlertsChanged,
}) {
  const toast = useToast();
  const currencySymbol = getCurrencySymbol(currency);

  const [activeTab, setActiveTab] = useState(presetHoldingId ? "create" : "list");
  const [alertList, setAlertList] = useState([]);
  const [holdingOptions, setHoldingOptions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [form, setForm] = useState({
    investment_id: presetHoldingId || "",
    target_price: "",
    condition: "above",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Load holdings and alerts
  useEffect(() => {
    if (!isOpen) return;

    async function loadData() {
      setLoading(true);
      try {
        const [aList, hList] = await Promise.all([
          alerts.list(),
          investments.list({ status: "active" }),
        ]);
        setAlertList(aList);
        setHoldingOptions(hList);

        if (presetHoldingId) {
          const matched = hList.find((h) => h.id === presetHoldingId);
          setForm({
            investment_id: presetHoldingId,
            target_price: matched?.current_price ? String(Math.round(matched.current_price * 1.05)) : "",
            condition: "above",
            notes: "",
          });
          setActiveTab("create");
        } else if (hList.length > 0 && !form.investment_id) {
          setForm((prev) => ({
            ...prev,
            investment_id: hList[0].id,
            target_price: hList[0].current_price ? String(Math.round(hList[0].current_price * 1.05)) : "",
          }));
        }
      } catch (err) {
        toast(err.message || "Failed to load alerts", "error");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [isOpen, presetHoldingId, toast]);

  if (!isOpen) return null;

  async function handleCreateAlert(e) {
    e.preventDefault();
    if (!form.investment_id) {
      toast("Please select a holding", "error");
      return;
    }
    const price = Number(form.target_price);
    if (!price || price <= 0) {
      toast("Target price must be greater than zero", "error");
      return;
    }

    setSaving(true);
    try {
      await alerts.create(form);
      toast("Price alert set successfully", "success");
      const updated = await alerts.list();
      setAlertList(updated);
      setActiveTab("list");
      if (onAlertsChanged) onAlertsChanged();
    } catch (err) {
      toast(err.message || "Error setting alert", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDismiss(id) {
    try {
      await alerts.dismiss(id);
      const updated = await alerts.list();
      setAlertList(updated);
      toast("Alert notification dismissed", "info");
      if (onAlertsChanged) onAlertsChanged();
    } catch (err) {
      toast(err.message || "Error dismissing alert", "error");
    }
  }

  async function handleDelete(id) {
    try {
      await alerts.delete(id);
      const updated = await alerts.list();
      setAlertList(updated);
      toast("Alert removed", "success");
      if (onAlertsChanged) onAlertsChanged();
    } catch (err) {
      toast(err.message || "Error deleting alert", "error");
    }
  }

  const selectedHolding = holdingOptions.find((h) => h.id === form.investment_id);

  return (
    <div
      className="modal-overlay is-open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal__head">
          <div>
            <h3 className="modal__title">Price Alerts</h3>
            <p className="modal__sub">Get notified when a holding crosses your threshold price.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Tab switch */}
        <div style={{ display: "flex", gap: "var(--sp-2)", padding: "0 var(--sp-5)", borderBottom: "1px solid var(--paper-line)" }}>
          <button
            type="button"
            className={`btn btn--sm ${activeTab === "list" ? "btn--primary" : "btn--ghost-paper"}`}
            style={{ borderRadius: "var(--radius-sm) var(--radius-sm) 0 0" }}
            onClick={() => setActiveTab("list")}
          >
            My alerts ({alertList.length})
          </button>
          <button
            type="button"
            className={`btn btn--sm ${activeTab === "create" ? "btn--primary" : "btn--ghost-paper"}`}
            style={{ borderRadius: "var(--radius-sm) var(--radius-sm) 0 0" }}
            onClick={() => setActiveTab("create")}
          >
            + Set new alert
          </button>
        </div>

        <div className="modal__body">
          {activeTab === "create" ? (
            <form onSubmit={handleCreateAlert} onKeyDown={handleFormEnterKeyNavigation}>
              <div className="field">
                <label className="field__label" htmlFor="alert-holding">Holding</label>
                <select
                  className="input"
                  id="alert-holding"
                  value={form.investment_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const matched = holdingOptions.find((h) => h.id === id);
                    setForm((prev) => ({
                      ...prev,
                      investment_id: id,
                      target_price: matched?.current_price ? String(Math.round(matched.current_price * 1.05)) : prev.target_price,
                    }));
                  }}
                  required
                >
                  {holdingOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name} {h.identifier ? `(${h.identifier})` : ""} — Current: {formatCurrency(h.current_price, currency)}
                    </option>
                  ))}
                </select>
              </div>

              {selectedHolding && (
                <div style={{ fontSize: "var(--fs-xs)", color: "var(--paper-ink-soft)", marginBottom: "var(--sp-3)" }}>
                  Current price: <strong style={{ color: "var(--paper-ink)" }}>{formatCurrency(selectedHolding.current_price, currency)}</strong>
                </div>
              )}

              <div className="field-row">
                <div className="field">
                  <label className="field__label" htmlFor="alert-condition">Trigger condition</label>
                  <select
                    className="input"
                    id="alert-condition"
                    value={form.condition}
                    onChange={(e) => setForm((prev) => ({ ...prev, condition: e.target.value }))}
                  >
                    <option value="above">Rises above (≥ target)</option>
                    <option value="below">Drops below (≤ target)</option>
                  </select>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="alert-target">Threshold price</label>
                  <div className="input-affix">
                    <span className="input-affix__prefix">{currencySymbol}</span>
                    <input
                      className="input input--mono"
                      id="alert-target"
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder="1700"
                      value={form.target_price}
                      onChange={(e) => setForm((prev) => ({ ...prev, target_price: e.target.value }))}
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="alert-notes">Note / Strategy memo (optional)</label>
                <input
                  className="input"
                  id="alert-notes"
                  type="text"
                  placeholder="e.g. Consider booking profit, review stop-loss"
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--sp-2)", marginTop: "var(--sp-4)" }}>
                <button
                  type="button"
                  className="btn btn--ghost-paper"
                  onClick={() => setActiveTab("list")}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? "Setting alert…" : "Set alert"}
                </button>
              </div>
            </form>
          ) : (
            <div>
              {loading ? (
                <div style={{ padding: "var(--sp-4) 0" }}>Loading alerts…</div>
              ) : alertList.length === 0 ? (
                <div style={{ textAlign: "center", padding: "var(--sp-6) var(--sp-4)" }}>
                  <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-sm)", margin: "0 0 var(--sp-4)" }}>
                    No price alerts configured yet.
                  </p>
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => setActiveTab("create")}
                  >
                    + Set your first alert
                  </button>
                </div>
              ) : (
                <div className="alerts-list">
                  {alertList.map((a) => {
                    const isTriggered = a.is_triggered;
                    return (
                      <div
                        key={a.id}
                        className={`alert-card-row ${isTriggered && !a.dismissed ? "is-triggered" : ""}`}
                      >
                        <div className="alert-card-row__main">
                          <div className="alert-card-row__title">
                            <span>{a.holding_name}</span>
                            {a.identifier && (
                              <span style={{ fontSize: "var(--fs-2xs)", color: "var(--paper-ink-soft)", fontWeight: 400 }}>
                                ({a.identifier})
                              </span>
                            )}
                            {isTriggered && !a.dismissed ? (
                              <span className="status-pill status-pill--triggered">Triggered 🚨</span>
                            ) : isTriggered && a.dismissed ? (
                              <span className="status-pill status-pill--dismissed">Triggered (Dismissed)</span>
                            ) : (
                              <span className="status-pill status-pill--active">Active</span>
                            )}
                          </div>

                          <div className="alert-card-row__meta">
                            <span>
                              Alert: {a.condition === "above" ? "≥" : "≤"}{" "}
                              <strong className="num">{formatCurrency(a.target_price, currency)}</strong>
                            </span>
                            <span>
                              Current: <strong className="num">{formatCurrency(a.current_price, currency)}</strong>
                            </span>
                            {a.notes && <span>Memo: {a.notes}</span>}
                          </div>
                        </div>

                        <div className="row-actions">
                          {isTriggered && !a.dismissed && (
                            <button
                              type="button"
                              className="btn btn--sm btn--ghost-paper"
                              onClick={() => handleDismiss(a.id)}
                            >
                              Dismiss
                            </button>
                          )}
                          <button
                            type="button"
                            className="icon-btn icon-btn--sm"
                            title="Delete alert"
                            onClick={() => handleDelete(a.id)}
                          >
                            {DEL_SVG}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal__foot">
          <button type="button" className="btn btn--ghost-paper" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
