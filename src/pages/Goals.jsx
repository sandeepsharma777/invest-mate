import { useState, useEffect, useCallback } from "react";
import DashboardLayout from "../components/DashboardLayout";
import StatCard from "../components/StatCard";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { goals } from "../lib/db";
import { formatCurrency, formatDate, getCurrencySymbol, todayISO } from "../lib/utils";
import "../styles/goals.css";

const EDIT_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const DEL_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
  </svg>
);

const PLUS_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export default function Goals() {
  const { user } = useAuth();
  const toast = useToast();
  const currency = user?.currency || "INR";
  const currencySymbol = getCurrencySymbol(currency);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({
    goals: [],
    primary_goal: null,
    total_portfolio_value: 0,
    goals_count: 0,
    achieved_count: 0,
  });

  // Modal states
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [form, setForm] = useState({
    name: "",
    target_amount: "",
    target_date: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const summary = await goals.getSummary();
      setData(summary);
    } catch (err) {
      toast(err.message || "Failed to load goals", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setModalOpen(false);
        setDeleteTarget(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function openCreateModal() {
    setEditingGoal(null);
    setForm({
      name: "",
      target_amount: "",
      target_date: "",
      notes: "",
    });
    setModalOpen(true);
  }

  function openEditModal(goal) {
    setEditingGoal(goal);
    setForm({
      name: goal.name,
      target_amount: goal.target_amount,
      target_date: goal.target_date || "",
      notes: goal.notes || "",
    });
    setModalOpen(true);
  }

  async function handleSaveGoal(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast("Please enter a goal name", "error");
      return;
    }
    const amt = Number(form.target_amount);
    if (!amt || amt <= 0) {
      toast("Target amount must be greater than zero", "error");
      return;
    }

    setSaving(true);
    try {
      if (editingGoal) {
        await goals.update(editingGoal.id, form);
        toast("Goal updated successfully", "success");
      } else {
        await goals.create(form);
        toast("Goal created successfully", "success");
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      toast(err.message || "Error saving goal", "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await goals.delete(deleteTarget.id);
      toast("Goal deleted", "success");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      toast(err.message || "Error deleting goal", "error");
    }
  }

  // Aggregate stats
  const totalTarget = data.goals.reduce((acc, g) => acc + Number(g.target_amount || 0), 0);
  const overallCoverage = totalTarget > 0 ? Math.min(100, (data.total_portfolio_value / totalTarget) * 100) : 0;

  return (
    <DashboardLayout>
      <div className="view-head">
        <div>
          <h1 className="view-head__title">Financial Goals</h1>
          <p className="view-head__sub">
            Track your milestones and projected timeline against your portfolio value.
          </p>
        </div>
        <button type="button" className="btn btn--primary" onClick={openCreateModal}>
          {PLUS_SVG}
          <span>Add goal</span>
        </button>
      </div>

      {/* Top Stat Cards */}
      <div className="card-grid" style={{ marginBottom: "var(--sp-5)" }}>
        <StatCard
          label="Portfolio Value"
          value={formatCurrency(data.total_portfolio_value, currency)}
          sub="Current active holdings"
        />
        <StatCard
          label="Total Goals Target"
          value={formatCurrency(totalTarget, currency)}
          sub={`${data.goals_count} defined milestone${data.goals_count === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Overall Progress"
          value={`${overallCoverage.toFixed(0)}%`}
          delta={overallCoverage >= 100 ? "Achieved" : undefined}
          deltaPositive={overallCoverage >= 100}
          sub={totalTarget > 0 ? `${formatCurrency(Math.max(0, totalTarget - data.total_portfolio_value), currency)} needed` : "No targets set"}
        />
        <StatCard
          label="Nearest Target"
          value={data.primary_goal ? `${data.primary_goal.percent_complete.toFixed(0)}%` : "—"}
          delta={data.primary_goal?.is_reached ? "Reached" : (data.primary_goal?.target_date ? formatDate(data.primary_goal.target_date) : undefined)}
          deltaPositive={data.primary_goal?.is_reached}
          sub={data.primary_goal ? data.primary_goal.name : "Create your first goal"}
        />
      </div>

      {/* Goals List / Empty State */}
      {loading ? (
        <div className="goals-grid">
          <div className="ledger-card goal-card"><div className="skel" style={{ height: 160 }} /></div>
          <div className="ledger-card goal-card"><div className="skel" style={{ height: 160 }} /></div>
        </div>
      ) : data.goals.length === 0 ? (
        <div className="panel empty-state">
          <div className="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            </svg>
          </div>
          <h3>No financial goals set yet</h3>
          <p>Define targets like retirement corpus, home down payment, or emergency fund to monitor your timeline.</p>
          <button type="button" className="btn btn--primary" onClick={openCreateModal} style={{ margin: "0 auto" }}>
            Create your first goal
          </button>
        </div>
      ) : (
        <div className="goals-grid">
          {data.goals.map((g) => {
            const isAchieved = g.is_reached;
            const pct = g.percent_complete;
            const proj = g.projection;

            return (
              <div key={g.id} className="ledger-card goal-card">
                <div className="goal-card__head">
                  <div className="goal-card__title-group">
                    <h3 className="goal-card__title">{g.name}</h3>
                    <div className="goal-card__date-badge">
                      {isAchieved ? (
                        <span className="text-positive">✓ Milestone Reached</span>
                      ) : g.target_date ? (
                        <span>Target: {formatDate(g.target_date)}</span>
                      ) : (
                        <span>Open Target Date</span>
                      )}
                    </div>
                  </div>
                  <div className="row-actions">
                    <button
                      type="button"
                      className="icon-btn"
                      title="Edit goal"
                      onClick={() => openEditModal(g)}
                    >
                      {EDIT_SVG}
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete goal"
                      onClick={() => setDeleteTarget(g)}
                    >
                      {DEL_SVG}
                    </button>
                  </div>
                </div>

                <div className="goal-card__figures">
                  <div className="goal-figure">
                    <span className="goal-figure__label">Current Portfolio</span>
                    <span className="goal-figure__val num">{formatCurrency(g.current_amount, currency)}</span>
                  </div>
                  <div className="goal-figure goal-figure--target">
                    <span className="goal-figure__label">Target Goal</span>
                    <span className="goal-figure__val num">{formatCurrency(g.target_amount, currency)}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="goal-progress">
                  <div className="goal-progress__labels">
                    <span className="goal-progress__pct num">{pct.toFixed(1)}% complete</span>
                    <span className="goal-progress__rem num">
                      {isAchieved ? "100% Achieved" : `${formatCurrency(g.remaining_amount, currency)} remaining`}
                    </span>
                  </div>
                  <div className="goal-progress-track">
                    <div
                      className={`goal-progress-fill${isAchieved ? " is-achieved" : ""}`}
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </div>

                {/* Trajectory projection */}
                {proj && (
                  <div
                    className={`goal-projection ${
                      isAchieved
                        ? "is-achieved"
                        : proj.status === "on_track"
                        ? "is-on-track"
                        : proj.status === "behind"
                        ? "is-behind"
                        : ""
                    }`}
                  >
                    <div className="goal-projection__icon">
                      {isAchieved ? "🎉" : proj.isOnTrack ? "📈" : "⏱️"}
                    </div>
                    <div className="goal-projection__text">
                      <strong>Trajectory:</strong> {proj.message}
                    </div>
                  </div>
                )}

                {g.notes && <p className="goal-card__notes">{g.notes}</p>}
              </div>
            );
          })}

          {/* Quick Add Card */}
          <div className="ledger-card goal-empty-card" onClick={openCreateModal}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="28" height="28">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v8M8 12h8" />
            </svg>
            <strong style={{ color: "var(--paper-ink)", fontSize: "var(--fs-md)" }}>Add another goal</strong>
            <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-xs)", margin: "4px 0 0" }}>
              Define targets for education, property, or retirement.
            </p>
          </div>
        </div>
      )}

      {/* ── Add / Edit Goal Modal ────────────────────────────────────────── */}
      {modalOpen && (
        <div
          className="modal-overlay is-open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="modal">
            <div className="modal__head">
              <div>
                <h3 className="modal__title">{editingGoal ? "Edit goal" : "Create financial goal"}</h3>
                <p className="modal__sub">Define your milestone target and desired target date.</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                onClick={() => setModalOpen(false)}
                aria-label="Close"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSaveGoal}>
              <div className="modal__body">
                <div className="field">
                  <label className="field__label" htmlFor="g-name">Goal name</label>
                  <input
                    className="input"
                    id="g-name"
                    type="text"
                    placeholder="e.g. Retirement Corpus, Home Down Payment"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    required
                  />
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field__label" htmlFor="g-target">Target amount</label>
                    <div className="input-affix">
                      <span className="input-affix__prefix">{currencySymbol}</span>
                      <input
                        className="input input--mono"
                        id="g-target"
                        type="number"
                        min="1"
                        step="any"
                        placeholder="1000000"
                        value={form.target_amount}
                        onChange={(e) => setForm((prev) => ({ ...prev, target_amount: e.target.value }))}
                        required
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label className="field__label" htmlFor="g-date">Target date</label>
                    <input
                      className="input input--mono"
                      id="g-date"
                      type="date"
                      min={todayISO()}
                      value={form.target_date}
                      onChange={(e) => setForm((prev) => ({ ...prev, target_date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="g-notes">Notes (optional)</label>
                  <textarea
                    className="input input--textarea"
                    id="g-notes"
                    rows="3"
                    placeholder="Strategy notes or milestone details..."
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </div>
              </div>

              <div className="modal__foot">
                <button
                  type="button"
                  className="btn btn--ghost-paper"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? "Saving…" : editingGoal ? "Update goal" : "Save goal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ────────────────────────────────────── */}
      {deleteTarget && (
        <div
          className="modal-overlay is-open"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal__body" style={{ paddingTop: "var(--sp-5)" }}>
              <h3 className="modal__title" style={{ marginBottom: 6 }}>
                Delete goal?
              </h3>
              <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-sm)", margin: 0 }}>
                Are you sure you want to remove <strong>"{deleteTarget.name}"</strong>? Your portfolio holdings will remain unchanged.
              </p>
            </div>
            <div className="modal__foot">
              <button
                type="button"
                className="btn btn--ghost-paper"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={confirmDelete}
              >
                Delete goal
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
