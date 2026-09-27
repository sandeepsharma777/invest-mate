/**
 * InvestMate — Shared utilities (pure functions only; no DOM references).
 * DOM-specific helpers (toast, modal, sidebar) are handled in React via
 * context / state instead of direct DOM manipulation.
 */

export function formatCurrency(amount, currency = "INR") {
  const symbols = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || currency + " ";
  const n = Number(amount) || 0;
  const formatted = Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${symbol}${formatted}`;
}

export function formatCompact(amount, currency = "INR") {
  const symbols = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
  const symbol = symbols[currency] || currency + " ";
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  let out;
  if (abs >= 1e7) out = (abs / 1e7).toFixed(2) + "Cr";
  else if (abs >= 1e5) out = (abs / 1e5).toFixed(2) + "L";
  else if (abs >= 1e3) out = (abs / 1e3).toFixed(1) + "K";
  else out = abs.toFixed(2);
  return `${n < 0 ? "-" : ""}${symbol}${out}`;
}

export function formatPercent(value) {
  const n = Number(value) || 0;
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calculates XIRR (Extended Internal Rate of Return) using Newton-Raphson
 * with a fallback bisection search.
 * @param {Array<{ date: string|Date, amount: number }>} cashflows
 * Cash outflows (buys/costs) should be negative, inflows (sells/current value) positive.
 * @returns {number|null} Annualized percentage (e.g. 14.25 for 14.25%) or null.
 */
export function calculateXIRR(cashflows, guess = 0.1) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) return null;

  const valid = cashflows
    .map((cf) => ({
      amount: Number(cf.amount) || 0,
      date: new Date(cf.date).getTime(),
    }))
    .filter((cf) => !Number.isNaN(cf.date) && Math.abs(cf.amount) > 1e-6);

  if (valid.length < 2) return null;

  const hasPositive = valid.some((cf) => cf.amount > 0);
  const hasNegative = valid.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  valid.sort((a, b) => a.date - b.date);
  const d0 = valid[0].date;
  const MS_PER_DAY = 1000 * 60 * 60 * 24;

  const times = valid.map((cf) => (cf.date - d0) / (MS_PER_DAY * 365));
  const maxT = times[times.length - 1];

  if (maxT < 1 / 365) {
    const totalOut = valid.filter((c) => c.amount < 0).reduce((acc, c) => acc + Math.abs(c.amount), 0);
    const totalIn = valid.filter((c) => c.amount > 0).reduce((acc, c) => acc + c.amount, 0);
    return totalOut > 0 ? Math.round(((totalIn - totalOut) / totalOut) * 100 * 100) / 100 : 0;
  }

  function f(r) {
    if (r <= -1) return Infinity;
    let sum = 0;
    for (let i = 0; i < valid.length; i++) {
      sum += valid[i].amount * Math.pow(1 + r, -times[i]);
    }
    return sum;
  }

  function df(r) {
    if (r <= -1) return 0;
    let sum = 0;
    for (let i = 0; i < valid.length; i++) {
      sum += -times[i] * valid[i].amount * Math.pow(1 + r, -times[i] - 1);
    }
    return sum;
  }

  let r = guess;
  const MAX_ITER = 100;
  const TOLERANCE = 1e-6;

  for (let i = 0; i < MAX_ITER; i++) {
    const y = f(r);
    if (Math.abs(y) < TOLERANCE) {
      return Math.round(r * 100 * 100) / 100;
    }
    const dy = df(r);
    if (Math.abs(dy) < 1e-12) break;

    const nextR = r - y / dy;
    if (nextR <= -0.999 || nextR > 100 || Number.isNaN(nextR)) {
      break;
    }
    if (Math.abs(nextR - r) < TOLERANCE) {
      return Math.round(nextR * 100 * 100) / 100;
    }
    r = nextR;
  }

  // Fallback: Bisection method
  let low = -0.999;
  let high = 10.0;
  let fLow = f(low);
  let fHigh = f(high);

  if (fLow * fHigh > 0) {
    high = 50.0;
    fHigh = f(high);
    if (fLow * fHigh > 0) {
      return null;
    }
  }

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const fMid = f(mid);
    if (Math.abs(fMid) < TOLERANCE || (high - low) / 2 < TOLERANCE) {
      return Math.round(mid * 100 * 100) / 100;
    }
    if ((fLow > 0 && fMid > 0) || (fLow < 0 && fMid < 0)) {
      low = mid;
      fLow = fMid;
    } else {
      high = mid;
      fHigh = fMid;
    }
  }

  return Math.round(((low + high) / 2) * 100 * 100) / 100;
}

/**
 * Calculates CAGR (Compound Annual Growth Rate) for positions with a single initial investment.
 * @param {number} initialValue
 * @param {number} finalValue
 * @param {string|Date} startDate
 * @param {string|Date} endDate
 * @returns {number|null} Annualized percentage or null
 */
export function calculateCAGR(initialValue, finalValue, startDate, endDate) {
  const v0 = Number(initialValue) || 0;
  const vt = Number(finalValue) || 0;
  if (v0 <= 0 || vt < 0) return null;

  const t0 = new Date(startDate).getTime();
  const t1 = new Date(endDate).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) return null;

  const years = (t1 - t0) / (1000 * 60 * 60 * 24 * 365.25);
  if (years < 1 / 365) return null;

  if (vt === 0) return -100;
  const cagr = (Math.pow(vt / v0, 1 / years) - 1) * 100;
  return Math.round(cagr * 100) / 100;
}
