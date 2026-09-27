/**
 * InvestMate — Data Layer (db.js)
 * Same schema, same localStorage keys, same async API as the original.
 * Every other module imports from this file rather than touching storage directly.
 */

import { calculateXIRR, calculateCAGR } from "./utils.js";

const DB_KEY = "investmate_db_v1";
const SESSION_KEY = "investmate_session_v1";
const SIM_LATENCY_MS = 120;

export const ASSET_TYPES = {
  stocks: {
    key: "stocks",
    label: "Stocks",
    unitLabel: "shares",
    description: "Equity shares on any exchange",
    fields: [
      { name: "exchange", label: "Exchange", type: "text", placeholder: "NSE, BSE, NASDAQ…" },
      { name: "sector", label: "Sector", type: "text", placeholder: "IT, Banking, Energy…" },
    ],
  },
  mutual_fund: {
    key: "mutual_fund",
    label: "Mutual Funds",
    unitLabel: "units",
    description: "SIP or lump-sum fund units",
    fields: [
      { name: "fund_type", label: "Fund type", type: "select", options: ["Equity", "Debt", "Hybrid", "Index", "ELSS"] },
      { name: "folio_number", label: "Folio number", type: "text", placeholder: "Optional" },
    ],
  },
  gold: {
    key: "gold",
    label: "Gold",
    unitLabel: "grams",
    description: "Physical, digital gold or SGBs",
    fields: [
      { name: "gold_form", label: "Form", type: "select", options: ["Physical", "Digital", "Sovereign Gold Bond", "ETF"] },
      { name: "purity", label: "Purity", type: "text", placeholder: "24K, 22K…" },
    ],
  },
  fixed_deposit: {
    key: "fixed_deposit",
    label: "Fixed Deposits",
    unitLabel: "deposit",
    description: "Bank or corporate FDs",
    fields: [
      { name: "bank_name", label: "Bank / Institution", type: "text", placeholder: "e.g. HDFC Bank" },
      { name: "interest_rate", label: "Interest rate (% p.a.)", type: "number", step: "0.01" },
      { name: "maturity_date", label: "Maturity date", type: "date" },
      { name: "compounding", label: "Compounding", type: "select", options: ["Simple", "Quarterly", "Annually", "Cumulative"] },
    ],
  },
  crypto: {
    key: "crypto",
    label: "Cryptocurrency",
    unitLabel: "coins",
    description: "Any coin or token, any wallet",
    fields: [
      { name: "exchange_wallet", label: "Exchange / Wallet", type: "text", placeholder: "Binance, Ledger…" },
      { name: "network", label: "Network", type: "text", placeholder: "Optional" },
    ],
  },
  other: {
    key: "other",
    label: "Other",
    unitLabel: "units",
    description: "Bonds, real estate, PF, anything else",
    fields: [
      { name: "category_note", label: "Category", type: "text", placeholder: "Bond, REIT, PPF…" },
    ],
  },
};

// ── Low-level helpers ──────────────────────────────────────────────────────

function readDB() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    const seed = { users: [], investments: [], transactions: [], _seq: { users: 0, investments: 0, transactions: 0 } };
    localStorage.setItem(DB_KEY, JSON.stringify(seed));
    return seed;
  }
  const parsed = JSON.parse(raw);
  return migrateDB(parsed);
}

function writeDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function nextId(db, table) {
  db._seq[table] = (db._seq[table] || 0) + 1;
  return `${table.slice(0, 3)}_${db._seq[table]}`;
}

function delay(value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIM_LATENCY_MS));
}

function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function migrateDB(db) {
  let modified = false;
  if (!db) return db;
  if (!Array.isArray(db.investments)) db.investments = [];
  if (!Array.isArray(db.goals)) { db.goals = []; modified = true; }
  if (!Array.isArray(db.alerts)) { db.alerts = []; modified = true; }
  if (!db._seq) db._seq = { users: 0, investments: 0, transactions: 0, income: 0, goals: 0, alerts: 0 };
  if (db._seq.transactions === undefined) db._seq.transactions = 0;
  if (db._seq.income === undefined) db._seq.income = 0;
  if (db._seq.goals === undefined) db._seq.goals = 0;
  if (db._seq.alerts === undefined) db._seq.alerts = 0;

  for (const inv of db.investments) {
    if (!Array.isArray(inv.transactions) || inv.transactions.length === 0) {
      inv.transactions = [];
      const qty = Number(inv.quantity) || 1;
      const price = Number(inv.purchase_price) || 0;
      const fees = (Number(inv.fees_paid) || 0) + (Number(inv.taxes_paid) || 0);
      const buyDate = inv.purchase_date || (inv.created_at ? inv.created_at.slice(0, 10) : todayISO());

      db._seq.transactions = (db._seq.transactions || 0) + 1;
      inv.transactions.push({
        id: `tx_${db._seq.transactions}`,
        type: "buy",
        date: buyDate,
        quantity: qty,
        pricePerUnit: price,
        fees: fees,
      });

      if (inv.status === "sold" && inv.sold_price != null) {
        db._seq.transactions = (db._seq.transactions || 0) + 1;
        inv.transactions.push({
          id: `tx_${db._seq.transactions}`,
          type: "sell",
          date: inv.sold_date || todayISO(),
          quantity: qty,
          pricePerUnit: Number(inv.sold_price),
          fees: 0,
        });
      }
      modified = true;
    }

    if (!Array.isArray(inv.income)) {
      inv.income = [];
      modified = true;
    }
  }

  if (modified) {
    writeDB(db);
  }
  return db;
}

function mockHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (h << 5) - h + str.charCodeAt(i); h |= 0; }
  return `h_${Math.abs(h)}`;
}

function getSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

function setSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: userId, issued_at: nowISO() }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function sanitizeUser(user) {
  if (!user) return null;
  const { password_hash: _password_hash, ...safe } = user;
  return safe;
}

function requireAuth(db) {
  const session = getSession();
  if (!session) throw new ApiError("UNAUTHENTICATED", "No active session.");
  const user = db.users.find((u) => u.id === session.user_id);
  if (!user) throw new ApiError("UNAUTHENTICATED", "Session user not found.");
  return user;
}

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ── AUTH ───────────────────────────────────────────────────────────────────

export const auth = {
  async signup({ name, email, password, tracked_asset_types, currency }) {
    const db = readDB();
    email = String(email || "").trim().toLowerCase();
    if (!name || !email || !password) throw new ApiError("VALIDATION", "Name, email and password are required.");
    if (password.length < 6) throw new ApiError("VALIDATION", "Password must be at least 6 characters.");
    if (db.users.some((u) => u.email === email)) throw new ApiError("CONFLICT", "An account with this email already exists.");

    const user = {
      id: nextId(db, "users"),
      name: name.trim(),
      email,
      password_hash: mockHash(password),
      currency: currency || "INR",
      tracked_asset_types: tracked_asset_types && tracked_asset_types.length ? tracked_asset_types : Object.keys(ASSET_TYPES).slice(0, 3),
      created_at: nowISO(),
    };
    db.users.push(user);
    writeDB(db);
    setSession(user.id);
    return delay(sanitizeUser(user));
  },

  async login({ email, password }) {
    const db = readDB();
    email = String(email || "").trim().toLowerCase();
    const user = db.users.find((u) => u.email === email);
    if (!user || user.password_hash !== mockHash(password)) {
      throw new ApiError("INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    setSession(user.id);
    return delay(sanitizeUser(user));
  },

  async logout() {
    clearSession();
    return delay({ ok: true });
  },

  async getCurrentUser() {
    const session = getSession();
    if (!session) return delay(null);
    const db = readDB();
    const user = db.users.find((u) => u.id === session.user_id);
    return delay(sanitizeUser(user || null));
  },

  async updateTrackedAssetTypes(types) {
    const db = readDB();
    const user = requireAuth(db);
    user.tracked_asset_types = types;
    writeDB(db);
    return delay(sanitizeUser(user));
  },

  isAuthenticated() {
    return !!getSession();
  },
};

// ── INVESTMENTS ────────────────────────────────────────────────────────────

export const investments = {
  async list(filters = {}) {
    const db = readDB();
    const user = requireAuth(db);
    let rows = db.investments.filter((i) => i.user_id === user.id);

    if (filters.asset_type && filters.asset_type !== "all") {
      rows = rows.filter((i) => i.asset_type === filters.asset_type);
    }
    if (filters.status) {
      rows = rows.filter((i) => i.status === filters.status);
    }
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((i) =>
        i.name.toLowerCase().includes(q) ||
        (i.identifier || "").toLowerCase().includes(q) ||
        (i.platform || "").toLowerCase().includes(q)
      );
    }
    return delay(rows.map(computeHoldingMetrics).sort((a, b) => b.created_at.localeCompare(a.created_at)));
  },

  async get(id) {
    const db = readDB();
    const user = requireAuth(db);
    const row = db.investments.find((i) => i.id === id && i.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Investment not found.");
    return delay(computeHoldingMetrics(row));
  },

  async create(payload) {
    const db = readDB();
    const user = requireAuth(db);
    validateHoldingPayload(payload);

    const feesPaid = Number(payload.fees_paid) || 0;
    const taxesPaid = Number(payload.taxes_paid) || 0;
    const qty = Number(payload.quantity);
    const purchasePrice = Number(payload.purchase_price);

    const tx = {
      id: nextId(db, "transactions"),
      type: "buy",
      date: payload.purchase_date || todayISO(),
      quantity: qty,
      pricePerUnit: purchasePrice,
      fees: feesPaid + taxesPaid,
    };

    const row = {
      id: nextId(db, "investments"),
      user_id: user.id,
      asset_type: payload.asset_type,
      name: payload.name.trim(),
      identifier: payload.identifier || "",
      unit: ASSET_TYPES[payload.asset_type]?.unitLabel || "units",
      quantity: qty,
      purchase_price: purchasePrice,
      purchase_date: payload.purchase_date || todayISO(),
      fees_paid: feesPaid,
      taxes_paid: taxesPaid,
      current_price: payload.current_price !== "" && payload.current_price != null ? Number(payload.current_price) : purchasePrice,
      current_price_updated_at: nowISO(),
      platform: payload.platform || "",
      notes: payload.notes || "",
      status: "active",
      sold_price: null,
      sold_date: null,
      type_fields: payload.type_fields || {},
      transactions: [tx],
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    db.investments.push(row);
    writeDB(db);
    return delay(computeHoldingMetrics(row));
  },

  async update(id, payload) {
    const db = readDB();
    const user = requireAuth(db);
    const row = db.investments.find((i) => i.id === id && i.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Investment not found.");
    validateHoldingPayload(payload, true);

    if (!Array.isArray(row.transactions)) {
      row.transactions = [];
    }

    if (payload.fees_paid !== undefined) row.fees_paid = Number(payload.fees_paid) || 0;
    if (payload.taxes_paid !== undefined) row.taxes_paid = Number(payload.taxes_paid) || 0;
    if (payload.purchase_date !== undefined) row.purchase_date = payload.purchase_date;

    // If holding only has 1 buy transaction and user edited quantity/price/fees/date in edit modal:
    if (row.transactions.length === 1 && row.transactions[0].type === "buy") {
      const initialTx = row.transactions[0];
      if (payload.quantity != null) {
        initialTx.quantity = Number(payload.quantity);
        row.quantity = Number(payload.quantity);
      }
      if (payload.purchase_price != null) {
        initialTx.pricePerUnit = Number(payload.purchase_price);
        row.purchase_price = Number(payload.purchase_price);
      }
      if (payload.purchase_date != null) {
        initialTx.date = payload.purchase_date;
      }
      if (payload.fees_paid != null || payload.taxes_paid != null) {
        initialTx.fees = (Number(payload.fees_paid != null ? payload.fees_paid : row.fees_paid) || 0) +
                         (Number(payload.taxes_paid != null ? payload.taxes_paid : row.taxes_paid) || 0);
      }
    }

    Object.assign(row, {
      asset_type: payload.asset_type ?? row.asset_type,
      name: payload.name?.trim() ?? row.name,
      identifier: payload.identifier ?? row.identifier,
      unit: ASSET_TYPES[payload.asset_type ?? row.asset_type]?.unitLabel || row.unit,
      current_price: payload.current_price != null && payload.current_price !== "" ? Number(payload.current_price) : row.current_price,
      current_price_updated_at: payload.current_price != null ? nowISO() : row.current_price_updated_at,
      platform: payload.platform ?? row.platform,
      notes: payload.notes ?? row.notes,
      type_fields: payload.type_fields ?? row.type_fields,
      updated_at: nowISO(),
    });

    writeDB(db);
    return delay(computeHoldingMetrics(row));
  },

  async addTransaction(id, txData) {
    const db = readDB();
    const user = requireAuth(db);
    const row = db.investments.find((i) => i.id === id && i.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Investment not found.");

    if (!Array.isArray(row.transactions)) {
      row.transactions = [];
    }

    const qty = Number(txData.quantity);
    const price = Number(txData.pricePerUnit);
    const fees = Number(txData.fees || 0);

    if (!qty || qty <= 0) throw new ApiError("VALIDATION", "Quantity must be greater than zero.");
    if (price < 0 || Number.isNaN(price)) throw new ApiError("VALIDATION", "Price per unit cannot be negative.");
    if (!txData.date) throw new ApiError("VALIDATION", "Transaction date is required.");
    if (!["buy", "sell"].includes(txData.type)) throw new ApiError("VALIDATION", "Transaction type must be 'buy' or 'sell'.");

    if (txData.type === "sell") {
      const current = computeHoldingMetrics(row);
      if (qty > current.quantity) {
        throw new ApiError("VALIDATION", `Cannot sell ${qty} units. You currently hold ${current.quantity} units.`);
      }
    }

    const tx = {
      id: nextId(db, "transactions"),
      type: txData.type,
      date: txData.date,
      quantity: qty,
      pricePerUnit: price,
      fees: fees,
    };

    row.transactions.push(tx);
    row.updated_at = nowISO();

    const updated = computeHoldingMetrics(row);
    row.status = updated.status;
    if (txData.type === "sell") {
      row.sold_price = price;
      row.sold_date = txData.date;
    }

    writeDB(db);
    return delay(updated);
  },

  async deleteTransaction(id, txId) {
    const db = readDB();
    const user = requireAuth(db);
    const row = db.investments.find((i) => i.id === id && i.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Investment not found.");

    if (!Array.isArray(row.transactions)) {
      throw new ApiError("NOT_FOUND", "Transaction not found.");
    }

    const idx = row.transactions.findIndex((t) => t.id === txId);
    if (idx === -1) throw new ApiError("NOT_FOUND", "Transaction not found.");

    row.transactions.splice(idx, 1);
    row.updated_at = nowISO();

    const updated = computeHoldingMetrics(row);
    row.status = updated.status;

    writeDB(db);
    return delay(updated);
  },

  async markSold(id, { sold_price, sold_date, quantity, fees }) {
    const db = readDB();
    const user = requireAuth(db);
    const row = db.investments.find((i) => i.id === id && i.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Investment not found.");

    const current = computeHoldingMetrics(row);
    const qtyToSell = quantity != null && Number(quantity) > 0 ? Number(quantity) : current.quantity;

    if (qtyToSell <= 0) throw new ApiError("VALIDATION", "Holding has no units available to sell.");
    if (qtyToSell > current.quantity) {
      throw new ApiError("VALIDATION", `Cannot sell ${qtyToSell} units. You currently hold ${current.quantity} units.`);
    }

    const tx = {
      id: nextId(db, "transactions"),
      type: "sell",
      date: sold_date || todayISO(),
      quantity: qtyToSell,
      pricePerUnit: Number(sold_price),
      fees: Number(fees) || 0,
    };

    if (!Array.isArray(row.transactions)) {
      row.transactions = [];
    }
    row.transactions.push(tx);
    row.sold_price = Number(sold_price);
    row.sold_date = sold_date || todayISO();
    row.updated_at = nowISO();

    const updated = computeHoldingMetrics(row);
    row.status = updated.status;

    writeDB(db);
    return delay(updated);
  },

  async addIncome(id, { type, date, amount, notes }) {
    const db = readDB();
    const user = requireAuth(db);
    const row = db.investments.find((i) => i.id === id && i.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Investment not found.");

    if (!type || (type !== "dividend" && type !== "interest")) {
      throw new ApiError("VALIDATION", "Income type must be 'dividend' or 'interest'.");
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      throw new ApiError("VALIDATION", "Income amount must be greater than zero.");
    }

    if (!Array.isArray(row.income)) {
      row.income = [];
    }

    const incomeEntry = {
      id: nextId(db, "income"),
      type,
      date: date || todayISO(),
      amount: round2(amt),
      notes: notes ? String(notes).trim() : "",
    };

    row.income.push(incomeEntry);
    row.updated_at = nowISO();

    writeDB(db);
    return delay(computeHoldingMetrics(row));
  },

  async deleteIncome(id, incomeId) {
    const db = readDB();
    const user = requireAuth(db);
    const row = db.investments.find((i) => i.id === id && i.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Investment not found.");

    if (!Array.isArray(row.income)) {
      throw new ApiError("NOT_FOUND", "Income entry not found.");
    }

    const idx = row.income.findIndex((inc) => inc.id === incomeId);
    if (idx === -1) throw new ApiError("NOT_FOUND", "Income entry not found.");

    row.income.splice(idx, 1);
    row.updated_at = nowISO();

    writeDB(db);
    return delay(computeHoldingMetrics(row));
  },

  async remove(id) {
    const db = readDB();
    const user = requireAuth(db);
    const idx = db.investments.findIndex((i) => i.id === id && i.user_id === user.id);
    if (idx === -1) throw new ApiError("NOT_FOUND", "Investment not found.");
    db.investments.splice(idx, 1);
    writeDB(db);
    return delay({ ok: true });
  },
};

function validateHoldingPayload(p, partial = false) {
  if (!partial || p.asset_type !== undefined) {
    if (!p.asset_type || !ASSET_TYPES[p.asset_type]) throw new ApiError("VALIDATION", "A valid asset type is required.");
  }
  if (!partial || p.name !== undefined) {
    if (!p.name || !p.name.trim()) throw new ApiError("VALIDATION", "Name is required.");
  }
  if (!partial || p.quantity !== undefined) {
    if (p.quantity == null || Number(p.quantity) <= 0) throw new ApiError("VALIDATION", "Quantity must be greater than zero.");
  }
  if (!partial || p.purchase_price !== undefined) {
    if (p.purchase_price == null || Number(p.purchase_price) < 0) throw new ApiError("VALIDATION", "Purchase price must be zero or more.");
  }
  if (!partial || p.purchase_date !== undefined) {
    if (!p.purchase_date) throw new ApiError("VALIDATION", "Purchase date is required.");
  }
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function round4(n) {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function computeHoldingMetrics(row) {
  const txs = Array.isArray(row.transactions)
    ? [...row.transactions].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];

  let currentQty = 0;
  let currentAvgCost = 0;
  let totalRealizedPnl = 0;
  let totalFees = 0;
  let totalBuyCost = 0;
  let totalBuyQty = 0;
  let totalSellQty = 0;
  let totalSellProceeds = 0;

  for (const tx of txs) {
    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.pricePerUnit) || 0;
    const fees = Number(tx.fees) || 0;
    totalFees += fees;

    if (tx.type === "buy") {
      const buyTotal = (qty * price) + fees;
      totalBuyCost += buyTotal;
      totalBuyQty += qty;
      if (currentQty + qty > 0) {
        currentAvgCost = ((currentQty * currentAvgCost) + buyTotal) / (currentQty + qty);
      } else {
        currentAvgCost = price;
      }
      currentQty += qty;
    } else if (tx.type === "sell") {
      totalSellQty += qty;
      const netSellProceeds = (qty * price) - fees;
      totalSellProceeds += netSellProceeds;
      const soldQty = Math.min(qty, currentQty);
      const costBasis = soldQty * currentAvgCost;
      totalRealizedPnl += (netSellProceeds - costBasis);
      currentQty = Math.max(0, currentQty - qty);
    }
  }

  const isSold = totalBuyQty > 0 && currentQty === 0;
  const status = isSold ? "sold" : (row.status === "sold" && currentQty === 0 ? "sold" : "active");
  const effectivePrice = Number(row.current_price != null && row.current_price !== "" ? row.current_price : currentAvgCost);
  const investedAmount = currentQty > 0 ? (currentQty * currentAvgCost) : 0;
  const currentValue = currentQty * effectivePrice;

  // Process income (dividends and interest)
  const incomeEntries = Array.isArray(row.income)
    ? [...row.income].sort((a, b) => (a.date || "").localeCompare(b.date || ""))
    : [];
  let totalIncome = 0;
  let totalDividends = 0;
  let totalInterest = 0;
  for (const inc of incomeEntries) {
    const amt = Number(inc.amount) || 0;
    totalIncome += amt;
    if (inc.type === "dividend") totalDividends += amt;
    else if (inc.type === "interest") totalInterest += amt;
  }

  // Absolute return is unrealized return on open shares + realized gains on closed shares + income received
  const unrealizedReturn = currentValue - investedAmount;
  const absoluteReturn = unrealizedReturn + totalRealizedPnl + totalIncome;

  const costBasisForReturn = totalBuyCost > 0 ? totalBuyCost : investedAmount;
  const percentReturn = costBasisForReturn > 0 ? (absoluteReturn / costBasisForReturn) * 100 : 0;

  // Build cashflows for XIRR
  const cashflows = [];
  for (const tx of txs) {
    const q = Number(tx.quantity) || 0;
    const p = Number(tx.pricePerUnit) || 0;
    const f = Number(tx.fees) || 0;
    if (tx.type === "buy") {
      cashflows.push({ amount: -(q * p + f), date: tx.date });
    } else if (tx.type === "sell") {
      cashflows.push({ amount: +(q * p - f), date: tx.date });
    }
  }
  // Dividends and interest count as positive cash inflows at their dates
  for (const inc of incomeEntries) {
    const amt = Number(inc.amount) || 0;
    if (amt > 0) {
      cashflows.push({ amount: +amt, date: inc.date || todayISO() });
    }
  }
  if (currentQty > 0 && currentValue > 0) {
    cashflows.push({ amount: currentValue, date: todayISO() });
  }

  const xirr = calculateXIRR(cashflows);

  // Simple CAGR for holdings held over the same period, without interim buys/sells
  let cagr = null;
  const buys = txs.filter((t) => t.type === "buy");
  const sells = txs.filter((t) => t.type === "sell");
  if (buys.length === 1 && sells.length === 0 && currentQty > 0 && incomeEntries.length === 0) {
    const initialCost = (Number(buys[0].quantity) * Number(buys[0].pricePerUnit)) + (Number(buys[0].fees) || 0);
    cagr = calculateCAGR(initialCost, currentValue, buys[0].date, todayISO());
  } else if (buys.length === 1 && sells.length === 1 && currentQty === 0 && incomeEntries.length === 0) {
    const initialCost = (Number(buys[0].quantity) * Number(buys[0].pricePerUnit)) + (Number(buys[0].fees) || 0);
    const finalProceeds = (Number(sells[0].quantity) * Number(sells[0].pricePerUnit)) - (Number(sells[0].fees) || 0);
    cagr = calculateCAGR(initialCost, finalProceeds, buys[0].date, sells[0].date);
  }

  return {
    ...row,
    quantity: round4(currentQty),
    purchase_price: round2(currentAvgCost),
    invested_amount: round2(investedAmount),
    current_value: round2(currentValue),
    fees_paid: round2(totalFees),
    taxes_paid: Number(row.taxes_paid) || 0,
    realized_gain: round2(totalRealizedPnl),
    absolute_return: round2(absoluteReturn),
    percent_return: round2(percentReturn),
    total_income: round2(totalIncome),
    total_dividends: round2(totalDividends),
    total_interest: round2(totalInterest),
    income: incomeEntries,
    xirr: xirr != null ? round2(xirr) : null,
    cagr: cagr != null ? round2(cagr) : null,
    status,
    total_buy_qty: round4(totalBuyQty),
    total_sell_qty: round4(totalSellQty),
    transactions: txs,
  };
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────

export const analytics = {
  async getSummary() {
    const db = readDB();
    const user = requireAuth(db);
    const activeRows = await investments.list({ status: "active" });
    const allUserHoldings = db.investments.filter((i) => i.user_id === user.id);

    const totals = activeRows.reduce(
      (acc, r) => {
        acc.invested += r.invested_amount;
        acc.current += r.current_value;
        return acc;
      },
      { invested: 0, current: 0 }
    );

    let totalFees = 0;
    let totalTaxes = 0;
    let totalIncome = 0;
    let totalDividends = 0;
    let totalInterest = 0;
    let combinedAbsoluteReturn = 0;

    for (const h of allUserHoldings) {
      const hm = computeHoldingMetrics(h);
      totalFees += hm.fees_paid || 0;
      totalTaxes += hm.taxes_paid || 0;
      totalIncome += hm.total_income || 0;
      totalDividends += hm.total_dividends || 0;
      totalInterest += hm.total_interest || 0;
      combinedAbsoluteReturn += hm.absolute_return || 0;
    }

    // Build portfolio cashflows across all holdings
    const portfolioCashflows = [];
    for (const h of allUserHoldings) {
      const txs = Array.isArray(h.transactions) ? h.transactions : [];
      for (const tx of txs) {
        const q = Number(tx.quantity) || 0;
        const p = Number(tx.pricePerUnit) || 0;
        const f = Number(tx.fees) || 0;
        if (tx.type === "buy") {
          portfolioCashflows.push({ amount: -(q * p + f), date: tx.date });
        } else if (tx.type === "sell") {
          portfolioCashflows.push({ amount: +(q * p - f), date: tx.date });
        }
      }
      const incs = Array.isArray(h.income) ? h.income : [];
      for (const inc of incs) {
        const amt = Number(inc.amount) || 0;
        if (amt > 0) {
          portfolioCashflows.push({ amount: +amt, date: inc.date || todayISO() });
        }
      }
    }
    if (totals.current > 0) {
      portfolioCashflows.push({ amount: totals.current, date: todayISO() });
    }

    const portfolioXirr = calculateXIRR(portfolioCashflows);
    const percentReturn = totals.invested > 0 ? (combinedAbsoluteReturn / totals.invested) * 100 : 0;

    return delay({
      total_invested: round2(totals.invested),
      total_current_value: round2(totals.current),
      absolute_return: round2(combinedAbsoluteReturn),
      percent_return: round2(percentReturn),
      portfolio_xirr: portfolioXirr != null ? round2(portfolioXirr) : null,
      total_fees: round2(totalFees),
      total_taxes: round2(totalTaxes),
      total_income: round2(totalIncome),
      total_dividends: round2(totalDividends),
      total_interest: round2(totalInterest),
      holdings_count: activeRows.length,
    });
  },

  async getAllocation() {
    const rows = await investments.list({ status: "active" });
    const byType = {};
    rows.forEach((r) => {
      byType[r.asset_type] = (byType[r.asset_type] || 0) + r.current_value;
    });
    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    return delay(
      Object.entries(byType)
        .map(([asset_type, value]) => ({
          asset_type,
          label: ASSET_TYPES[asset_type]?.label || asset_type,
          value: round2(value),
          percent: total > 0 ? round2((value / total) * 100) : 0,
        }))
        .sort((a, b) => b.value - a.value)
    );
  },

  async getReturnsByAsset() {
    const rows = await investments.list({ status: "active" });
    const byType = {};
    rows.forEach((r) => {
      if (!byType[r.asset_type]) byType[r.asset_type] = { asset_type: r.asset_type, label: ASSET_TYPES[r.asset_type]?.label || r.asset_type, invested: 0, current: 0 };
      byType[r.asset_type].invested += r.invested_amount;
      byType[r.asset_type].current += r.current_value;
    });
    return delay(
      Object.values(byType).map((t) => ({
        ...t,
        invested: round2(t.invested),
        current: round2(t.current),
        absolute_return: round2(t.current - t.invested),
        percent_return: t.invested > 0 ? round2(((t.current - t.invested) / t.invested) * 100) : 0,
      }))
    );
  },

  async getTopMovers(limit = 5) {
    const rows = await investments.list({ status: "active" });
    const sorted = [...rows].sort((a, b) => b.percent_return - a.percent_return);
    return delay({
      gainers: sorted.filter((r) => r.percent_return > 0).slice(0, limit),
      losers: sorted.filter((r) => r.percent_return < 0).slice(-limit).reverse(),
    });
  },

  async getTargetAllocation() {
    const db = readDB();
    const user = requireAuth(db);
    const rows = await investments.list({ status: "active" });
    const activeTypes = Array.from(new Set(rows.map((r) => r.asset_type)));

    if (user.target_allocation && typeof user.target_allocation === "object" && Object.keys(user.target_allocation).length > 0) {
      return delay({ ...user.target_allocation });
    }

    // Sensible default based on holdings or tracked types
    const defaultMap = {};
    if (activeTypes.includes("stocks") && activeTypes.includes("mutual_fund")) {
      defaultMap["stocks"] = 40;
      defaultMap["mutual_fund"] = 30;
      if (activeTypes.includes("gold")) defaultMap["gold"] = 15;
      if (activeTypes.includes("fixed_deposit")) defaultMap["fixed_deposit"] = 15;
      if (activeTypes.includes("crypto")) defaultMap["crypto"] = 5;
      const currentSum = Object.values(defaultMap).reduce((a, b) => a + b, 0);
      if (currentSum !== 100 && defaultMap["stocks"]) {
        defaultMap["stocks"] += (100 - currentSum);
      }
    } else if (activeTypes.length > 0) {
      const share = Math.floor(100 / activeTypes.length);
      activeTypes.forEach((t, idx) => {
        defaultMap[t] = idx === 0 ? 100 - share * (activeTypes.length - 1) : share;
      });
    } else {
      defaultMap["stocks"] = 50;
      defaultMap["mutual_fund"] = 25;
      defaultMap["gold"] = 15;
      defaultMap["fixed_deposit"] = 10;
    }
    return delay(defaultMap);
  },

  async saveTargetAllocation(targetMap) {
    const db = readDB();
    const user = requireAuth(db);

    let total = 0;
    const cleanMap = {};
    for (const [key, val] of Object.entries(targetMap)) {
      const num = Math.max(0, Number(val) || 0);
      cleanMap[key] = round2(num);
      total += num;
    }

    if (Math.abs(total - 100) > 0.5) {
      throw new ApiError("VALIDATION", `Target allocations must sum to 100% (currently ${round2(total)}%).`);
    }

    // Adjust slight float rounding difference to first key
    const diff = round2(100 - total);
    const firstKey = Object.keys(cleanMap)[0];
    if (diff !== 0 && firstKey) {
      cleanMap[firstKey] = round2(cleanMap[firstKey] + diff);
    }

    user.target_allocation = cleanMap;
    writeDB(db);
    return delay(cleanMap);
  },

  async getRebalancingPlan() {
    const rows = await investments.list({ status: "active" });
    const targetMap = await analytics.getTargetAllocation();

    const currentByAsset = {};
    let totalPortfolioValue = 0;
    for (const r of rows) {
      currentByAsset[r.asset_type] = (currentByAsset[r.asset_type] || 0) + (r.current_value || 0);
      totalPortfolioValue += (r.current_value || 0);
    }

    const allAssetTypes = Array.from(new Set([...Object.keys(targetMap), ...Object.keys(currentByAsset)]));

    const items = allAssetTypes.map((type) => {
      const currentValue = round2(currentByAsset[type] || 0);
      const currentPercent = totalPortfolioValue > 0 ? round2((currentValue / totalPortfolioValue) * 100) : 0;
      const targetPercent = round2(Number(targetMap[type]) || 0);
      const targetValue = round2(totalPortfolioValue * (targetPercent / 100));
      const diffPercent = round2(currentPercent - targetPercent);
      const diffValue = round2(currentValue - targetValue);

      let status = "balanced";
      let action = "hold";
      if (diffPercent > 1.0) {
        status = "overweight";
        action = "trim";
      } else if (diffPercent < -1.0) {
        status = "underweight";
        action = "buy";
      }

      return {
        asset_type: type,
        label: ASSET_TYPES[type]?.label || type,
        current_value: currentValue,
        current_percent: currentPercent,
        target_percent: targetPercent,
        target_value: targetValue,
        diff_percent: diffPercent,
        diff_value: diffValue,
        status,
        action,
        suggested_amount: round2(Math.abs(diffValue)),
      };
    });

    const totalDrift = round2(items.reduce((acc, it) => acc + Math.abs(it.diff_percent), 0) / 2);
    const healthScore = Math.max(0, Math.min(100, Math.round(100 - totalDrift * 1.5)));

    let healthStatus = "Optimal Alignment";
    if (healthScore < 70) healthStatus = "High Rebalance Urgency";
    else if (healthScore < 85) healthStatus = "Moderate Portfolio Drift";

    const suggestions = [];
    const buys = items.filter((it) => it.action === "buy" && it.suggested_amount > 50).sort((a, b) => b.suggested_amount - a.suggested_amount);
    const trims = items.filter((it) => it.action === "trim" && it.suggested_amount > 50).sort((a, b) => b.suggested_amount - a.suggested_amount);

    for (const b of buys) {
      suggestions.push({
        type: "buy",
        asset_type: b.asset_type,
        label: b.label,
        amount: b.suggested_amount,
        target_percent: b.target_percent,
        current_percent: b.current_percent,
      });
    }
    for (const t of trims) {
      suggestions.push({
        type: "trim",
        asset_type: t.asset_type,
        label: t.label,
        amount: t.suggested_amount,
        target_percent: t.target_percent,
        current_percent: t.current_percent,
      });
    }

    return delay({
      total_portfolio_value: round2(totalPortfolioValue),
      items: items.sort((a, b) => b.current_value - a.current_value),
      health_score: healthScore,
      health_status: healthStatus,
      total_drift: totalDrift,
      suggestions,
      target_allocation: targetMap,
    });
  },
};

// ── GOALS ──────────────────────────────────────────────────────────────────

export const goals = {
  async list() {
    const db = readDB();
    const user = requireAuth(db);
    const userGoals = (db.goals || [])
      .filter((g) => g.user_id === user.id)
      .sort((a, b) => {
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return a.target_date.localeCompare(b.target_date);
      });
    return delay(userGoals);
  },

  async create(payload) {
    const db = readDB();
    const user = requireAuth(db);
    const name = String(payload.name || "").trim();
    const targetAmount = Number(payload.target_amount);
    if (!name) throw new ApiError("VALIDATION", "Goal name is required.");
    if (!targetAmount || targetAmount <= 0) throw new ApiError("VALIDATION", "Target amount must be greater than zero.");

    const row = {
      id: nextId(db, "goals"),
      user_id: user.id,
      name,
      target_amount: round2(targetAmount),
      target_date: payload.target_date || null,
      notes: payload.notes ? String(payload.notes).trim() : "",
      created_at: nowISO(),
      updated_at: nowISO(),
    };

    if (!Array.isArray(db.goals)) db.goals = [];
    db.goals.push(row);
    writeDB(db);
    return delay(row);
  },

  async update(id, payload) {
    const db = readDB();
    const user = requireAuth(db);
    const row = (db.goals || []).find((g) => g.id === id && g.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Goal not found.");

    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) throw new ApiError("VALIDATION", "Goal name cannot be empty.");
      row.name = name;
    }
    if (payload.target_amount !== undefined) {
      const amt = Number(payload.target_amount);
      if (!amt || amt <= 0) throw new ApiError("VALIDATION", "Target amount must be greater than zero.");
      row.target_amount = round2(amt);
    }
    if (payload.target_date !== undefined) {
      row.target_date = payload.target_date || null;
    }
    if (payload.notes !== undefined) {
      row.notes = String(payload.notes || "").trim();
    }
    row.updated_at = nowISO();
    writeDB(db);
    return delay(row);
  },

  async delete(id) {
    const db = readDB();
    const user = requireAuth(db);
    const idx = (db.goals || []).findIndex((g) => g.id === id && g.user_id === user.id);
    if (idx === -1) throw new ApiError("NOT_FOUND", "Goal not found.");
    db.goals.splice(idx, 1);
    writeDB(db);
    return delay({ success: true });
  },

  async getSummary() {
    const db = readDB();
    const user = requireAuth(db);
    const userGoals = (db.goals || [])
      .filter((g) => g.user_id === user.id)
      .sort((a, b) => {
        if (!a.target_date) return 1;
        if (!b.target_date) return -1;
        return a.target_date.localeCompare(b.target_date);
      });

    // Compute current total portfolio value from active holdings
    const activeHoldings = db.investments.filter((i) => i.user_id === user.id && i.status === "active");
    let totalPortfolioValue = 0;
    let totalInvested = 0;
    for (const h of activeHoldings) {
      const m = computeHoldingMetrics(h);
      totalPortfolioValue += m.current_value;
      totalInvested += m.invested_amount;
    }

    const portfolioReturnPct = totalInvested > 0 ? ((totalPortfolioValue - totalInvested) / totalInvested) * 100 : 0;

    const enrichedGoals = userGoals.map((g) => {
      const targetAmount = Number(g.target_amount) || 0;
      const currentAmount = round2(totalPortfolioValue);
      const percentComplete = targetAmount > 0 ? Math.min(100, round2((currentAmount / targetAmount) * 100)) : 0;
      const remainingAmount = Math.max(0, round2(targetAmount - currentAmount));
      const isReached = currentAmount >= targetAmount;

      // Projection calculation
      let projection = null;
      if (isReached) {
        projection = {
          status: "achieved",
          message: "Target achieved! Your portfolio currently meets this goal.",
          projectedDate: null,
          isOnTrack: true,
        };
      } else {
        const growthRateAnnual = portfolioReturnPct > 2 ? Math.min(portfolioReturnPct / 100, 0.35) : 0.10;
        if (currentAmount > 0 && targetAmount > currentAmount) {
          const yearsNeeded = Math.log(targetAmount / currentAmount) / Math.log(1 + growthRateAnnual);
          if (yearsNeeded > 0 && Number.isFinite(yearsNeeded)) {
            const projectedDateObj = new Date(Date.now() + yearsNeeded * 365.25 * 86400 * 1000);
            const projYearMonth = projectedDateObj.toLocaleDateString("en-IN", { month: "short", year: "numeric" });

            let isOnTrack = true;
            let note = "";
            if (g.target_date) {
              const targetDateMs = new Date(g.target_date).getTime();
              const projMs = projectedDateObj.getTime();
              if (projMs <= targetDateMs) {
                const monthsAhead = Math.round((targetDateMs - projMs) / (30.4 * 86400 * 1000));
                isOnTrack = true;
                note = monthsAhead > 0
                  ? `On track — projected to reach by ${projYearMonth} (~${monthsAhead} mo. ahead of schedule)`
                  : `On track — projected to reach by ${projYearMonth}`;
              } else {
                const monthsBehind = Math.round((projMs - targetDateMs) / (30.4 * 86400 * 1000));
                isOnTrack = false;
                note = `Behind schedule at current pace — projected by ${projYearMonth} (~${monthsBehind} mo. after target)`;
              }
            } else {
              note = `At current ~${(growthRateAnnual * 100).toFixed(1)}% p.a. trajectory, projected to reach by ${projYearMonth}`;
            }

            projection = {
              status: isOnTrack ? "on_track" : "behind",
              message: note,
              projectedDate: projYearMonth,
              growthRateAnnual: round2(growthRateAnnual * 100),
              isOnTrack,
            };
          }
        }

        if (!projection) {
          projection = {
            status: "planning",
            message: g.target_date ? `Target date: ${g.target_date}` : "Add regular contributions to accelerate this goal.",
            projectedDate: null,
            isOnTrack: true,
          };
        }
      }

      return {
        ...g,
        current_amount: currentAmount,
        percent_complete: percentComplete,
        remaining_amount: remainingAmount,
        is_reached: isReached,
        projection,
      };
    });

    const primaryGoal = enrichedGoals.find((g) => !g.is_reached) || enrichedGoals[0] || null;

    return delay({
      goals: enrichedGoals,
      primary_goal: primaryGoal,
      total_portfolio_value: round2(totalPortfolioValue),
      goals_count: enrichedGoals.length,
      achieved_count: enrichedGoals.filter((g) => g.is_reached).length,
    });
  },
};

// ── ALERTS ─────────────────────────────────────────────────────────────────

export const alerts = {
  async list(investmentId = null) {
    const db = readDB();
    const user = requireAuth(db);
    if (!Array.isArray(db.alerts)) db.alerts = [];

    let userAlerts = db.alerts.filter((a) => a.user_id === user.id);
    if (investmentId) {
      userAlerts = userAlerts.filter((a) => a.investment_id === investmentId);
    }

    let modified = false;
    const enriched = userAlerts.map((a) => {
      const holding = db.investments.find((i) => i.id === a.investment_id && i.user_id === user.id);
      const currentPrice = holding ? (Number(holding.current_price) || 0) : 0;
      const targetPrice = Number(a.target_price) || 0;

      let isTriggered = false;
      if (holding && holding.status === "active" && a.is_active !== false) {
        if (a.condition === "above" && currentPrice >= targetPrice) {
          isTriggered = true;
        } else if (a.condition === "below" && currentPrice <= targetPrice) {
          isTriggered = true;
        }
      }

      if (a.is_triggered !== isTriggered) {
        a.is_triggered = isTriggered;
        if (isTriggered && !a.triggered_at) {
          a.triggered_at = nowISO();
        }
        modified = true;
      }

      return {
        ...a,
        is_triggered: isTriggered,
        holding_name: holding ? holding.name : "Unknown holding",
        identifier: holding ? holding.identifier : "",
        asset_type: holding ? holding.asset_type : "stocks",
        unit: holding ? holding.unit : "units",
        current_price: currentPrice,
        currency: user.currency || "INR",
      };
    });

    if (modified) {
      writeDB(db);
    }

    return delay(
      enriched.sort((a, b) => {
        // Triggered and non-dismissed first
        const aActiveTrigger = a.is_triggered && !a.dismissed;
        const bActiveTrigger = b.is_triggered && !b.dismissed;
        if (aActiveTrigger && !bActiveTrigger) return -1;
        if (!aActiveTrigger && bActiveTrigger) return 1;
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      })
    );
  },

  async getTriggered() {
    const all = await alerts.list();
    return all.filter((a) => a.is_triggered && !a.dismissed && a.is_active !== false);
  },

  async create({ investment_id, target_price, condition, notes }) {
    const db = readDB();
    const user = requireAuth(db);
    const holding = db.investments.find((i) => i.id === investment_id && i.user_id === user.id);
    if (!holding) throw new ApiError("NOT_FOUND", "Holding not found.");

    const price = Number(target_price);
    if (!price || price <= 0) throw new ApiError("VALIDATION", "Target price must be greater than zero.");
    if (!["above", "below"].includes(condition)) throw new ApiError("VALIDATION", "Condition must be 'above' or 'below'.");

    const currentPrice = Number(holding.current_price) || 0;
    const isTriggered = (condition === "above" && currentPrice >= price) || (condition === "below" && currentPrice <= price);

    const row = {
      id: nextId(db, "alerts"),
      user_id: user.id,
      investment_id: holding.id,
      target_price: round2(price),
      condition,
      notes: notes ? String(notes).trim() : "",
      is_active: true,
      is_triggered: isTriggered,
      triggered_at: isTriggered ? nowISO() : null,
      dismissed: false,
      created_at: nowISO(),
      updated_at: nowISO(),
    };

    if (!Array.isArray(db.alerts)) db.alerts = [];
    db.alerts.push(row);
    writeDB(db);

    return delay({
      ...row,
      holding_name: holding.name,
      identifier: holding.identifier,
      asset_type: holding.asset_type,
      current_price: currentPrice,
      currency: user.currency || "INR",
    });
  },

  async update(id, payload) {
    const db = readDB();
    const user = requireAuth(db);
    if (!Array.isArray(db.alerts)) db.alerts = [];
    const row = db.alerts.find((a) => a.id === id && a.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Alert not found.");

    if (payload.target_price !== undefined) {
      const price = Number(payload.target_price);
      if (!price || price <= 0) throw new ApiError("VALIDATION", "Target price must be greater than zero.");
      row.target_price = round2(price);
      row.dismissed = false;
    }
    if (payload.condition !== undefined) {
      if (!["above", "below"].includes(payload.condition)) throw new ApiError("VALIDATION", "Condition must be 'above' or 'below'.");
      row.condition = payload.condition;
      row.dismissed = false;
    }
    if (payload.is_active !== undefined) {
      row.is_active = Boolean(payload.is_active);
    }
    if (payload.notes !== undefined) {
      row.notes = String(payload.notes || "").trim();
    }
    row.updated_at = nowISO();
    writeDB(db);

    const holding = db.investments.find((i) => i.id === row.investment_id);
    return delay({
      ...row,
      holding_name: holding?.name || "",
      identifier: holding?.identifier || "",
      current_price: holding?.current_price || 0,
      currency: user.currency || "INR",
    });
  },

  async dismiss(id) {
    const db = readDB();
    const user = requireAuth(db);
    if (!Array.isArray(db.alerts)) db.alerts = [];
    const row = db.alerts.find((a) => a.id === id && a.user_id === user.id);
    if (!row) throw new ApiError("NOT_FOUND", "Alert not found.");
    row.dismissed = true;
    row.updated_at = nowISO();
    writeDB(db);
    return delay({ success: true, id });
  },

  async dismissAll() {
    const db = readDB();
    const user = requireAuth(db);
    if (!Array.isArray(db.alerts)) db.alerts = [];
    let count = 0;
    for (const a of db.alerts) {
      if (a.user_id === user.id && a.is_triggered && !a.dismissed) {
        a.dismissed = true;
        a.updated_at = nowISO();
        count++;
      }
    }
    writeDB(db);
    return delay({ success: true, count });
  },

  async delete(id) {
    const db = readDB();
    const user = requireAuth(db);
    if (!Array.isArray(db.alerts)) db.alerts = [];
    const idx = db.alerts.findIndex((a) => a.id === id && a.user_id === user.id);
    if (idx === -1) throw new ApiError("NOT_FOUND", "Alert not found.");
    db.alerts.splice(idx, 1);
    writeDB(db);
    return delay({ success: true });
  },
};

// ── DEMO seed ─────────────────────────────────────────────────────────────

export async function seedDemoData(userId) {
  const db = readDB();
  const sample = [
    { asset_type: "stocks", name: "HDFC Bank Ltd", identifier: "HDFCBANK", quantity: 25, purchase_price: 1480, current_price: 1642, purchase_date: "2023-04-11", platform: "Zerodha", fees_paid: 45, taxes_paid: 12, type_fields: { exchange: "NSE", sector: "Banking" } },
    { asset_type: "stocks", name: "Tata Motors", identifier: "TATAMOTORS", quantity: 60, purchase_price: 610, current_price: 545, purchase_date: "2024-01-22", platform: "Zerodha", fees_paid: 30, taxes_paid: 8, type_fields: { exchange: "NSE", sector: "Auto" } },
    { asset_type: "mutual_fund", name: "Parag Parikh Flexi Cap", identifier: "PPFCF", quantity: 412.6, purchase_price: 58.2, current_price: 78.9, purchase_date: "2022-06-01", platform: "Groww", fees_paid: 0, taxes_paid: 0, type_fields: { fund_type: "Equity", folio_number: "88213311" } },
    { asset_type: "mutual_fund", name: "ICICI Pru Liquid Fund", identifier: "ICICILIQ", quantity: 1180.3, purchase_price: 305.1, current_price: 318.4, purchase_date: "2023-09-14", platform: "Groww", fees_paid: 0, taxes_paid: 0, type_fields: { fund_type: "Debt", folio_number: "44120098" } },
    { asset_type: "gold", name: "Sovereign Gold Bond 2029", identifier: "SGB-2029", quantity: 12, purchase_price: 5620, current_price: 7180, purchase_date: "2021-08-10", platform: "RBI Retail Direct", fees_paid: 0, taxes_paid: 0, type_fields: { gold_form: "Sovereign Gold Bond", purity: "999" } },
    { asset_type: "fixed_deposit", name: "HDFC Bank FD", identifier: "FD-2231", quantity: 1, purchase_price: 250000, current_price: 268750, purchase_date: "2023-03-01", platform: "HDFC Bank", fees_paid: 0, taxes_paid: 3200, type_fields: { bank_name: "HDFC Bank", interest_rate: "7.25", maturity_date: "2026-03-01", compounding: "Cumulative" } },
    { asset_type: "crypto", name: "Bitcoin", identifier: "BTC", quantity: 0.045, purchase_price: 3180000, current_price: 5720000, purchase_date: "2023-11-05", platform: "CoinDCX", fees_paid: 210, taxes_paid: 620, type_fields: { exchange_wallet: "CoinDCX", network: "Bitcoin" } },
    { asset_type: "crypto", name: "Ethereum", identifier: "ETH", quantity: 0.9, purchase_price: 168000, current_price: 152000, purchase_date: "2024-02-18", platform: "CoinDCX", fees_paid: 95, taxes_paid: 210, type_fields: { exchange_wallet: "CoinDCX", network: "Ethereum" } },
  ];

  for (const s of sample) {
    const txId = nextId(db, "transactions");
    const sampleIncome = [];
    if (s.identifier === "HDFCBANK") {
      sampleIncome.push({
        id: nextId(db, "income"),
        type: "dividend",
        date: "2023-08-16",
        amount: 475,
        notes: "Interim dividend ₹19/share",
      });
    } else if (s.identifier === "FD-2231") {
      sampleIncome.push({
        id: nextId(db, "income"),
        type: "interest",
        date: "2024-03-01",
        amount: 18125,
        notes: "Annual cumulative interest credited",
      });
    }

    db.investments.push({
      id: nextId(db, "investments"),
      user_id: userId,
      asset_type: s.asset_type,
      name: s.name,
      identifier: s.identifier,
      unit: ASSET_TYPES[s.asset_type].unitLabel,
      current_price: s.current_price,
      current_price_updated_at: nowISO(),
      platform: s.platform,
      notes: "",
      status: "active",
      sold_price: null,
      sold_date: null,
      type_fields: s.type_fields || {},
      transactions: [
        {
          id: txId,
          type: "buy",
          date: s.purchase_date,
          quantity: s.quantity,
          pricePerUnit: s.purchase_price,
          fees: (s.fees_paid || 0) + (s.taxes_paid || 0),
        },
      ],
      income: sampleIncome,
      created_at: nowISO(),
      updated_at: nowISO(),
    });
  }

  if (!db.goals) db.goals = [];
  if (!db.goals.some((g) => g.user_id === userId)) {
    db.goals.push(
      {
        id: nextId(db, "goals"),
        user_id: userId,
        name: "Emergency Fund & Runway",
        target_amount: 1000000,
        target_date: "2027-06-30",
        notes: "6 to 12 months liquid expenses + safety margin.",
        created_at: nowISO(),
        updated_at: nowISO(),
      },
      {
        id: nextId(db, "goals"),
        user_id: userId,
        name: "Home Down Payment",
        target_amount: 2500000,
        target_date: "2028-12-31",
        notes: "Target down payment for real estate purchase.",
        created_at: nowISO(),
        updated_at: nowISO(),
      }
    );
  }

  if (!db.alerts) db.alerts = [];
  if (!db.alerts.some((a) => a.user_id === userId)) {
    const hdfc = db.investments.find((i) => i.user_id === userId && i.identifier === "HDFCBANK");
    if (hdfc) {
      db.alerts.push({
        id: nextId(db, "alerts"),
        user_id: userId,
        investment_id: hdfc.id,
        target_price: 1700,
        condition: "above",
        notes: "Target profit booking zone",
        is_active: true,
        is_triggered: false,
        triggered_at: null,
        dismissed: false,
        created_at: nowISO(),
        updated_at: nowISO(),
      });
    }
  }

  const u = db.users.find((user) => user.id === userId);
  if (u && !u.target_allocation) {
    u.target_allocation = {
      stocks: 45,
      mutual_fund: 25,
      fixed_deposit: 15,
      gold: 15,
    };
  }

  writeDB(db);
}
