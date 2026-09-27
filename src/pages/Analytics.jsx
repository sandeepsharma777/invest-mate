import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "../components/DashboardLayout";
import StatCard from "../components/StatCard";
import { Seal } from "../components/Seal";
import { ReturnsBarChart, InvestedVsCurrentChart } from "../components/Charts";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { analytics, investments, ASSET_TYPES } from "../lib/db";
import { formatCurrency, formatPercent } from "../lib/utils";
import "../styles/analytics.css";

export default function Analytics() {
  const { user } = useAuth();
  const toast = useToast();
  const currency = user?.currency || "INR";

  const [returnsByAsset, setReturnsByAsset] = useState([]);
  const [movers, setMovers] = useState({ gainers: [], losers: [] });
  const [allRows, setAllRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      analytics.getReturnsByAsset(),
      analytics.getTopMovers(5),
      investments.list({ status: "active" }),
      analytics.getSummary(),
    ])
      .then(([rba, mov, rows, s]) => {
        setReturnsByAsset(rba);
        setMovers(mov);
        setAllRows(rows);
        setSummary(s);
        setLoaded(true);
      })
      .catch((err) => toast(err.message || "Couldn't load analytics.", "error"));
  }, [user, toast]);

  const isEmpty = loaded && summary?.holdings_count === 0;

  if (!loaded) return <DashboardLayout><div style={{ padding: "var(--sp-6)" }}>Loading…</div></DashboardLayout>;

  if (isEmpty) {
    return (
      <DashboardLayout>
        <div className="topbar">
          <div>
            <div className="topbar__eyebrow">Returns &amp; insight</div>
            <h1>Analytics</h1>
          </div>
        </div>
        <div className="panel empty-state">
          <div className="empty-state__icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19V9M11 19V4M18 19v-6"/></svg>
          </div>
          <h3>Nothing to analyze yet</h3>
          <p>Add a few holdings and your returns, allocation and top performers will show up here.</p>
          <Link className="btn btn--primary" to="/holdings?add=1" style={{ margin: "0 auto" }}>Add an investment</Link>
        </div>
      </DashboardLayout>
    );
  }

  // Insight banner
  const best = [...returnsByAsset].sort((a, b) => b.percent_return - a.percent_return)[0];
  const isGain = (summary?.absolute_return ?? 0) >= 0;

  // Table rows sorted by percent_return desc
  const sortedRows = [...allRows].sort((a, b) => b.percent_return - a.percent_return);

  function renderMovers(rows, isGainer) {
    if (!rows.length) {
      return <p style={{ color: "var(--paper-ink-soft)", fontSize: "var(--fs-sm)" }}>No {isGainer ? "gainers" : "losers"} yet.</p>;
    }
    return rows.map((r, i) => (
      <div className="rank-row" key={r.id}>
        <span className="rank-row__idx">{i + 1}</span>
        <span>
          <span className="rank-row__name">{r.name}</span>
          <span className="rank-row__sub">{ASSET_TYPES[r.asset_type]?.label || r.asset_type}</span>
        </span>
        <span className="rank-row__val">
          <span className={`num ${r.percent_return >= 0 ? "text-positive" : "text-negative"}`}>
            {formatPercent(r.percent_return)}
          </span>
        </span>
      </div>
    ));
  }

  return (
    <DashboardLayout>
      <div className="topbar">
        <div>
          <div className="topbar__eyebrow">Returns &amp; insight</div>
          <h1>Analytics</h1>
          <p className="topbar__sub">How each asset class and holding is performing, at a glance.</p>
        </div>
      </div>

      {/* Stat cards showing Absolute Return and XIRR side by side */}
      <div className="card-grid" id="analytics-stat-cards">
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
      </div>

      {/* Insight banner */}
      <div id="insight-banner-slot">
        <div className="insight-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a7 7 0 00-4 12.7V17a2 2 0 002 2h4a2 2 0 002-2v-2.3A7 7 0 0012 2z"/>
            <path d="M9.5 22h5"/>
          </svg>
          <p>
            Your portfolio is <strong>{isGain ? "up" : "down"} {formatPercent(summary.percent_return)}</strong> overall ({formatCurrency(summary.absolute_return, currency)})
            {summary.portfolio_xirr != null && (
              <> with an annualized <strong>XIRR of {formatPercent(summary.portfolio_xirr)} p.a.</strong></>
            )}
            {best && (
              <> — <strong>{best.label}</strong> is your strongest asset class at {formatPercent(best.percent_return)}.</>
            )}
          </p>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Returns by asset type</h2>
              <p className="panel__sub">Percentage return, aggregated per class</p>
            </div>
          </div>
          <div className="chart-box"><ReturnsBarChart returnsRows={returnsByAsset} /></div>
        </div>

        <div className="panel">
          <div className="panel__head">
            <div>
              <h2 className="panel__title">Invested vs. current value</h2>
              <p className="panel__sub">Cost basis compared with today's value</p>
            </div>
          </div>
          <div className="chart-box"><InvestedVsCurrentChart returnsRows={returnsByAsset} /></div>
        </div>
      </div>

      <div className="analytics-grid">
        <div className="panel">
          <div className="panel__head"><h2 className="panel__title">Top gainers</h2></div>
          <div id="gainers-list">{renderMovers(movers.gainers, true)}</div>
        </div>
        <div className="panel">
          <div className="panel__head"><h2 className="panel__title">Top losers</h2></div>
          <div id="losers-list">{renderMovers(movers.losers, false)}</div>
        </div>
      </div>

      <div className="panel">
        <div className="panel__head">
          <div>
            <h2 className="panel__title">Return by holding</h2>
            <p className="panel__sub">Every active position, ranked by percentage return</p>
          </div>
        </div>
        <div className="table-scroll">
          <table className="ledger-table" id="all-returns-table">
            <thead>
              <tr>
                <th>Holding</th><th>Type</th>
                <th className="num">Invested</th>
                <th className="num">Current value</th>
                <th className="num">Abs. return</th>
                <th className="num">% return</th>
                <th className="num">XIRR (ann.)</th>
                <th className="num">CAGR</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr><td colSpan="8" className="text-muted">No active holdings.</td></tr>
              ) : sortedRows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="cell-primary">{r.name}</span>
                    <span className="cell-sub">{r.identifier || ""}</span>
                  </td>
                  <td><Seal assetType={r.asset_type} ASSET_TYPES={ASSET_TYPES} /></td>
                  <td className="num">{formatCurrency(r.invested_amount, currency)}</td>
                  <td className="num">{formatCurrency(r.current_value, currency)}</td>
                  <td className={`num ${r.absolute_return >= 0 ? "text-positive" : "text-negative"}`}>{formatCurrency(r.absolute_return, currency)}</td>
                  <td className={`num ${r.percent_return >= 0 ? "text-positive" : "text-negative"}`}>{formatPercent(r.percent_return)}</td>
                  <td className={`num ${r.xirr != null && r.xirr >= 0 ? "text-positive" : r.xirr != null ? "text-negative" : "text-muted"}`}>
                    {r.xirr != null ? `${formatPercent(r.xirr)} p.a.` : "—"}
                  </td>
                  <td className={`num ${r.cagr != null && r.cagr >= 0 ? "text-positive" : r.cagr != null ? "text-negative" : "text-muted"}`}>
                    {r.cagr != null ? `${formatPercent(r.cagr)} p.a.` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
}
