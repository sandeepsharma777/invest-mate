import { useState, useEffect } from "react";
import { analytics } from "../lib/db";
import { formatCurrency } from "../lib/utils";
import { useToast } from "../context/ToastContext";
import { PALETTE } from "../lib/chartConfig";
import "../styles/rebalancing.css";

const SETTINGS_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
  </svg>
);

export default function RebalancingSection({ currency = "INR", onPlanUpdated }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formAllocations, setFormAllocations] = useState({});
  const [saving, setSaving] = useState(false);

  const fetchPlan = async () => {
    try {
      const plan = await analytics.getRebalancingPlan();
      setData(plan);
    } catch (err) {
      toast(err.message || "Failed to load rebalancing plan", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlan();
  }, []);

  function openEditModal() {
    if (!data) return;
    setFormAllocations({ ...data.target_allocation });
    setModalOpen(true);
  }

  function handleSliderChange(type, val) {
    setFormAllocations((prev) => ({
      ...prev,
      [type]: Math.max(0, Math.min(100, Number(val) || 0)),
    }));
  }

  // Presets
  function applyPreset(presetType) {
    if (!data) return;
    const types = data.items.map((i) => i.asset_type);

    if (presetType === "growth") {
      const preset = {};
      types.forEach((t) => {
        if (t === "stocks") preset[t] = 50;
        else if (t === "mutual_fund") preset[t] = 25;
        else if (t === "gold") preset[t] = 15;
        else if (t === "fixed_deposit") preset[t] = 10;
        else preset[t] = 0;
      });
      // normalize
      normalizeAllocations(preset, types);
      setFormAllocations(preset);
    } else if (presetType === "balanced") {
      const preset = {};
      types.forEach((t) => {
        if (t === "stocks") preset[t] = 35;
        else if (t === "mutual_fund") preset[t] = 25;
        else if (t === "fixed_deposit") preset[t] = 25;
        else if (t === "gold") preset[t] = 15;
        else preset[t] = 0;
      });
      normalizeAllocations(preset, types);
      setFormAllocations(preset);
    } else if (presetType === "current") {
      // Match current allocation
      const preset = {};
      data.items.forEach((it) => {
        preset[it.asset_type] = Math.round(it.current_percent);
      });
      normalizeAllocations(preset, types);
      setFormAllocations(preset);
    } else if (presetType === "equal") {
      const preset = {};
      const share = Math.floor(100 / types.length);
      types.forEach((t, i) => {
        preset[t] = i === 0 ? 100 - share * (types.length - 1) : share;
      });
      setFormAllocations(preset);
    }
  }

  function normalizeAllocations(map, types) {
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    if (sum !== 100 && types.length > 0) {
      const diff = 100 - sum;
      map[types[0]] = Math.max(0, map[types[0]] + diff);
    }
  }

  async function handleSaveTarget(e) {
    e.preventDefault();
    const sum = Object.values(formAllocations).reduce((a, b) => a + Number(b || 0), 0);
    if (Math.abs(sum - 100) > 0.5) {
      toast(`Total allocation must equal 100% (currently ${sum.toFixed(1)}%)`, "error");
      return;
    }

    setSaving(true);
    try {
      await analytics.saveTargetAllocation(formAllocations);
      toast("Target asset allocation saved", "success");
      setModalOpen(false);
      await fetchPlan();
      if (onPlanUpdated) onPlanUpdated();
    } catch (err) {
      toast(err.message || "Failed to save target allocation", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="panel" style={{ padding: "var(--sp-6)" }}>Loading rebalancing analysis…</div>;
  }

  if (!data || data.items.length === 0) return null;

  const currentTotalAlloc = Object.values(formAllocations).reduce((a, b) => a + Number(b || 0), 0);
  const isAllocValid = Math.abs(currentTotalAlloc - 100) <= 0.5;

  return (
    <div className="panel rebalance-section">
      <div className="rebalance-header">
        <div>
          <h2 className="panel__title">Portfolio Health &amp; Rebalancing</h2>
          <p className="panel__sub">
            Benchmark current asset distribution against your target allocation to identify drift.
          </p>
        </div>
        <button type="button" className="btn btn--sm btn--primary" onClick={openEditModal}>
          {SETTINGS_SVG}
          <span>Set target allocation</span>
        </button>
      </div>

      <div className="rebalance-summary-grid">
        {/* Health Score Card */}
        <div className="health-score-card">
          <div className="health-score-dial">
            <svg viewBox="0 0 100 100" width="100%" height="100%">
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="var(--paper-line)"
                strokeWidth="8"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={
                  data.health_score >= 85
                    ? "var(--jade-500)"
                    : data.health_score >= 70
                    ? "var(--gold-500)"
                    : "var(--oxblood-500)"
                }
                strokeWidth="8"
                strokeDasharray={`${(data.health_score / 100) * 251.2} 251.2`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-dasharray 0.8s ease-out" }}
              />
            </svg>
            <div style={{ position: "absolute", textAlign: "center" }}>
              <div className="health-score-number">{data.health_score}</div>
              <div className="health-score-total">/ 100</div>
            </div>
          </div>

          <div
            className={`health-status-badge ${
              data.health_score >= 85
                ? "health-status-badge--optimal"
                : data.health_score >= 70
                ? "health-status-badge--moderate"
                : "health-status-badge--high"
            }`}
          >
            {data.health_status}
          </div>

          <p className="health-score-desc">
            {data.total_drift <= 5
              ? "Your portfolio is well aligned with your defined investment strategy."
              : `Overall allocation drift is ±${data.total_drift.toFixed(1)}%. Consider rebalancing to realign with target weights.`}
          </p>
        </div>

        {/* Actionable Suggestions */}
        <div className="suggestions-card">
          <h3 style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--paper-ink)" }}>
            Actionable Rebalancing Steps
          </h3>
          <p style={{ margin: "2px 0 0", fontSize: "var(--fs-xs)", color: "var(--paper-ink-soft)" }}>
            Transactions required to match target allocations based on portfolio value of {formatCurrency(data.total_portfolio_value, currency)}.
          </p>

          {data.suggestions.length === 0 ? (
            <div style={{ padding: "var(--sp-4) 0", color: "var(--jade-600)", fontWeight: 600, fontSize: "var(--fs-sm)" }}>
              ✓ All asset classes are within balance tolerance (&lt;1% drift). No trades required today!
            </div>
          ) : (
            <div className="suggestions-list">
              {data.suggestions.map((s, idx) => (
                <div
                  key={idx}
                  className={`suggestion-item ${s.type === "buy" ? "suggestion-item--buy" : "suggestion-item--trim"}`}
                >
                  <div className="suggestion-item__icon">
                    {s.type === "buy" ? "+" : "−"}
                  </div>
                  <div className="suggestion-item__content">
                    <span className="suggestion-item__title">
                      {s.type === "buy" ? "Deploy capital into" : "Trim exposure in"} {s.label}
                    </span>
                    <span className="suggestion-item__sub">
                      Current: {s.current_percent.toFixed(1)}% → Target: {s.target_percent.toFixed(1)}%
                    </span>
                  </div>
                  <span className="suggestion-item__amount num">
                    {s.type === "buy" ? "Buy" : "Trim"} {formatCurrency(s.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Visual Diff: Current vs. Target Comparison */}
      <div>
        <h3 style={{ margin: "var(--sp-3) 0 4px", fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--paper-ink)" }}>
          Allocation Visual Diff
        </h3>
        <p style={{ margin: "0 0 var(--sp-3)", fontSize: "var(--fs-xs)", color: "var(--paper-ink-soft)" }}>
          Compare current holding share vs target weight. The dark vertical tick represents your target allocation.
        </p>

        <div className="diff-bars-container">
          {data.items.map((item) => {
            const color = PALETTE[item.asset_type] || "var(--gold-500)";
            const isOverweight = item.status === "overweight";
            const isUnderweight = item.status === "underweight";

            return (
              <div key={item.asset_type} className="diff-row">
                <div className="diff-row__head">
                  <div className="diff-row__label">
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        backgroundColor: color,
                        display: "inline-block",
                      }}
                    />
                    <span>{item.label}</span>
                  </div>

                  <div className="diff-row__figures">
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--paper-ink-soft)" }}>
                      Current: <strong className="num" style={{ color: "var(--paper-ink)" }}>{item.current_percent.toFixed(1)}%</strong> ({formatCurrency(item.current_value, currency)})
                    </span>
                    <span style={{ fontSize: "var(--fs-xs)", color: "var(--paper-ink-soft)" }}>
                      Target: <strong className="num" style={{ color: "var(--paper-ink)" }}>{item.target_percent.toFixed(1)}%</strong>
                    </span>

                    <span
                      className={`diff-pill ${
                        isOverweight
                          ? "diff-pill--overweight"
                          : isUnderweight
                          ? "diff-pill--underweight"
                          : "diff-pill--balanced"
                      }`}
                    >
                      {isOverweight ? `+${item.diff_percent.toFixed(1)}% Over` : isUnderweight ? `${item.diff_percent.toFixed(1)}% Under` : "Balanced ✓"}
                    </span>
                  </div>
                </div>

                {/* Progress bar with target tick */}
                <div className="diff-bars-track">
                  {/* Current filled bar */}
                  <div
                    className="diff-bar-current"
                    style={{
                      width: `${Math.min(100, Math.max(0, item.current_percent))}%`,
                      backgroundColor: color,
                    }}
                  />
                  {/* Target marker pin */}
                  <div
                    className="diff-marker-target"
                    style={{ left: `${Math.min(100, Math.max(0, item.target_percent))}%` }}
                    title={`Target: ${item.target_percent}%`}
                  />
                </div>

                <div className="diff-bars-labels">
                  <span>0%</span>
                  <span>
                    Action:{" "}
                    <strong>
                      {item.action === "buy"
                        ? `Buy ${formatCurrency(item.suggested_amount, currency)}`
                        : item.action === "trim"
                        ? `Trim ${formatCurrency(item.suggested_amount, currency)}`
                        : "Optimal weight"}
                    </strong>
                  </span>
                  <span>100%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Target Allocation Config Modal */}
      {modalOpen && (
        <div
          className="modal-overlay is-open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="modal" style={{ maxWidth: 540 }}>
            <div className="modal__head">
              <div>
                <h3 className="modal__title">Target Asset Allocation</h3>
                <p className="modal__sub">Define your ideal portfolio distribution. The total must equal 100%.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setModalOpen(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            {/* Quick Presets */}
            <div style={{ padding: "0 var(--sp-5) var(--sp-3)", display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", borderBottom: "1px dashed var(--paper-line)" }}>
              <span style={{ fontSize: "var(--fs-2xs)", textTransform: "uppercase", color: "var(--paper-ink-soft)", fontWeight: 700, alignSelf: "center", marginRight: 4 }}>
                Presets:
              </span>
              <button type="button" className="btn btn--sm btn--ghost-paper" onClick={() => applyPreset("growth")}>
                Growth (50/25/15/10)
              </button>
              <button type="button" className="btn btn--sm btn--ghost-paper" onClick={() => applyPreset("balanced")}>
                Balanced (35/25/25/15)
              </button>
              <button type="button" className="btn btn--sm btn--ghost-paper" onClick={() => applyPreset("equal")}>
                Equal Split
              </button>
              <button type="button" className="btn btn--sm btn--ghost-paper" onClick={() => applyPreset("current")}>
                Match Current
              </button>
            </div>

            <form onSubmit={handleSaveTarget}>
              <div className="modal__body">
                {data.items.map((it) => {
                  const val = formAllocations[it.asset_type] ?? 0;
                  const color = PALETTE[it.asset_type] || "var(--gold-500)";

                  return (
                    <div key={it.asset_type} className="target-input-row">
                      <div className="target-input-label">
                        <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: color }} />
                        <span>{it.label}</span>
                      </div>

                      <input
                        type="range"
                        className="target-input-slider"
                        min="0"
                        max="100"
                        step="1"
                        value={val}
                        onChange={(e) => handleSliderChange(it.asset_type, e.target.value)}
                      />

                      <div className="input-affix target-input-number">
                        <input
                          type="number"
                          className="input input--mono"
                          min="0"
                          max="100"
                          step="1"
                          style={{ textAlign: "right", paddingRight: 22 }}
                          value={val}
                          onChange={(e) => handleSliderChange(it.asset_type, e.target.value)}
                        />
                        <span className="input-affix__suffix" style={{ right: 8 }}>%</span>
                      </div>
                    </div>
                  );
                })}

                {/* Total Counter Bar */}
                <div className={`target-total-bar ${isAllocValid ? "is-valid" : "is-invalid"}`}>
                  <span>Total Allocation:</span>
                  <span className="num">
                    {currentTotalAlloc.toFixed(1)}% {isAllocValid ? "✓ Balanced" : `(${currentTotalAlloc > 100 ? `+${(currentTotalAlloc - 100).toFixed(1)}% excess` : `${(100 - currentTotalAlloc).toFixed(1)}% remaining`})`}
                  </span>
                </div>
              </div>

              <div className="modal__foot">
                <button type="button" className="btn btn--ghost-paper" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving || !isAllocValid}>
                  {saving ? "Saving…" : "Save target allocation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
