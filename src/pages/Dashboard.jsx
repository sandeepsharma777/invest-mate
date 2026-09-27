import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import StatCard from "../components/StatCard";
import { Seal, ColorDot } from "../components/Seal";
import { AllocationDonut } from "../components/Charts";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { analytics, investments, ASSET_TYPES } from "../lib/db";
import { formatCurrency, formatCompact, formatPercent } from "../lib/utils";
import { PALETTE } from "../lib/chartConfig";
import "../styles/dashboard.css";

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();

  const [summary, setSummary] = useState(null);
  const [allocation, setAllocation] = useState([]);
  const [movers, setMovers] = useState({ gainers: [], losers: [] });
  const [recent, setRecent] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const currency = user?.currency || "INR";
  const firstName = user?.name?.split(" ")[0] || "";
  const trackedTypes = user?.tracked_asset_types?.length ? user.tracked_asset_types : Object.keys(ASSET_TYPES);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      analytics.getSummary(),
      analytics.getAllocation(),
      analytics.getTopMovers(3),
      investments.list({ status: "active" }),
    ])
      .then(([s, alloc, mov, rows]) => {
        setSummary(s);
        setAllocation(alloc);
        setMovers(mov);
        setRecent(rows.slice(0, 6));
        setLoaded(true);
      })
      .catch((err) => toast(err.message || "Couldn't load dashboard.", "error"));
  }, [user, toast]);

  const isEmpty = loaded && summary?.holdings_count === 0;
  const isGain = (summary?.absolute_return ?? 0) >= 0;

  return (
    <DashboardLayout>
      <div className="topbar">
        <div>
          <div className="topbar__eyebrow">Unified dashboard</div>
          <h1 id="greeting">{loaded ? `Good to see you, ${firstName}` : "Good to see you"}</h1>
          <p className="topbar__sub">Everything you hold, valued as of your last manual update.</p>
        </div>
        <Link className="btn btn--primary" to="/holdings?add=1">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Add investment
        </Link>
      </div>

      {/* Stat cards */}
      {!isEmpty && (
        <div className="card-grid" id="stat-cards">
          {!loaded ? (
            <>
              <div className="ledger-card stat-card"><div className="skel" style={{ height: 70 }} /></div>
              <div className="ledger-card stat-card"><div className="skel" style={{ height: 70 }} /></div>
              <div className="ledger-card stat-card"><div className="skel" style={{ height: 70 }} /></div>
              <div className="ledger-card stat-card"><div className="skel" style={{ height: 70 }} /></div>
            </>
          ) : (
            <>
              <StatCard label="Total portfolio value" value={formatCurrency(summary.total_current_value, currency)}
                sub={`${summary.holdings_count} active position${summary.holdings_count === 1 ? "" : "s"}`} />
              <StatCard label="Total invested" value={formatCurrency(summary.total_invested, currency)}
                sub="Cost basis incl. fees & taxes" />
              <StatCard label="Absolute return" value={formatCurrency(summary.absolute_return, currency)}
                delta={formatPercent(summary.percent_return)} deltaPositive={isGain} sub="Unannualized return" />
              <StatCard label="Portfolio XIRR"
                value={summary.portfolio_xirr != null ? `${formatPercent(summary.portfolio_xirr)} p.a.` : "—"}
                delta={summary.portfolio_xirr != null ? "Annualized" : undefined}
                deltaPositive={(summary.portfolio_xirr ?? 0) >= 0}
                sub="Cashflow-weighted return" />
            </>
          )}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="panel empty-state" id="empty-state">
          <div className="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19V6a2 2 0 012-2h8l6 6v9a2 2 0 01-2 2H6a2 2 0 01-2-2z"/>
              <path d="M14 4v6h6M9 15h6M9 11h3"/>
            </svg>
          </div>
          <h3>Your ledger is empty</h3>
          <p>Add your first stock, fund, gold holding, deposit or crypto position to see your unified dashboard come alive.</p>
          <Link className="btn btn--primary" to="/holdings?add=1" style={{ margin: "0 auto" }}>Add your first investment</Link>
        </div>
      )}

      {/* Dashboard content */}
      {loaded && !isEmpty && (
        <div id="dashboard-content">
          <div className="dash-grid">
            <div>
              {/* Allocation */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <h2 className="panel__title">Asset allocation</h2>
                    <p className="panel__sub">Current value, split by asset type</p>
                  </div>
                </div>
                <div className="allocation-panel">
                  <div className="allocation-panel__chart">
                    <AllocationDonut allocationRows={allocation} />
                    <div className="allocation-panel__center">
                      <b className="num" id="allocation-total">{formatCompact(summary.total_current_value, currency)}</b>
                      <span>Total value</span>
                    </div>
                  </div>
                  <div className="legend" id="allocation-legend">
                    {allocation.map((row) => (
                      <div className="legend__row" key={row.asset_type}>
                        <span className="legend__swatch" style={{ background: PALETTE[row.asset_type] || PALETTE.other }} />
                        <span className="legend__name">{row.label}</span>
                        <span className="legend__pct">{row.percent}%</span>
                        <span className="legend__amt num">{formatCompact(row.value, currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Fee & tax */}
              <div className="panel">
                <div className="panel__head">
                  <div>
                    <h2 className="panel__title">Fees &amp; taxes</h2>
                    <p className="panel__sub">Cumulative cost of investing, across all holdings</p>
                  </div>
                </div>
                <div className="fee-tax-summary" id="fee-tax-summary">
                  <div className="fee-tax-summary__item">
                    <div className="stat-card__label">Total fees</div>
                    <div className="num">{formatCurrency(summary.total_fees, currency)}</div>
                  </div>
                  <div className="fee-tax-summary__item">
                    <div className="stat-card__label">Total taxes</div>
                    <div className="num">{formatCurrency(summary.total_taxes, currency)}</div>
                  </div>
                  <div className="fee-tax-summary__item">
                    <div className="stat-card__label">% of invested capital</div>
                    <div className="num">
                      {summary.total_invested > 0
                        ? (((summary.total_fees + summary.total_taxes) / summary.total_invested) * 100).toFixed(2)
                        : "0.00"}%
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              {/* Quick add */}
              <div className="panel">
                <div className="panel__head"><h2 className="panel__title">Quick add</h2></div>
                <div className="quick-add" id="quick-add">
                  {trackedTypes.map((key) => {
                    const t = ASSET_TYPES[key];
                    if (!t) return null;
                    return (
                      <Link key={key} className="quick-add__btn" to={`/holdings?add=1&type=${key}`}>
                        <ColorDot assetType={key} />
                        {t.label}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* Performers */}
              <div className="panel">
                <div className="panel__head"><h2 className="panel__title">Best &amp; worst performers</h2></div>
                <div id="performers-list">
                  {[...movers.gainers, ...movers.losers].length === 0 ? (
                    <p className="text-muted" style={{ color: "var(--paper-ink-soft)" }}>Not enough data yet.</p>
                  ) : (
                    [...movers.gainers, ...movers.losers].map((r) => (
                      <div className="perf-list__row" key={r.id}>
                        <span className="perf-list__name">
                          <span className={`seal seal--${r.asset_type}`}><i className="seal__dot" /></span>
                          {r.name}
                        </span>
                        <span className="perf-list__figures">
                          <span className={`num ${r.percent_return >= 0 ? "text-positive" : "text-negative"}`}>
                            {formatPercent(r.percent_return)}
                          </span>
                          <small>{formatCompact(r.absolute_return, currency)}</small>
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Recent holdings table */}
          <div className="panel">
            <div className="panel__head">
              <div>
                <h2 className="panel__title">Recent holdings</h2>
                <p className="panel__sub">Latest entries across your portfolio</p>
              </div>
              <Link className="btn btn--ghost-paper btn--sm" to="/holdings">View all holdings</Link>
            </div>
            <div className="table-scroll">
              <table className="ledger-table" id="recent-table">
                <thead>
                  <tr>
                    <th>Holding</th><th>Type</th>
                    <th className="num">Invested</th>
                    <th className="num">Current value</th>
                    <th className="num">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length === 0 ? (
                    <tr><td colSpan="5" className="text-muted">No holdings yet.</td></tr>
                  ) : recent.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className="cell-primary">{r.name}</span>
                        <span className="cell-sub">{r.identifier || r.platform || ""}</span>
                      </td>
                      <td><Seal assetType={r.asset_type} ASSET_TYPES={ASSET_TYPES} /></td>
                      <td className="num">{formatCurrency(r.invested_amount, currency)}</td>
                      <td className="num">{formatCurrency(r.current_value, currency)}</td>
                      <td className={`num ${r.absolute_return >= 0 ? "text-positive" : "text-negative"}`}>
                        <div>{formatPercent(r.percent_return)}</div>
                        <div style={{ fontSize: "var(--fs-2xs)", color: "var(--paper-ink-soft)" }}>
                          {r.xirr != null ? `${formatPercent(r.xirr)} XIRR` : (r.cagr != null ? `${formatPercent(r.cagr)} CAGR` : "")}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
