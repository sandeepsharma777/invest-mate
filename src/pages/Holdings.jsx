import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import { Seal } from "../components/Seal";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { investments, alerts, ASSET_TYPES } from "../lib/db";
import { formatCurrency, formatPercent, formatDate, todayISO, debounce, getCurrencySymbol } from "../lib/utils";
import AlertsBanner from "../components/AlertsBanner";
import AlertsModal from "../components/AlertsModal";
import "../styles/holdings.css";

const SELL_SVG = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
const EDIT_SVG = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>;
const DEL_SVG  = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0-1 14a2 2 0 01-2 2H7a2 2 0 01-2-2L4 6h16z"/></svg>;
const PLUS_SVG = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>;
const INCOME_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v10M15 9.5a2.5 2.5 0 00-5 0c0 3 5 2 5 5a2.5 2.5 0 01-5 0" />
  </svg>
);
const ALERT_SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
  </svg>
);

const EMPTY_FORM = {
  asset_type: "", name: "", identifier: "", quantity: "", platform: "",
  purchase_price: "", purchase_date: todayISO(), current_price: "",
  fees_paid: "", taxes_paid: "", notes: "", type_fields: {},
};

function TypeSpecificFields({ assetType, values, onChange }) {
  const def = ASSET_TYPES[assetType];
  if (!def || !def.fields.length) return null;
  return (
    <>
      <div className="form-section-title">{def.label} details</div>
      <div className="field-row">
        {def.fields.map((f) => (
          <div className="field" key={f.name} style={def.fields.length === 1 ? { gridColumn: "1 / -1" } : {}}>
            <label className="field__label" htmlFor={`tf-${f.name}`}>{f.label}</label>
            {f.type === "select" ? (
              <select className="input" id={`tf-${f.name}`} value={values[f.name] || ""} onChange={(e) => onChange(f.name, e.target.value)}>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className={`input${f.type === "number" ? " input--mono" : ""}`}
                type={f.type}
                id={`tf-${f.name}`}
                step={f.step || undefined}
                placeholder={f.placeholder || ""}
                value={values[f.name] || ""}
                onChange={(e) => onChange(f.name, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

export default function Holdings() {
  const { user } = useAuth();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const trackedTypes = user?.tracked_asset_types?.length ? user.tracked_asset_types : Object.keys(ASSET_TYPES);
  const currency = user?.currency || "INR";
  const currencySymbol = getCurrencySymbol(currency);

  // Data
  const [allRows, setAllRows] = useState([]);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Add/Edit modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, asset_type: trackedTypes[0] });
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Sell modal
  const [sellModal, setSellModal] = useState(false);
  const [sellId, setSellId] = useState(null);
  const [sellRow, setSellRow] = useState(null);
  const [sellQuantity, setSellQuantity] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellDate, setSellDate] = useState(todayISO());
  const [sellFees, setSellFees] = useState("");

  // Add transaction modal
  const [txModal, setTxModal] = useState(false);
  const [txHolding, setTxHolding] = useState(null);
  const [txForm, setTxForm] = useState({ type: "buy", quantity: "", pricePerUnit: "", date: todayISO(), fees: "" });

  // Delete modal
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  // Delete transaction modal
  const [deleteTxTarget, setDeleteTxTarget] = useState(null);

  // Record income modal
  const [incomeModal, setIncomeModal] = useState(false);
  const [incomeHolding, setIncomeHolding] = useState(null);
  const [incomeForm, setIncomeForm] = useState({ type: "dividend", amount: "", date: todayISO(), notes: "" });
  const [savingIncome, setSavingIncome] = useState(false);
  const [deleteIncomeTarget, setDeleteIncomeTarget] = useState(null);

  // Price alerts
  const [triggeredAlerts, setTriggeredAlerts] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [alertsModalOpen, setAlertsModalOpen] = useState(false);
  const [presetAlertHolding, setPresetAlertHolding] = useState(null);

  const refresh = useCallback(async () => {
    const [active, sold, trAlerts, aList] = await Promise.all([
      investments.list({ status: "active" }),
      investments.list({ status: "sold" }),
      alerts.getTriggered(),
      alerts.list(),
    ]);
    setAllRows([...active, ...sold]);
    setTriggeredAlerts(trAlerts || []);
    setAllAlerts(aList || []);
  }, []);

  useEffect(() => {
    refresh().catch((err) => toast(err.message || "Couldn't load holdings.", "error"));
  }, []);

  // Close modals on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setModalOpen(false);
        setSellModal(false);
        setTxModal(false);
        setDeleteModal(false);
        setDeleteTxTarget(null);
        setIncomeModal(false);
        setDeleteIncomeTarget(null);
        setAlertsModalOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function openSetAlertModal(holding = null) {
    setPresetAlertHolding(holding?.id || null);
    setAlertsModalOpen(true);
  }

  async function handleDismissAlert(alertId) {
    try {
      await alerts.dismiss(alertId);
      setTriggeredAlerts((prev) => prev.filter((a) => a.id !== alertId));
      toast("Alert notification dismissed", "info");
      refresh();
    } catch (err) {
      toast(err.message || "Failed to dismiss alert", "error");
    }
  }

  async function handleDismissAllAlerts() {
    try {
      await alerts.dismissAll();
      setTriggeredAlerts([]);
      toast("All alerts dismissed", "info");
      refresh();
    } catch (err) {
      toast(err.message || "Failed to dismiss alerts", "error");
    }
  }

  // Deep-link: ?add=1&type=gold
  useEffect(() => {
    if (searchParams.get("add") === "1") {
      openAddModal(searchParams.get("type"));
    }
  }, []);

  function toggleExpand(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Filtering / sorting ────────────────────────────────────────────────
  const counts = {};
  allRows.forEach((r) => { counts[r.asset_type] = (counts[r.asset_type] || 0) + 1; });

  let filtered = activeTab === "all" ? allRows : allRows.filter((r) => r.asset_type === activeTab);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.identifier || "").toLowerCase().includes(q) ||
      (r.platform || "").toLowerCase().includes(q)
    );
  }

  function applySort(rows) {
    const s = [...rows];
    switch (sort) {
      case "value-desc":  return s.sort((a, b) => b.current_value - a.current_value);
      case "return-desc": return s.sort((a, b) => b.percent_return - a.percent_return);
      case "return-asc":  return s.sort((a, b) => a.percent_return - b.percent_return);
      case "name":        return s.sort((a, b) => a.name.localeCompare(b.name));
      default:            return s.sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
  }
  const displayRows = applySort(filtered);

  const tabs = [
    { key: "all", label: "All holdings", count: allRows.length },
    ...trackedTypes.map((key) => ({ key, label: ASSET_TYPES[key]?.label || key, count: counts[key] || 0 })),
  ];

  // ── Add / Edit modal ───────────────────────────────────────────────────
  function openAddModal(presetType) {
    const type = presetType && trackedTypes.includes(presetType) ? presetType : trackedTypes[0];
    setForm({ ...EMPTY_FORM, asset_type: type, purchase_date: todayISO() });
    setEditingId(null);
    setEditingRow(null);
    setFieldErrors({});
    setModalOpen(true);
  }

  function openEditModal(id) {
    const row = allRows.find((r) => r.id === id);
    if (!row) return;
    setForm({
      asset_type: row.asset_type,
      name: row.name,
      identifier: row.identifier || "",
      quantity: String(row.quantity),
      platform: row.platform || "",
      purchase_price: String(row.purchase_price),
      purchase_date: row.purchase_date || todayISO(),
      current_price: String(row.current_price),
      fees_paid: String(row.fees_paid || ""),
      taxes_paid: String(row.taxes_paid || ""),
      notes: row.notes || "",
      type_fields: row.type_fields || {},
    });
    setEditingId(id);
    setEditingRow(row);
    setFieldErrors({});
    setModalOpen(true);
  }

  function setFormField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: false }));
  }

  function setTypeField(name, value) {
    setForm((prev) => ({ ...prev, type_fields: { ...prev.type_fields, [name]: value } }));
  }

  async function handleSaveHolding(e) {
    e.preventDefault();
    setSaving(true);
    setFieldErrors({});
    try {
      if (editingId) {
        await investments.update(editingId, form);
        toast("Holding updated.", "success");
      } else {
        await investments.create(form);
        toast("Holding added.", "success");
      }
      setModalOpen(false);
      refresh();
    } catch (err) {
      if (err.code === "VALIDATION") {
        toast(err.message, "error");
        const errs = {};
        if (/name/i.test(err.message)) errs["field-name"] = true;
        if (/quantity/i.test(err.message)) errs["field-quantity"] = true;
        if (/price/i.test(err.message)) errs["field-purchase-price"] = true;
        if (/date/i.test(err.message)) errs["field-purchase-date"] = true;
        setFieldErrors(errs);
      } else {
        toast(err.message || "Couldn't save holding.", "error");
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Sell modal ─────────────────────────────────────────────────────────
  function openSellModal(id) {
    const row = allRows.find((r) => r.id === id);
    if (!row) return;
    setSellId(id);
    setSellRow(row);
    setSellQuantity(String(row.quantity));
    setSellPrice(String(row.current_price || ""));
    setSellDate(todayISO());
    setSellFees("");
    setSellModal(true);
  }

  async function handleSell(e) {
    e.preventDefault();
    try {
      await investments.markSold(sellId, {
        sold_price: sellPrice,
        sold_date: sellDate,
        quantity: sellQuantity,
        fees: sellFees,
      });
      setSellModal(false);
      toast("Sell transaction recorded.", "success");
      refresh();
    } catch (err) {
      toast(err.message || "Couldn't record the sale.", "error");
    }
  }

  // ── Add Transaction modal ──────────────────────────────────────────────
  function openAddTxModal(holding, presetType = "buy") {
    setTxHolding(holding);
    setTxForm({
      type: presetType,
      quantity: "",
      pricePerUnit: String(holding.current_price || holding.purchase_price || ""),
      date: todayISO(),
      fees: "",
    });
    setTxModal(true);
  }

  async function handleSaveTx(e) {
    e.preventDefault();
    if (!txHolding) return;
    try {
      await investments.addTransaction(txHolding.id, txForm);
      setTxModal(false);
      toast(`${txForm.type === "buy" ? "Buy" : "Sell"} transaction recorded.`, "success");
      refresh();
    } catch (err) {
      toast(err.message || "Couldn't record transaction.", "error");
    }
  }

  async function confirmDeleteTx() {
    if (!deleteTxTarget) return;
    try {
      await investments.deleteTransaction(deleteTxTarget.holdingId, deleteTxTarget.txId);
      setDeleteTxTarget(null);
      toast("Transaction deleted.", "success");
      refresh();
    } catch (err) {
      toast(err.message || "Couldn't delete transaction.", "error");
    }
  }

  // ── Record Income modal ────────────────────────────────────────────────
  function openIncomeModal(row) {
    setIncomeHolding(row);
    setIncomeForm({
      type: row.asset_type === "fixed_deposit" ? "interest" : "dividend",
      amount: "",
      date: todayISO(),
      notes: "",
    });
    setIncomeModal(true);
  }

  async function handleSaveIncome(e) {
    e.preventDefault();
    if (!incomeHolding) return;
    const amt = Number(incomeForm.amount);
    if (!amt || amt <= 0) {
      toast("Please enter a valid amount greater than zero.", "error");
      return;
    }
    setSavingIncome(true);
    try {
      await investments.addIncome(incomeHolding.id, incomeForm);
      toast(`${incomeForm.type === "dividend" ? "Dividend" : "Interest"} payment recorded.`, "success");
      setIncomeModal(false);
      refresh();
    } catch (err) {
      toast(err.message || "Couldn't record income.", "error");
    } finally {
      setSavingIncome(false);
    }
  }

  async function confirmDeleteIncome() {
    if (!deleteIncomeTarget) return;
    try {
      await investments.deleteIncome(deleteIncomeTarget.holdingId, deleteIncomeTarget.incomeId);
      setDeleteIncomeTarget(null);
      toast("Income entry removed.", "success");
      refresh();
    } catch (err) {
      toast(err.message || "Couldn't remove income entry.", "error");
    }
  }

  // ── Delete modal ───────────────────────────────────────────────────────
  function openDeleteModal(id) { setDeleteId(id); setDeleteModal(true); }

  async function handleDelete() {
    try {
      await investments.remove(deleteId);
      setDeleteModal(false);
      toast("Holding deleted.", "success");
      refresh();
    } catch (err) {
      toast(err.message || "Couldn't delete holding.", "error");
    }
  }

  const handleSearch = useMemo(() => debounce((v) => setSearch(v), 200), []);

  // ── Overlay backdrop click closes modal ───────────────────────────────
  function handleOverlayClick(e, closeFn) {
    if (e.target === e.currentTarget) closeFn();
  }

  const currentTypeDef = ASSET_TYPES[form.asset_type];

  // Live calculations for Sell modal
  const sellUnits = Number(sellQuantity) || 0;
  const sellUnitP = Number(sellPrice) || 0;
  const sellF = Number(sellFees) || 0;
  const sellGrossProceeds = sellUnits * sellUnitP;
  const sellNetProceeds = sellGrossProceeds - sellF;
  const sellCostBasis = sellUnits * (Number(sellRow?.purchase_price) || 0);
  const sellEstimatedGain = sellNetProceeds - sellCostBasis;

  return (
    <DashboardLayout>
      <div className="topbar">
        <div>
          <div className="topbar__eyebrow">Full ledger</div>
          <h1>Holdings</h1>
          <p className="topbar__sub">Every position you've entered, tracked with granular transaction history.</p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-2)", alignItems: "center" }}>
          <button
            type="button"
            className="topbar-alert-btn"
            title="Price Alerts"
            onClick={() => openSetAlertModal()}
          >
            {ALERT_SVG}
            {triggeredAlerts.length > 0 && (
              <span className="topbar-alert-btn__badge">{triggeredAlerts.length}</span>
            )}
          </button>
          <button className="btn btn--primary" onClick={() => openAddModal()}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Add investment
          </button>
        </div>
      </div>

      {/* Triggered Price Alerts Banner */}
      <AlertsBanner
        triggeredAlerts={triggeredAlerts}
        currency={currency}
        onDismiss={handleDismissAlert}
        onDismissAll={handleDismissAllAlerts}
        onOpenManage={(holdingId) => openSetAlertModal({ id: holdingId })}
      />

      {/* Tabs */}
      <div className="tabs" id="asset-tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-btn${activeTab === t.key ? " is-active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label} <span className="count">{t.count}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="panel">
        <div className="table-toolbar">
          <div className="search-field">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
            <input className="input" id="search-input" placeholder="Search by name, symbol or platform…"
              onChange={(e) => handleSearch(e.target.value)} />
          </div>
          <select className="sort-select" id="sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Sort: Most recent</option>
            <option value="value-desc">Sort: Value (high → low)</option>
            <option value="return-desc">Sort: Return % (high → low)</option>
            <option value="return-asc">Sort: Return % (low → high)</option>
            <option value="name">Sort: Name (A → Z)</option>
          </select>
        </div>

        <div className="table-scroll">
          {displayRows.length === 0 ? (
            <div className="empty-state" id="holdings-empty">
              <div className="empty-state__icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
              </div>
              <h3>Nothing here yet</h3>
              <p>No holdings match this filter. Try a different tab or search, or add a new investment.</p>
            </div>
          ) : (
            <table className="ledger-table" id="holdings-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Holding</th>
                  <th>Type</th>
                  <th className="num">Qty</th>
                  <th className="num">Avg. cost</th>
                  <th className="num">Current price</th>
                  <th className="num">Invested</th>
                  <th className="num">Current value</th>
                  <th className="num">Return</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r) => {
                  const isExpanded = expandedIds.has(r.id);
                  const txCount = r.transactions?.length || 0;
                  return (
                    <Fragment key={r.id}>
                      <tr className={isExpanded ? "is-row-expanded" : ""}>
                        <td style={{ width: 34, paddingRight: 0 }}>
                          <button
                            type="button"
                            className={`expand-btn ${isExpanded ? "is-active" : ""}`}
                            title={isExpanded ? "Hide transactions" : "Show transactions"}
                            onClick={() => toggleExpand(r.id)}
                            aria-expanded={isExpanded}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              style={{
                                transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                transition: "transform 0.15s ease",
                                width: 14,
                                height: 14,
                              }}
                            >
                              <path d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                        </td>
                        <td>
                          <span className="cell-primary">{r.name}</span>
                          <span className="cell-sub">
                            {r.identifier || r.platform || "—"}
                            {r.status === "sold" ? " · Sold" : ""}
                            {" · "}
                            <button
                              type="button"
                              className="link-btn"
                              onClick={() => toggleExpand(r.id)}
                            >
                              {txCount} txn{txCount === 1 ? "" : "s"}
                            </button>
                          </span>
                        </td>
                        <td><Seal assetType={r.asset_type} ASSET_TYPES={ASSET_TYPES} /></td>
                        <td className="num">{r.quantity} <span style={{ fontSize: "var(--fs-2xs)", color: "var(--paper-ink-soft)" }}>{r.unit}</span></td>
                        <td className="num">{formatCurrency(r.purchase_price, currency)}</td>
                        <td className="num">{formatCurrency(r.status === "sold" && r.sold_price != null ? r.sold_price : r.current_price, currency)}</td>
                        <td className="num">{formatCurrency(r.invested_amount, currency)}</td>
                        <td className="num">{formatCurrency(r.current_value, currency)}</td>
                        <td className={`num ${r.absolute_return >= 0 ? "text-positive" : "text-negative"}`}>
                          <div>{formatPercent(r.percent_return)} <span style={{ fontSize: "var(--fs-2xs)", color: "var(--paper-ink-soft)" }}>abs</span></div>
                          <div style={{ fontSize: "var(--fs-2xs)", fontWeight: 600 }}>
                            {r.xirr != null ? `${formatPercent(r.xirr)} XIRR` : (r.cagr != null ? `${formatPercent(r.cagr)} CAGR` : "")}
                          </div>
                          <div className="cell-sub" style={{ margin: 0, color: r.absolute_return >= 0 ? "var(--jade-600)" : "var(--oxblood-600)" }}>
                            {formatCurrency(r.absolute_return, currency)}
                          </div>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" title="Set price alert" onClick={() => openSetAlertModal(r)}>{ALERT_SVG}</button>
                            <button className="icon-btn" title="Record income" onClick={() => openIncomeModal(r)}>{INCOME_SVG}</button>
                            <button className="icon-btn" title="Add transaction" onClick={() => openAddTxModal(r, "buy")}>{PLUS_SVG}</button>
                            {r.quantity > 0 && (
                              <button className="icon-btn" title="Sell units" onClick={() => openSellModal(r.id)}>{SELL_SVG}</button>
                            )}
                            <button className="icon-btn" title="Edit" onClick={() => openEditModal(r.id)}>{EDIT_SVG}</button>
                            <button className="icon-btn" title="Delete" onClick={() => openDeleteModal(r.id)}>{DEL_SVG}</button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="tx-history-tr">
                          <td colSpan="10" className="tx-history-td">
                            <div className="tx-history-panel">
                              <div className="tx-history-head">
                                <div>
                                  <h4 className="tx-history-title">Transaction History</h4>
                                  <p className="tx-history-sub">
                                    {txCount} transaction{txCount === 1 ? "" : "s"} · {r.total_buy_qty || 0} {r.unit} bought · {r.total_sell_qty || 0} {r.unit} sold
                                  </p>
                                </div>
                                <div className="tx-history-actions">
                                  <button
                                    type="button"
                                    className="btn btn--sm btn--primary"
                                    onClick={() => openAddTxModal(r, "buy")}
                                  >
                                    + Buy more
                                  </button>
                                  {r.quantity > 0 && (
                                    <button
                                      type="button"
                                      className="btn btn--sm btn--ghost-paper"
                                      onClick={() => openSellModal(r.id)}
                                    >
                                      Sell units
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="btn btn--sm btn--ghost-paper"
                                    onClick={() => openIncomeModal(r)}
                                  >
                                    + Record income
                                  </button>
                                </div>
                              </div>

                              <div style={{ display: "flex", gap: "var(--sp-4)", flexWrap: "wrap", padding: "8px 12px", background: "#fcfbfa", border: "1px dashed var(--paper-line)", borderRadius: "var(--radius-sm)", marginBottom: "var(--sp-3)", fontSize: "var(--fs-xs)" }}>
                                <span><strong>Absolute return:</strong> <span className={r.absolute_return >= 0 ? "text-positive" : "text-negative"}>{formatPercent(r.percent_return)} ({formatCurrency(r.absolute_return, currency)})</span></span>
                                <span><strong>XIRR:</strong> <span className={r.xirr != null && r.xirr >= 0 ? "text-positive" : r.xirr != null ? "text-negative" : "text-muted"}>{r.xirr != null ? `${formatPercent(r.xirr)} p.a.` : "—"}</span></span>
                                {r.cagr != null && (
                                  <span><strong>CAGR:</strong> <span className={r.cagr >= 0 ? "text-positive" : "text-negative"}>{formatPercent(r.cagr)} p.a.</span></span>
                                )}
                                {r.realized_gain !== 0 && (
                                  <span><strong>Realized P&amp;L:</strong> <span className={r.realized_gain >= 0 ? "text-positive" : "text-negative"}>{formatCurrency(r.realized_gain, currency)}</span></span>
                                )}
                                {(r.total_income || 0) > 0 && (
                                  <span className="text-positive">
                                    <strong>Income:</strong> {formatCurrency(r.total_income, currency)}
                                    <span style={{ fontSize: "var(--fs-2xs)", color: "var(--paper-ink-soft)", marginLeft: 4 }}>
                                      ({r.total_dividends > 0 ? `Div: ${formatCurrency(r.total_dividends, currency)}` : ""}{r.total_dividends > 0 && r.total_interest > 0 ? " · " : ""}{r.total_interest > 0 ? `Int: ${formatCurrency(r.total_interest, currency)}` : ""})
                                    </span>
                                  </span>
                                )}
                              </div>

                              {(!r.transactions || r.transactions.length === 0) ? (
                                <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-xs)", margin: "var(--sp-2) 0" }}>
                                  No transactions logged yet.
                                </p>
                              ) : (
                                <table className="ledger-table tx-table">
                                  <thead>
                                    <tr>
                                      <th>Action</th>
                                      <th>Date</th>
                                      <th className="num">Quantity</th>
                                      <th className="num">Price / unit</th>
                                      <th className="num">Fees</th>
                                      <th className="num">Net cashflow</th>
                                      <th style={{ width: 40 }} />
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {r.transactions.map((tx) => {
                                      const netFlow = tx.type === "buy"
                                        ? (Number(tx.quantity) * Number(tx.pricePerUnit) + (Number(tx.fees) || 0))
                                        : (Number(tx.quantity) * Number(tx.pricePerUnit) - (Number(tx.fees) || 0));
                                      return (
                                        <tr key={tx.id}>
                                          <td>
                                            <span className={`badge-tx badge-tx--${tx.type}`}>
                                              {tx.type}
                                            </span>
                                          </td>
                                          <td>{formatDate(tx.date)}</td>
                                          <td className="num">{tx.quantity} {r.unit}</td>
                                          <td className="num">{formatCurrency(tx.pricePerUnit, currency)}</td>
                                          <td className="num">{formatCurrency(tx.fees || 0, currency)}</td>
                                          <td className={`num ${tx.type === "sell" ? "text-positive" : "text-negative"}`}>
                                            {tx.type === "sell" ? "+" : "-"}{formatCurrency(netFlow, currency)}
                                          </td>
                                          <td className="num">
                                            <button
                                              type="button"
                                              className="icon-btn icon-btn--sm"
                                              title="Delete transaction"
                                              onClick={() => setDeleteTxTarget({ holdingId: r.id, txId: tx.id })}
                                              disabled={r.transactions.length <= 1}
                                            >
                                              {DEL_SVG}
                                            </button>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              )}

                              {/* Income History Section */}
                              <div style={{ marginTop: "var(--sp-4)", borderTop: "1px dashed var(--paper-line)", paddingTop: "var(--sp-3)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                                  <div>
                                    <h5 style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--paper-ink)" }}>
                                      Dividends &amp; Interest Received
                                    </h5>
                                    <p style={{ margin: "2px 0 0", fontSize: "var(--fs-2xs)", color: "var(--paper-ink-soft)" }}>
                                      {r.income?.length || 0} payment{r.income?.length === 1 ? "" : "s"} logged · Total {formatCurrency(r.total_income || 0, currency)}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn--sm btn--ghost-paper"
                                    onClick={() => openIncomeModal(r)}
                                  >
                                    + Record income
                                  </button>
                                </div>

                                {(!r.income || r.income.length === 0) ? (
                                  <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-xs)", margin: "var(--sp-2) 0" }}>
                                    No dividends or interest recorded yet.
                                  </p>
                                ) : (
                                  <table className="ledger-table tx-table">
                                    <thead>
                                      <tr>
                                        <th>Type</th>
                                        <th>Date</th>
                                        <th>Description / Note</th>
                                        <th className="num">Amount received</th>
                                        <th style={{ width: 40 }} />
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.income.map((inc) => (
                                        <tr key={inc.id}>
                                          <td>
                                            <span className={`badge-tx badge-tx--${inc.type}`}>
                                              {inc.type}
                                            </span>
                                          </td>
                                          <td>{formatDate(inc.date)}</td>
                                          <td style={{ color: inc.notes ? "var(--paper-ink)" : "var(--paper-ink-soft)" }}>
                                            {inc.notes || "—"}
                                          </td>
                                          <td className="num text-positive" style={{ fontWeight: 600 }}>
                                            +{formatCurrency(inc.amount, currency)}
                                          </td>
                                          <td className="num">
                                            <button
                                              type="button"
                                              className="icon-btn icon-btn--sm"
                                              title="Delete income entry"
                                              onClick={() => setDeleteIncomeTarget({ holdingId: r.id, incomeId: inc.id })}
                                            >
                                              {DEL_SVG}
                                            </button>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </div>

                              {/* Price Alerts Section */}
                              <div style={{ marginTop: "var(--sp-4)", borderTop: "1px dashed var(--paper-line)", paddingTop: "var(--sp-3)" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-2)" }}>
                                  <div>
                                    <h5 style={{ margin: 0, fontSize: "var(--fs-sm)", fontWeight: 700, color: "var(--paper-ink)" }}>
                                      Price Alerts
                                    </h5>
                                    <p style={{ margin: "2px 0 0", fontSize: "var(--fs-2xs)", color: "var(--paper-ink-soft)" }}>
                                      {allAlerts.filter((a) => a.investment_id === r.id).length} alert{allAlerts.filter((a) => a.investment_id === r.id).length === 1 ? "" : "s"} configured for {r.name}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="btn btn--sm btn--ghost-paper"
                                    onClick={() => openSetAlertModal(r)}
                                  >
                                    + Set price alert
                                  </button>
                                </div>

                                {allAlerts.filter((a) => a.investment_id === r.id).length === 0 ? (
                                  <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-xs)", margin: "var(--sp-2) 0" }}>
                                    No price alerts set for this position.
                                  </p>
                                ) : (
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", marginTop: 4 }}>
                                    {allAlerts.filter((a) => a.investment_id === r.id).map((ha) => (
                                      <button
                                        type="button"
                                        key={ha.id}
                                        className="btn btn--sm btn--ghost-paper"
                                        style={{
                                          fontSize: "var(--fs-xs)",
                                          padding: "4px 8px",
                                          borderColor: ha.is_triggered && !ha.dismissed ? "var(--gold-500)" : "var(--paper-line)",
                                          background: ha.is_triggered && !ha.dismissed ? "rgba(201, 162, 75, 0.15)" : "transparent",
                                        }}
                                        onClick={() => openSetAlertModal(r)}
                                        title="Click to manage alert"
                                      >
                                        <span>{ha.condition === "above" ? "📈 ≥" : "📉 ≤"} {formatCurrency(ha.target_price, currency)}</span>
                                        {ha.is_triggered && !ha.dismissed && (
                                          <span style={{ color: "#8c6d1f", fontWeight: 700, marginLeft: 4 }}>Triggered 🚨</span>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ── Add/Edit Modal ───────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="modal-overlay is-open" id="holding-modal" onClick={(e) => handleOverlayClick(e, () => setModalOpen(false))}>
          <div className="modal">
            <div className="modal__head">
              <div>
                <h3 className="modal__title">{editingId ? "Edit investment" : "Add investment"}</h3>
                <p className="modal__sub">{editingId ? "Update figures as your holding changes." : "Enter details for the initial purchase transaction."}</p>
              </div>
              <button className="icon-btn" onClick={() => setModalOpen(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <form id="holding-form" onSubmit={handleSaveHolding}>
              <div className="modal__body">
                {editingRow && editingRow.transactions && editingRow.transactions.length > 1 && (
                  <div style={{ background: "var(--paper-100)", border: "1px solid var(--paper-line)", padding: "10px 12px", borderRadius: "var(--radius-sm)", marginBottom: "var(--sp-4)", fontSize: "var(--fs-xs)", color: "var(--paper-ink)" }}>
                    💡 <strong>Multiple transactions:</strong> This holding has {editingRow.transactions.length} transactions. Total quantity ({editingRow.quantity} {editingRow.unit}) and weighted-average cost basis ({formatCurrency(editingRow.purchase_price, currency)}) are derived from transactions. Use the table to add or modify individual transactions.
                  </div>
                )}

                <div className="form-section-title">Asset type</div>
                <div className="field">
                  <select className="input" id="f-asset-type" value={form.asset_type}
                    onChange={(e) => setFormField("asset_type", e.target.value)}>
                    {trackedTypes.map((key) => (
                      <option key={key} value={key}>{ASSET_TYPES[key]?.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-section-title">Core details</div>
                <div className="field-row">
                  <div className={`field${fieldErrors["field-name"] ? " has-error" : ""}`} id="field-name">
                    <label className="field__label" htmlFor="f-name">Name</label>
                    <input className="input" id="f-name" placeholder="e.g. HDFC Bank Ltd"
                      value={form.name} onChange={(e) => setFormField("name", e.target.value)} />
                    <p className="field__error">Name is required.</p>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="f-identifier">Symbol / ID <span style={{ fontWeight: 400 }}>(optional)</span></label>
                    <input className="input input--mono" id="f-identifier" placeholder="e.g. HDFCBANK"
                      value={form.identifier} onChange={(e) => setFormField("identifier", e.target.value)} />
                  </div>
                </div>

                <div className="field-row">
                  <div className={`field${fieldErrors["field-quantity"] ? " has-error" : ""}`} id="field-quantity">
                    <label className="field__label" htmlFor="f-quantity">
                      Quantity <span id="unit-label">({currentTypeDef?.unitLabel || "units"})</span>
                    </label>
                    <input
                      className="input input--mono"
                      type="number"
                      step="any"
                      min="0"
                      id="f-quantity"
                      placeholder="0"
                      value={form.quantity}
                      onChange={(e) => setFormField("quantity", e.target.value)}
                      disabled={Boolean(editingRow && editingRow.transactions && editingRow.transactions.length > 1)}
                    />
                    <p className="field__error">Enter a quantity greater than zero.</p>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="f-platform">Platform / Broker <span style={{ fontWeight: 400 }}>(optional)</span></label>
                    <input className="input" id="f-platform" placeholder="e.g. Zerodha, Groww…"
                      value={form.platform} onChange={(e) => setFormField("platform", e.target.value)} />
                  </div>
                </div>

                <div className="field-row">
                  <div className={`field${fieldErrors["field-purchase-price"] ? " has-error" : ""}`} id="field-purchase-price">
                    <label className="field__label" htmlFor="f-purchase-price">Purchase price / unit</label>
                    <div className="input-affix">
                      <span className="input-affix__prefix">{currencySymbol}</span>
                      <input
                        className="input input--mono"
                        type="number"
                        step="any"
                        min="0"
                        id="f-purchase-price"
                        placeholder="0.00"
                        value={form.purchase_price}
                        onChange={(e) => setFormField("purchase_price", e.target.value)}
                        disabled={Boolean(editingRow && editingRow.transactions && editingRow.transactions.length > 1)}
                      />
                    </div>
                    <p className="field__error">Enter a valid purchase price.</p>
                  </div>
                  <div className={`field${fieldErrors["field-purchase-date"] ? " has-error" : ""}`} id="field-purchase-date">
                    <label className="field__label" htmlFor="f-purchase-date">Purchase date</label>
                    <input className="input" type="date" id="f-purchase-date"
                      value={form.purchase_date} onChange={(e) => setFormField("purchase_date", e.target.value)} />
                    <p className="field__error">Purchase date is required.</p>
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="f-current-price">Current price / unit <span style={{ fontWeight: 400 }}>(update anytime)</span></label>
                  <div className="input-affix">
                    <span className="input-affix__prefix">{currencySymbol}</span>
                    <input className="input input--mono" type="number" step="any" min="0" id="f-current-price" placeholder="Defaults to purchase price"
                      value={form.current_price} onChange={(e) => setFormField("current_price", e.target.value)} />
                  </div>
                </div>

                <div className="form-section-title">Fees &amp; tax</div>
                <div className="field-row">
                  <div className="field">
                    <label className="field__label" htmlFor="f-fees">Fees paid <span style={{ fontWeight: 400 }}>(brokerage, expense ratio, etc.)</span></label>
                    <div className="input-affix"><span className="input-affix__prefix">{currencySymbol}</span>
                      <input className="input input--mono" type="number" step="any" min="0" id="f-fees" placeholder="0.00"
                        value={form.fees_paid} onChange={(e) => setFormField("fees_paid", e.target.value)} />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="f-taxes">Taxes paid <span style={{ fontWeight: 400 }}>(STT, stamp duty, etc.)</span></label>
                    <div className="input-affix"><span className="input-affix__prefix">{currencySymbol}</span>
                      <input className="input input--mono" type="number" step="any" min="0" id="f-taxes" placeholder="0.00"
                        value={form.taxes_paid} onChange={(e) => setFormField("taxes_paid", e.target.value)} />
                    </div>
                  </div>
                </div>

                <TypeSpecificFields
                  assetType={form.asset_type}
                  values={form.type_fields}
                  onChange={setTypeField}
                />

                <div className="form-section-title">Notes</div>
                <div className="field">
                  <textarea className="input" id="f-notes" rows="2" placeholder="Anything worth remembering about this holding…"
                    value={form.notes} onChange={(e) => setFormField("notes", e.target.value)} />
                </div>
              </div>
              <div className="modal__foot">
                <button type="button" className="btn btn--ghost-paper" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={saving}>
                  {saving ? "Saving…" : editingId ? "Save changes" : "Save investment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Sell Modal ───────────────────────────────────────────────────── */}
      {sellModal && (
        <div className="modal-overlay is-open" id="sell-modal" onClick={(e) => handleOverlayClick(e, () => setSellModal(false))}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal__head">
              <div>
                <h3 className="modal__title">Sell holding</h3>
                <p className="modal__sub">Log a sell transaction for {sellRow?.name || "this holding"}.</p>
              </div>
              <button className="icon-btn" onClick={() => setSellModal(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <form id="sell-form" onSubmit={handleSell}>
              <div className="modal__body">
                <div className="field">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label className="field__label" htmlFor="sell-quantity">Quantity to sell ({sellRow?.unit || "units"})</label>
                    <button
                      type="button"
                      className="link-btn"
                      style={{ fontSize: "var(--fs-2xs)" }}
                      onClick={() => setSellQuantity(String(sellRow?.quantity || ""))}
                    >
                      Sell max ({sellRow?.quantity} {sellRow?.unit})
                    </button>
                  </div>
                  <input
                    className="input input--mono"
                    type="number"
                    step="any"
                    min="0.0001"
                    max={sellRow?.quantity}
                    id="sell-quantity"
                    value={sellQuantity}
                    onChange={(e) => setSellQuantity(e.target.value)}
                    required
                  />
                  <span className="field__hint">Currently holding: {sellRow?.quantity} {sellRow?.unit}</span>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field__label" htmlFor="sell-price">Sale price / unit</label>
                    <div className="input-affix"><span className="input-affix__prefix">{currencySymbol}</span>
                      <input className="input input--mono" type="number" step="any" min="0" id="sell-price"
                        value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required />
                    </div>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="sell-fees">Fees / Brokerage</label>
                    <div className="input-affix"><span className="input-affix__prefix">{currencySymbol}</span>
                      <input className="input input--mono" type="number" step="any" min="0" id="sell-fees"
                        placeholder="0.00" value={sellFees} onChange={(e) => setSellFees(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="field">
                  <label className="field__label" htmlFor="sell-date">Sale date</label>
                  <input className="input" type="date" id="sell-date"
                    value={sellDate} onChange={(e) => setSellDate(e.target.value)} required />
                </div>

                {sellUnits > 0 && sellUnitP > 0 && (
                  <div className="preview-box">
                    <div className="preview-box__row">
                      <span>Gross proceeds:</span>
                      <span>{formatCurrency(sellGrossProceeds, currency)}</span>
                    </div>
                    <div className="preview-box__row">
                      <span>Estimated cost basis:</span>
                      <span>{formatCurrency(sellCostBasis, currency)}</span>
                    </div>
                    <div className="preview-box__row">
                      <span>Realized P&amp;L:</span>
                      <span className={sellEstimatedGain >= 0 ? "text-positive" : "text-negative"}>
                        {formatCurrency(sellEstimatedGain, currency)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal__foot">
                <button type="button" className="btn btn--ghost-paper" onClick={() => setSellModal(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary">Confirm sell transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add Transaction Modal ────────────────────────────────────────── */}
      {txModal && txHolding && (
        <div className="modal-overlay is-open" onClick={(e) => handleOverlayClick(e, () => setTxModal(false))}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal__head">
              <div>
                <h3 className="modal__title">Record transaction</h3>
                <p className="modal__sub">{txHolding.name} ({txHolding.identifier || txHolding.platform || ASSET_TYPES[txHolding.asset_type]?.label})</p>
              </div>
              <button className="icon-btn" onClick={() => setTxModal(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSaveTx}>
              <div className="modal__body">
                <div className="field">
                  <label className="field__label">Action</label>
                  <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                    <button
                      type="button"
                      className={`btn btn--sm ${txForm.type === "buy" ? "btn--primary" : "btn--ghost-paper"}`}
                      style={{ flex: 1 }}
                      onClick={() => setTxForm((f) => ({ ...f, type: "buy" }))}
                    >
                      Buy (Add units)
                    </button>
                    <button
                      type="button"
                      className={`btn btn--sm ${txForm.type === "sell" ? "btn--primary" : "btn--ghost-paper"}`}
                      style={{ flex: 1 }}
                      onClick={() => setTxForm((f) => ({ ...f, type: "sell" }))}
                      disabled={txHolding.quantity <= 0}
                    >
                      Sell (Reduce units)
                    </button>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field__label" htmlFor="tx-quantity">
                      Quantity ({txHolding.unit})
                    </label>
                    <input
                      className="input input--mono"
                      type="number"
                      step="any"
                      min="0.0001"
                      max={txForm.type === "sell" ? txHolding.quantity : undefined}
                      id="tx-quantity"
                      placeholder="0"
                      value={txForm.quantity}
                      onChange={(e) => setTxForm((f) => ({ ...f, quantity: e.target.value }))}
                      required
                    />
                    {txForm.type === "sell" && (
                      <span className="field__hint">Max available: {txHolding.quantity} {txHolding.unit}</span>
                    )}
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="tx-price">Price / unit</label>
                    <div className="input-affix">
                      <span className="input-affix__prefix">{currencySymbol}</span>
                      <input
                        className="input input--mono"
                        type="number"
                        step="any"
                        min="0"
                        id="tx-price"
                        placeholder="0.00"
                        value={txForm.pricePerUnit}
                        onChange={(e) => setTxForm((f) => ({ ...f, pricePerUnit: e.target.value }))}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field__label" htmlFor="tx-date">Date</label>
                    <input
                      className="input"
                      type="date"
                      id="tx-date"
                      value={txForm.date}
                      onChange={(e) => setTxForm((f) => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="tx-fees">Fees / Brokerage</label>
                    <div className="input-affix">
                      <span className="input-affix__prefix">{currencySymbol}</span>
                      <input
                        className="input input--mono"
                        type="number"
                        step="any"
                        min="0"
                        id="tx-fees"
                        placeholder="0.00"
                        value={txForm.fees}
                        onChange={(e) => setTxForm((f) => ({ ...f, fees: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>

                {Number(txForm.quantity) > 0 && Number(txForm.pricePerUnit) > 0 && (
                  <div className="preview-box">
                    <div className="preview-box__row">
                      <span>Total unit value:</span>
                      <span>{formatCurrency((Number(txForm.quantity) || 0) * (Number(txForm.pricePerUnit) || 0), currency)}</span>
                    </div>
                    <div className="preview-box__row">
                      <span>Fees:</span>
                      <span>{formatCurrency(Number(txForm.fees) || 0, currency)}</span>
                    </div>
                    <div className="preview-box__row">
                      <span>{txForm.type === "buy" ? "Total cash outflow:" : "Net cash inflow:"}</span>
                      <span style={{ color: txForm.type === "buy" ? "var(--oxblood-600)" : "var(--jade-600)", fontWeight: 700 }}>
                        {formatCurrency(
                          txForm.type === "buy"
                            ? (Number(txForm.quantity) * Number(txForm.pricePerUnit) + (Number(txForm.fees) || 0))
                            : (Number(txForm.quantity) * Number(txForm.pricePerUnit) - (Number(txForm.fees) || 0)),
                          currency
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal__foot">
                <button type="button" className="btn btn--ghost-paper" onClick={() => setTxModal(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary">Record {txForm.type}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Modal ─────────────────────────────────────────────────── */}
      {deleteModal && (
        <div className="modal-overlay is-open" id="delete-modal" onClick={(e) => handleOverlayClick(e, () => setDeleteModal(false))}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal__body" style={{ paddingTop: "var(--sp-5)" }}>
              <h3 className="modal__title" style={{ marginBottom: 6 }}>Delete this holding?</h3>
              <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-sm)", margin: 0 }}>
                This removes it permanently along with all its logged transactions from your ledger. This can't be undone.
              </p>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost-paper" onClick={() => setDeleteModal(false)}>Cancel</button>
              <button type="button" className="btn btn--danger" onClick={handleDelete}>Delete holding</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Transaction Modal ────────────────────────────────────────── */}
      {deleteTxTarget && (
        <div className="modal-overlay is-open" onClick={(e) => handleOverlayClick(e, () => setDeleteTxTarget(null))}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal__body" style={{ paddingTop: "var(--sp-5)" }}>
              <h3 className="modal__title" style={{ marginBottom: 6 }}>Delete this transaction?</h3>
              <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-sm)", margin: 0 }}>
                The holding's units, cost basis, and returns will be recalculated. This can't be undone.
              </p>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost-paper" onClick={() => setDeleteTxTarget(null)}>Cancel</button>
              <button type="button" className="btn btn--danger" onClick={confirmDeleteTx}>Delete transaction</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Record Income Modal ─────────────────────────────────────────── */}
      {incomeModal && incomeHolding && (
        <div className="modal-overlay is-open" onClick={(e) => handleOverlayClick(e, () => setIncomeModal(false))}>
          <div className="modal">
            <div className="modal__head">
              <div>
                <h3 className="modal__title">Record income</h3>
                <p className="modal__sub">Log a dividend or interest payment for {incomeHolding.name}.</p>
              </div>
              <button type="button" className="icon-btn" onClick={() => setIncomeModal(false)} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <form onSubmit={handleSaveIncome}>
              <div className="modal__body">
                <div className="field-row">
                  <div className="field">
                    <label className="field__label" htmlFor="inc-type">Income type</label>
                    <select
                      className="input"
                      id="inc-type"
                      value={incomeForm.type}
                      onChange={(e) => setIncomeForm((f) => ({ ...f, type: e.target.value }))}
                    >
                      <option value="dividend">Dividend (stocks / mutual funds)</option>
                      <option value="interest">Interest (fixed deposit / bonds)</option>
                    </select>
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="inc-amount">Amount received</label>
                    <div className="input-affix">
                      <span className="input-affix__prefix">{currencySymbol}</span>
                      <input
                        className="input input--mono"
                        type="number"
                        step="any"
                        min="0.01"
                        id="inc-amount"
                        placeholder="0.00"
                        value={incomeForm.amount}
                        onChange={(e) => setIncomeForm((f) => ({ ...f, amount: e.target.value }))}
                        required
                        autoFocus
                      />
                    </div>
                  </div>
                </div>

                <div className="field-row">
                  <div className="field">
                    <label className="field__label" htmlFor="inc-date">Payment date</label>
                    <input
                      className="input"
                      type="date"
                      id="inc-date"
                      value={incomeForm.date}
                      onChange={(e) => setIncomeForm((f) => ({ ...f, date: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field__label" htmlFor="inc-notes">Note / Period (optional)</label>
                    <input
                      className="input"
                      type="text"
                      id="inc-notes"
                      placeholder="e.g. Q3 Dividend, FY24 Interest"
                      value={incomeForm.notes}
                      onChange={(e) => setIncomeForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="preview-box">
                  <div className="preview-box__row">
                    <span>Holding:</span>
                    <span>{incomeHolding.name} ({incomeHolding.identifier || incomeHolding.unit})</span>
                  </div>
                  <div className="preview-box__row">
                    <span>Cashflow impact:</span>
                    <span style={{ color: "var(--jade-600)", fontWeight: 700 }}>
                      +{formatCurrency(Number(incomeForm.amount) || 0, currency)} (Cash inflow)
                    </span>
                  </div>
                </div>
              </div>
              <div className="modal__foot">
                <button type="button" className="btn btn--ghost-paper" onClick={() => setIncomeModal(false)}>Cancel</button>
                <button type="submit" className="btn btn--primary" disabled={savingIncome}>
                  {savingIncome ? "Recording…" : "Save income"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete Income Entry Modal ────────────────────────────────────── */}
      {deleteIncomeTarget && (
        <div className="modal-overlay is-open" onClick={(e) => handleOverlayClick(e, () => setDeleteIncomeTarget(null))}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal__body" style={{ paddingTop: "var(--sp-5)" }}>
              <h3 className="modal__title" style={{ marginBottom: 6 }}>Delete this income payment?</h3>
              <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-sm)", margin: 0 }}>
                This income payment will be removed and the holding's return metrics will be recalculated.
              </p>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost-paper" onClick={() => setDeleteIncomeTarget(null)}>Cancel</button>
              <button type="button" className="btn btn--danger" onClick={confirmDeleteIncome}>Delete payment</button>
            </div>
          </div>
        </div>
      )}
      {/* ── Alerts Modal ────────────────────────────────────────────────── */}
      <AlertsModal
        isOpen={alertsModalOpen}
        onClose={() => setAlertsModalOpen(false)}
        presetHoldingId={presetAlertHolding}
        currency={currency}
        onAlertsChanged={refresh}
      />
    </DashboardLayout>
  );
}
