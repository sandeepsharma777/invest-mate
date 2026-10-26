/**
 * InvestMate — Shared utilities (pure functions only; no DOM references).
 * DOM-specific helpers (toast, modal, sidebar) are handled in React via
 * context / state instead of direct DOM manipulation.
 */

export function getCurrencySymbol(currency = "INR") {
  const symbols = { INR: "₹", USD: "$", EUR: "€", GBP: "£" };
  return symbols[currency] || (currency ? currency + " " : "₹");
}

export function formatCurrency(amount, currency = "INR") {
  const symbol = getCurrencySymbol(currency);
  const n = Number(amount) || 0;
  const locale = currency === "INR" ? "en-IN" : "en-US";
  const formatted = Math.abs(n).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${n < 0 ? "-" : ""}${symbol}${formatted}`;
}

export function formatCompact(amount, currency = "INR") {
  const symbol = getCurrencySymbol(currency);
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  let out;
  if (currency === "INR") {
    if (abs >= 1e7) out = (abs / 1e7).toFixed(2) + "Cr";
    else if (abs >= 1e5) out = (abs / 1e5).toFixed(2) + "L";
    else if (abs >= 1e3) out = (abs / 1e3).toFixed(1) + "K";
    else out = abs.toFixed(2);
  } else {
    if (abs >= 1e9) out = (abs / 1e9).toFixed(2) + "B";
    else if (abs >= 1e6) out = (abs / 1e6).toFixed(2) + "M";
    else if (abs >= 1e3) out = (abs / 1e3).toFixed(1) + "K";
    else out = abs.toFixed(2);
  }
  return `${n < 0 ? "-" : ""}${symbol}${out}`;
}

export function formatPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (n > 9999) return ">9,999%";
  if (n < -9999) return "<-9,999%";
  const absFormatted = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${absFormatted}%`;
}

export function formatDate(dateStr) {
  if (!dateStr) return "—";
  if (typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
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
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/**
 * Safely converts any date representation (YYYY-MM-DD string, ISO string, timestamp)
 * into a valid YYYY-MM-DD string in local date format, without timezone shifting.
 * Guards against corrupted timestamps (like max JS date / year 275760).
 */
export function toInputDate(val, fallback = todayISO()) {
  if (!val) return fallback;
  if (typeof val === "string") {
    const match = val.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      if (y >= 1900 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${match[1]}-${match[2]}-${match[3]}`;
      }
    }
  }

  const num = val instanceof Date ? val.getTime() : Number(val);
  if (!Number.isNaN(num) && Number.isFinite(num)) {
    let ms = num;
    if (ms > 0 && ms < 1e11) {
      ms = ms * 1000;
    }
    // Safeguard against extreme values (like 8640000000000000 or year 275760)
    if (ms > 4102444800000 || ms < -62167219200000) {
      return fallback;
    }
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) {
      const off = d.getTimezoneOffset();
      const local = new Date(d.getTime() - off * 60000);
      const y = local.getUTCFullYear();
      if (y >= 1900 && y <= 2100) {
        return local.toISOString().slice(0, 10);
      }
    }
  }

  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return fallback;
  const year = d.getFullYear();
  if (year < 1900 || year > 2100) return fallback;
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

/**
 * Validates a historical/purchase date:
 * - Must be a valid date
 * - Must not be in the future (<= todayISO())
 * - Year must be between minYear (default 1990) and current year
 */
export function validatePastDate(dateStr, minYear = 1990) {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.trim()) {
    return { valid: false, error: "Date is required." };
  }
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { valid: false, error: "Please enter a valid date in YYYY-MM-DD format." };
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);

  const currentYear = new Date().getFullYear();
  if (y < minYear || y > currentYear) {
    return { valid: false, error: `Year must be between ${minYear} and ${currentYear}.` };
  }
  if (m < 1 || m > 12) {
    return { valid: false, error: "Invalid month." };
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) {
    return { valid: false, error: "Invalid day of month." };
  }

  const today = todayISO();
  if (dateStr > today) {
    return { valid: false, error: "Date cannot be in the future." };
  }

  return { valid: true, error: null };
}

/**
 * Validates a future/target date (e.g. for Goals):
 * - Optional: returns valid if empty
 * - If provided, must not be in the past
 * - Year must be between current year and maxYear (default 2100)
 */
export function validateTargetDate(dateStr, maxYear = 2100) {
  if (!dateStr || typeof dateStr !== "string" || !dateStr.trim()) {
    return { valid: true, error: null };
  }
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return { valid: false, error: "Please enter a valid date in YYYY-MM-DD format." };
  }
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);

  const currentYear = new Date().getFullYear();
  if (y < currentYear || y > maxYear) {
    return { valid: false, error: `Year must be between ${currentYear} and ${maxYear}.` };
  }
  if (m < 1 || m > 12) {
    return { valid: false, error: "Invalid month." };
  }
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d < 1 || d > daysInMonth) {
    return { valid: false, error: "Invalid day of month." };
  }

  const today = todayISO();
  if (dateStr < today) {
    return { valid: false, error: "Target date cannot be in the past." };
  }

  return { valid: true, error: null };
}

function parseDateMs(d) {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  }
  return new Date(d).getTime();
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
      date: parseDateMs(cf.date),
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

  const t0 = parseDateMs(startDate);
  const t1 = parseDateMs(endDate);
  if (Number.isNaN(t0) || Number.isNaN(t1) || t1 <= t0) return null;

  const years = (t1 - t0) / (1000 * 60 * 60 * 24 * 365.25);
  // Compound Annual Growth Rate is only defined/meaningful for holding periods of 1 year or more (365+ days)
  if (years < 1) return null;

  if (vt === 0) return -100;
  const cagr = (Math.pow(vt / v0, 1 / years) - 1) * 100;
  if (!Number.isFinite(cagr)) return null;
  return Math.round(cagr * 100) / 100;
}

/**
 * Shared holding metrics calculator across Dashboard, Holdings, Analytics, and Performers panel.
 * Always guarantees:
 *   gain = currentValue - invested
 *   returnPct = invested > 0 ? (gain / invested) * 100 : 0
 *
 * @param {object} holding
 * @returns {{ invested: number, currentValue: number, gain: number, returnPct: number }}
 */
export function getHoldingMetrics(holding) {
  if (!holding) {
    return { invested: 0, currentValue: 0, gain: 0, returnPct: 0 };
  }

  let invested = 0;
  let currentValue = 0;

  if (holding.invested_amount !== undefined && holding.current_value !== undefined) {
    invested = Number(holding.invested_amount) || 0;
    currentValue = Number(holding.current_value) || 0;
  } else {
    const qty = Number(holding.quantity) || 0;
    const pPrice = Number(holding.purchase_price) || 0;
    const cPrice = Number(
      holding.status === "sold" && holding.sold_price != null
        ? holding.sold_price
        : holding.current_price != null && holding.current_price !== ""
        ? holding.current_price
        : pPrice
    );
    invested = qty * pPrice;
    currentValue = qty * cPrice;
  }

  const gain = Math.round((currentValue - invested) * 100) / 100;
  const returnPct = invested > 0 ? Math.round(((gain / invested) * 100) * 100) / 100 : 0;

  return {
    invested: Math.round(invested * 100) / 100,
    currentValue: Math.round(currentValue * 100) / 100,
    gain,
    returnPct,
  };
}

/**
 * Prevents premature form submission on Enter in modal input fields.
 * Instead, advances focus to the next visible, enabled input/select/textarea in DOM order.
 * If on the last field, Enter will still not submit the form.
 * Forms should only be submitted when the user explicitly clicks the submit button.
 */
export function handleFormEnterKeyNavigation(e) {
  if (e.key !== "Enter") return;

  // Let multiline textarea handle Enter naturally (inserting a newline)
  if (e.target.tagName === "TEXTAREA") return;

  // If focus is directly on a button, allow Enter to activate the button
  if (e.target.tagName === "BUTTON") return;

  // Prevent default implicit form submission
  e.preventDefault();

  const form = e.currentTarget;
  if (!form) return;

  // Query all interactive input/select/textarea fields in DOM order
  const selector =
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([disabled]), select:not([disabled]), textarea:not([disabled])';
  const allElements = Array.from(form.querySelectorAll(selector));

  // Filter only visible elements
  const visibleElements = allElements.filter((el) => {
    return el.offsetParent !== null || el.getClientRects().length > 0;
  });

  const currentIndex = visibleElements.indexOf(e.target);

  if (e.shiftKey) {
    if (currentIndex > 0) {
      const prevEl = visibleElements[currentIndex - 1];
      prevEl.focus();
      if (
        typeof prevEl.select === "function" &&
        prevEl.tagName === "INPUT" &&
        !["date", "time", "checkbox", "radio", "color", "file", "range"].includes(prevEl.type)
      ) {
        prevEl.select();
      }
    }
    return;
  }

  if (currentIndex > -1 && currentIndex < visibleElements.length - 1) {
    const nextEl = visibleElements[currentIndex + 1];
    nextEl.focus();
    // For text/number inputs, also select text for quick editing
    if (
      typeof nextEl.select === "function" &&
      nextEl.tagName === "INPUT" &&
      !["date", "time", "checkbox", "radio", "color", "file", "range"].includes(nextEl.type)
    ) {
      nextEl.select();
    }
  }
}

