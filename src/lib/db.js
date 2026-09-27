/**
 * InvestMate — Data Layer (db.js)
 * Powered by Supabase (PostgreSQL with Row Level Security) and Firebase Auth JWT Bridging.
 * Preserves identical asynchronous interfaces for seamless component integration.
 */

import { supabase } from "./supabase.js";
import { auth as firebaseAuth } from "./firebase.js";
import { calculateXIRR, calculateCAGR } from "./utils.js";

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

export class ApiError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function generateId(prefix = "id") {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function round2(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
}

function round4(n) {
  return Math.round((Number(n || 0) + Number.EPSILON) * 10000) / 10000;
}

function getCurrentUserId() {
  const user = firebaseAuth.currentUser;
  if (!user || !user.uid) {
    throw new ApiError("UNAUTHENTICATED", "You must be signed in to perform this action.");
  }
  return user.uid;
}

/**
 * Handle Supabase PostgREST errors with friendly user-facing messages
 */
function handleSupabaseError(error, contextMessage = "Database operation failed") {
  if (!error) return;
  console.error(`[Supabase Error] ${contextMessage}:`, error);

  // RLS Violation / Permission denied
  if (error.code === "42501" || error.message?.includes("row-level security policy")) {
    throw new ApiError(
      "PERMISSION_DENIED",
      "Database permission denied. Your Firebase token or Postgres role may be unauthenticated.",
      error
    );
  }

  // Token expired / Auth failure
  if (error.message?.includes("JWT") || error.code === "PGRST301" || error.status === 401) {
    throw new ApiError(
      "AUTH_EXPIRED",
      "Your session token has expired. Please refresh your token or log in again.",
      error
    );
  }

  // Record not found
  if (error.code === "PGRST116") {
    throw new ApiError("NOT_FOUND", "The requested record was not found.", error);
  }

  // Generic Supabase / Network error
  throw new ApiError(
    error.code || "DB_ERROR",
    error.message || `${contextMessage}. Please check your connection.`,
    error
  );
}

function mapTransactionFromDb(tx) {
  if (!tx) return null;
  return {
    id: tx.id,
    type: tx.type,
    date: tx.date,
    quantity: Number(tx.quantity) || 0,
    pricePerUnit: Number(tx.price_per_unit) || 0,
    fees: Number(tx.fees) || 0,
    notes: tx.notes || "",
    created_at: tx.created_at,
  };
}

function mapIncomeFromDb(inc) {
  if (!inc) return null;
  return {
    id: inc.id,
    type: inc.type,
    date: inc.date,
    amount: Number(inc.amount) || 0,
    reinvested: Boolean(inc.reinvested),
    notes: inc.notes || "",
    created_at: inc.created_at,
  };
}

function mapHoldingFromDb(row) {
  if (!row) return null;

  const rawTransactions = Array.isArray(row.transactions) ? row.transactions : [];
  const rawIncome = Array.isArray(row.income_records) ? row.income_records : [];

  const txs = rawTransactions.map(mapTransactionFromDb);
  const incs = rawIncome.map(mapIncomeFromDb);

  return {
    id: row.id,
    user_id: row.user_id,
    asset_type: row.asset_type,
    name: row.name,
    identifier: row.identifier || "",
    unit: row.unit || ASSET_TYPES[row.asset_type]?.unitLabel || "units",
    quantity: Number(row.quantity) || 0,
    purchase_price: Number(row.purchase_price) || 0,
    purchase_date: row.purchase_date,
    current_price: Number(row.current_price) || 0,
    fees_paid: Number(row.fees_paid) || 0,
    taxes_paid: Number(row.taxes_paid) || 0,
    platform: row.platform || "",
    status: row.status || "active",
    sold_price: row.sold_price != null ? Number(row.sold_price) : null,
    sold_date: row.sold_date || null,
    notes: row.notes || "",
    type_fields: row.type_fields || {},
    transactions: txs,
    income: incs,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

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

// ── Holding Metrics Calculation ──────────────────────────────────────────

export function computeHoldingMetrics(row) {
  if (!row) return null;

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

  // Absolute return is unrealized return + realized gains + income received
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

  // CAGR calculation
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

// ── INVESTMENTS ──────────────────────────────────────────────────────────

export const investments = {
  async list(filters = {}) {
    getCurrentUserId(); // ensures authenticated

    let query = supabase
      .from("holdings")
      .select("*, transactions(*), income_records(*)")
      .order("created_at", { ascending: false });

    if (filters.asset_type && filters.asset_type !== "all") {
      query = query.eq("asset_type", filters.asset_type);
    }
    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    const { data, error } = await query;
    if (error) handleSupabaseError(error, "Failed to load holdings from database");

    let rows = (data || []).map(mapHoldingFromDb).map(computeHoldingMetrics);

    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          (i.identifier || "").toLowerCase().includes(q) ||
          (i.platform || "").toLowerCase().includes(q)
      );
    }

    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async get(id) {
    getCurrentUserId();

    const { data, error } = await supabase
      .from("holdings")
      .select("*, transactions(*), income_records(*)")
      .eq("id", id)
      .single();

    if (error) handleSupabaseError(error, "Holding not found");
    return computeHoldingMetrics(mapHoldingFromDb(data));
  },

  async create(payload) {
    const userId = getCurrentUserId();
    validateHoldingPayload(payload);

    const holdingId = generateId("inv");
    const txId = generateId("tx");
    const feesPaid = Number(payload.fees_paid) || 0;
    const taxesPaid = Number(payload.taxes_paid) || 0;
    const qty = Number(payload.quantity);
    const purchasePrice = Number(payload.purchase_price);

    const holdingRow = {
      id: holdingId,
      user_id: userId,
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
      platform: payload.platform || "",
      notes: payload.notes || "",
      status: "active",
      sold_price: null,
      sold_date: null,
      type_fields: payload.type_fields || {},
      created_at: nowISO(),
      updated_at: nowISO(),
    };

    // 1. Insert Holding
    const { error: holdingError } = await supabase
      .from("holdings")
      .insert(holdingRow);
    if (holdingError) handleSupabaseError(holdingError, "Failed to create holding");

    // 2. Insert Initial Buy Transaction
    const txRow = {
      id: txId,
      holding_id: holdingId,
      type: "buy",
      date: payload.purchase_date || todayISO(),
      quantity: qty,
      price_per_unit: purchasePrice,
      fees: feesPaid + taxesPaid,
      notes: "Initial purchase",
      created_at: nowISO(),
    };

    const { error: txError } = await supabase
      .from("transactions")
      .insert(txRow);
    if (txError) handleSupabaseError(txError, "Failed to record purchase transaction");

    return await investments.get(holdingId);
  },

  async update(id, payload) {
    getCurrentUserId();
    validateHoldingPayload(payload, true);

    const holding = await investments.get(id);
    if (!holding) throw new ApiError("NOT_FOUND", "Holding not found.");

    const patch = {
      updated_at: nowISO(),
    };

    if (payload.asset_type !== undefined) {
      patch.asset_type = payload.asset_type;
      patch.unit = ASSET_TYPES[payload.asset_type]?.unitLabel || holding.unit;
    }
    if (payload.name !== undefined) patch.name = payload.name.trim();
    if (payload.identifier !== undefined) patch.identifier = payload.identifier;
    if (payload.platform !== undefined) patch.platform = payload.platform;
    if (payload.notes !== undefined) patch.notes = payload.notes;
    if (payload.type_fields !== undefined) patch.type_fields = payload.type_fields;
    if (payload.current_price != null && payload.current_price !== "") {
      patch.current_price = Number(payload.current_price);
    }
    if (payload.fees_paid !== undefined) patch.fees_paid = Number(payload.fees_paid) || 0;
    if (payload.taxes_paid !== undefined) patch.taxes_paid = Number(payload.taxes_paid) || 0;
    if (payload.purchase_date !== undefined) patch.purchase_date = payload.purchase_date;

    // If holding only has 1 buy transaction, update that transaction as well
    if (holding.transactions?.length === 1 && holding.transactions[0].type === "buy") {
      const initialTx = holding.transactions[0];
      const txPatch = {};
      if (payload.quantity != null) {
        txPatch.quantity = Number(payload.quantity);
        patch.quantity = Number(payload.quantity);
      }
      if (payload.purchase_price != null) {
        txPatch.price_per_unit = Number(payload.purchase_price);
        patch.purchase_price = Number(payload.purchase_price);
      }
      if (payload.purchase_date != null) {
        txPatch.date = payload.purchase_date;
      }
      if (payload.fees_paid != null || payload.taxes_paid != null) {
        txPatch.fees = (Number(payload.fees_paid != null ? payload.fees_paid : holding.fees_paid) || 0) +
                       (Number(payload.taxes_paid != null ? payload.taxes_paid : holding.taxes_paid) || 0);
      }

      if (Object.keys(txPatch).length > 0) {
        const { error: txErr } = await supabase
          .from("transactions")
          .update(txPatch)
          .eq("id", initialTx.id);
        if (txErr) handleSupabaseError(txErr, "Failed to update initial transaction");
      }
    }

    const { error } = await supabase
      .from("holdings")
      .update(patch)
      .eq("id", id);
    if (error) handleSupabaseError(error, "Failed to update holding");

    return await investments.get(id);
  },

  async addTransaction(id, txData) {
    getCurrentUserId();
    const holding = await investments.get(id);
    if (!holding) throw new ApiError("NOT_FOUND", "Holding not found.");

    const qty = Number(txData.quantity);
    const price = Number(txData.pricePerUnit);
    const fees = Number(txData.fees || 0);

    if (!qty || qty <= 0) throw new ApiError("VALIDATION", "Quantity must be greater than zero.");
    if (price < 0 || Number.isNaN(price)) throw new ApiError("VALIDATION", "Price per unit cannot be negative.");
    if (!txData.date) throw new ApiError("VALIDATION", "Transaction date is required.");
    if (!["buy", "sell"].includes(txData.type)) throw new ApiError("VALIDATION", "Transaction type must be 'buy' or 'sell'.");

    if (txData.type === "sell") {
      if (qty > holding.quantity) {
        throw new ApiError("VALIDATION", `Cannot sell ${qty} units. You currently hold ${holding.quantity} units.`);
      }
    }

    const txId = generateId("tx");
    const { error: txErr } = await supabase
      .from("transactions")
      .insert({
        id: txId,
        holding_id: id,
        type: txData.type,
        date: txData.date,
        quantity: qty,
        price_per_unit: price,
        fees: fees,
        notes: txData.notes || "",
        created_at: nowISO(),
      });
    if (txErr) handleSupabaseError(txErr, "Failed to record transaction");

    // Fetch updated holding and recalculate status / sold price
    const updated = await investments.get(id);
    const patch = {
      status: updated.status,
      updated_at: nowISO(),
    };
    if (txData.type === "sell") {
      patch.sold_price = price;
      patch.sold_date = txData.date;
    }

    await supabase.from("holdings").update(patch).eq("id", id);
    return await investments.get(id);
  },

  async deleteTransaction(holdingId, txId) {
    getCurrentUserId();
    const holding = await investments.get(holdingId);
    if (!holding) throw new ApiError("NOT_FOUND", "Holding not found.");

    const { error: delErr } = await supabase
      .from("transactions")
      .delete()
      .eq("id", txId)
      .eq("holding_id", holdingId);
    if (delErr) handleSupabaseError(delErr, "Failed to delete transaction");

    // Recalculate status
    const updated = await investments.get(holdingId);
    await supabase.from("holdings").update({ status: updated.status, updated_at: nowISO() }).eq("id", holdingId);
    return await investments.get(holdingId);
  },

  async markSold(id, { sold_price, sold_date, quantity, fees }) {
    getCurrentUserId();
    const holding = await investments.get(id);
    if (!holding) throw new ApiError("NOT_FOUND", "Holding not found.");

    const qtyToSell = quantity != null && Number(quantity) > 0 ? Number(quantity) : holding.quantity;
    if (qtyToSell <= 0) throw new ApiError("VALIDATION", "Holding has no units available to sell.");
    if (qtyToSell > holding.quantity) {
      throw new ApiError("VALIDATION", `Cannot sell ${qtyToSell} units. You currently hold ${holding.quantity} units.`);
    }

    return await investments.addTransaction(id, {
      type: "sell",
      quantity: qtyToSell,
      pricePerUnit: Number(sold_price),
      date: sold_date || todayISO(),
      fees: Number(fees) || 0,
    });
  },

  async addIncome(id, { type, date, amount, notes }) {
    getCurrentUserId();
    const holding = await investments.get(id);
    if (!holding) throw new ApiError("NOT_FOUND", "Holding not found.");

    if (!type || (type !== "dividend" && type !== "interest")) {
      throw new ApiError("VALIDATION", "Income type must be 'dividend' or 'interest'.");
    }
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      throw new ApiError("VALIDATION", "Income amount must be greater than zero.");
    }

    const incomeId = generateId("inc");
    const { error: incErr } = await supabase
      .from("income_records")
      .insert({
        id: incomeId,
        holding_id: id,
        type,
        date: date || todayISO(),
        amount: round2(amt),
        reinvested: false,
        notes: notes ? String(notes).trim() : "",
        created_at: nowISO(),
      });
    if (incErr) handleSupabaseError(incErr, "Failed to record income entry");

    await supabase.from("holdings").update({ updated_at: nowISO() }).eq("id", id);
    return await investments.get(id);
  },

  async deleteIncome(holdingId, incomeId) {
    getCurrentUserId();
    const { error: delErr } = await supabase
      .from("income_records")
      .delete()
      .eq("id", incomeId)
      .eq("holding_id", holdingId);
    if (delErr) handleSupabaseError(delErr, "Failed to delete income entry");

    await supabase.from("holdings").update({ updated_at: nowISO() }).eq("id", holdingId);
    return await investments.get(holdingId);
  },

  async remove(id) {
    getCurrentUserId();
    const { error } = await supabase
      .from("holdings")
      .delete()
      .eq("id", id);
    if (error) handleSupabaseError(error, "Failed to delete holding");
    return { ok: true };
  },
};

// ── ANALYTICS ─────────────────────────────────────────────────────────────

export const analytics = {
  async getSummary() {
    const allRows = await investments.list();
    const activeRows = allRows.filter((r) => r.status === "active");

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

    for (const hm of allRows) {
      totalFees += hm.fees_paid || 0;
      totalTaxes += hm.taxes_paid || 0;
      totalIncome += hm.total_income || 0;
      totalDividends += hm.total_dividends || 0;
      totalInterest += hm.total_interest || 0;
      combinedAbsoluteReturn += hm.absolute_return || 0;
    }

    // Build portfolio cashflows across all holdings
    const portfolioCashflows = [];
    for (const h of allRows) {
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

    return {
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
    };
  },

  async getAllocation() {
    const rows = await investments.list({ status: "active" });
    const byType = {};
    rows.forEach((r) => {
      byType[r.asset_type] = (byType[r.asset_type] || 0) + r.current_value;
    });
    const total = Object.values(byType).reduce((a, b) => a + b, 0);
    return Object.entries(byType)
      .map(([asset_type, value]) => ({
        asset_type,
        label: ASSET_TYPES[asset_type]?.label || asset_type,
        value: round2(value),
        percent: total > 0 ? round2((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value);
  },

  async getReturnsByAsset() {
    const rows = await investments.list({ status: "active" });
    const byType = {};
    rows.forEach((r) => {
      if (!byType[r.asset_type]) {
        byType[r.asset_type] = { asset_type: r.asset_type, label: ASSET_TYPES[r.asset_type]?.label || r.asset_type, invested: 0, current: 0 };
      }
      byType[r.asset_type].invested += r.invested_amount;
      byType[r.asset_type].current += r.current_value;
    });
    return Object.values(byType).map((t) => ({
      ...t,
      invested: round2(t.invested),
      current: round2(t.current),
      absolute_return: round2(t.current - t.invested),
      percent_return: t.invested > 0 ? round2(((t.current - t.invested) / t.invested) * 100) : 0,
    }));
  },

  async getTopMovers(limit = 5) {
    const rows = await investments.list({ status: "active" });
    const sorted = [...rows].sort((a, b) => b.percent_return - a.percent_return);
    return {
      gainers: sorted.filter((r) => r.percent_return > 0).slice(0, limit),
      losers: sorted.filter((r) => r.percent_return < 0).slice(-limit).reverse(),
    };
  },

  async getTargetAllocation() {
    const userId = getCurrentUserId();
    const rows = await investments.list({ status: "active" });
    const activeTypes = Array.from(new Set(rows.map((r) => r.asset_type)));

    // Load custom allocation from local preferences (or default)
    try {
      const saved = localStorage.getItem(`investmate_target_alloc_${userId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch {
      // fallback to default
    }

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
    return defaultMap;
  },

  async saveTargetAllocation(targetMap) {
    const userId = getCurrentUserId();
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

    const diff = round2(100 - total);
    const firstKey = Object.keys(cleanMap)[0];
    if (diff !== 0 && firstKey) {
      cleanMap[firstKey] = round2(cleanMap[firstKey] + diff);
    }

    localStorage.setItem(`investmate_target_alloc_${userId}`, JSON.stringify(cleanMap));
    return cleanMap;
  },

  async getRebalancingPlan() {
    const rows = await investments.list({ status: "active" });
    const targetMap = await analytics.getTargetAllocation();

    if (!rows || rows.length === 0) {
      return {
        total_portfolio_value: 0,
        items: [],
        health_score: 100,
        health_status: "No active holdings",
        total_drift: 0,
        suggestions: [],
        target_allocation: targetMap,
      };
    }

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

    return {
      total_portfolio_value: round2(totalPortfolioValue),
      items: items.sort((a, b) => b.current_value - a.current_value),
      health_score: healthScore,
      health_status: healthStatus,
      total_drift: totalDrift,
      suggestions,
      target_allocation: targetMap,
    };
  },
};

// ── GOALS ──────────────────────────────────────────────────────────────────

export const goals = {
  async list() {
    getCurrentUserId();

    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .order("target_date", { ascending: true, nullsFirst: false });

    if (error) handleSupabaseError(error, "Failed to load goals");
    return (data || []).map((g) => ({
      id: g.id,
      user_id: g.user_id,
      name: g.name,
      target_amount: Number(g.target_amount) || 0,
      target_date: g.target_date,
      category: g.category || "",
      notes: g.notes || "",
      linked_holding_ids: g.linked_holding_ids || [],
      created_at: g.created_at,
      updated_at: g.updated_at,
    }));
  },

  async create(payload) {
    const userId = getCurrentUserId();
    const name = String(payload.name || "").trim();
    const targetAmount = Number(payload.target_amount);
    if (!name) throw new ApiError("VALIDATION", "Goal name is required.");
    if (!targetAmount || targetAmount <= 0) throw new ApiError("VALIDATION", "Target amount must be greater than zero.");

    const row = {
      id: generateId("gol"),
      user_id: userId,
      name,
      target_amount: round2(targetAmount),
      target_date: payload.target_date || null,
      notes: payload.notes ? String(payload.notes).trim() : "",
      category: payload.category || "",
      linked_holding_ids: payload.linked_holding_ids || [],
      created_at: nowISO(),
      updated_at: nowISO(),
    };

    const { error } = await supabase.from("goals").insert(row);
    if (error) handleSupabaseError(error, "Failed to create goal");
    return row;
  },

  async update(id, payload) {
    getCurrentUserId();
    const patch = { updated_at: nowISO() };

    if (payload.name !== undefined) {
      const name = String(payload.name || "").trim();
      if (!name) throw new ApiError("VALIDATION", "Goal name cannot be empty.");
      patch.name = name;
    }
    if (payload.target_amount !== undefined) {
      const amt = Number(payload.target_amount);
      if (!amt || amt <= 0) throw new ApiError("VALIDATION", "Target amount must be greater than zero.");
      patch.target_amount = round2(amt);
    }
    if (payload.target_date !== undefined) patch.target_date = payload.target_date || null;
    if (payload.notes !== undefined) patch.notes = String(payload.notes || "").trim();
    if (payload.category !== undefined) patch.category = payload.category;
    if (payload.linked_holding_ids !== undefined) patch.linked_holding_ids = payload.linked_holding_ids;

    const { error } = await supabase.from("goals").update(patch).eq("id", id);
    if (error) handleSupabaseError(error, "Failed to update goal");

    const { data } = await supabase.from("goals").select("*").eq("id", id).single();
    return data;
  },

  async delete(id) {
    getCurrentUserId();
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) handleSupabaseError(error, "Failed to delete goal");
    return { success: true };
  },

  async getSummary() {
    const userGoals = await goals.list();
    const allHoldings = await investments.list({ status: "active" });

    let totalPortfolioValue = 0;
    for (const h of allHoldings) {
      totalPortfolioValue += h.current_value;
    }

    const enrichedGoals = userGoals.map((g) => {
      const targetAmount = Number(g.target_amount) || 0;
      const currentAmount = round2(totalPortfolioValue);
      const percentComplete = targetAmount > 0 ? Math.min(100, round2((currentAmount / targetAmount) * 100)) : 0;
      const remainingAmount = Math.max(0, round2(targetAmount - currentAmount));
      const isReached = currentAmount >= targetAmount;

      let projection = null;
      if (isReached) {
        projection = {
          status: "achieved",
          message: "Target achieved! Your portfolio currently meets this goal.",
          projectedDate: null,
          isOnTrack: true,
        };
      } else {
        const growthRateAnnual = 0.12; // baseline projection
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

    return {
      goals: enrichedGoals,
      primary_goal: primaryGoal,
      total_portfolio_value: round2(totalPortfolioValue),
      goals_count: enrichedGoals.length,
      achieved_count: enrichedGoals.filter((g) => g.is_reached).length,
    };
  },
};

// ── ALERTS ─────────────────────────────────────────────────────────────────

export const alerts = {
  async list(investmentId = null) {
    getCurrentUserId();

    let query = supabase
      .from("price_alerts")
      .select("*, holdings(id, name, identifier, asset_type, current_price, unit)")
      .order("created_at", { ascending: false });

    if (investmentId) {
      query = query.eq("holding_id", investmentId);
    }

    const { data, error } = await query;
    if (error) handleSupabaseError(error, "Failed to load price alerts");

    const enriched = (data || []).map((a) => {
      const holding = a.holdings;
      const currentPrice = holding ? Number(holding.current_price) || 0 : 0;
      const targetPrice = Number(a.target_price) || 0;

      let isTriggered = a.triggered;
      if (holding) {
        if (a.direction === "above" && currentPrice >= targetPrice) isTriggered = true;
        else if (a.direction === "below" && currentPrice <= targetPrice) isTriggered = true;
      }

      return {
        id: a.id,
        investment_id: a.holding_id,
        holding_id: a.holding_id,
        target_price: targetPrice,
        condition: a.direction,
        direction: a.direction,
        is_triggered: isTriggered,
        triggered: isTriggered,
        triggered_at: a.triggered_at,
        dismissed: a.dismissed || false,
        notes: a.notes || "",
        holding_name: holding ? holding.name : "Unknown holding",
        identifier: holding ? holding.identifier : "",
        asset_type: holding ? holding.asset_type : "stocks",
        unit: holding ? holding.unit : "units",
        current_price: currentPrice,
        created_at: a.created_at,
      };
    });

    return enriched.sort((a, b) => {
      const aActive = a.is_triggered && !a.dismissed;
      const bActive = b.is_triggered && !b.dismissed;
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  },

  async getTriggered() {
    const all = await alerts.list();
    return all.filter((a) => a.is_triggered && !a.dismissed);
  },

  async create({ investment_id, target_price, condition, direction, notes: _notes }) {
    getCurrentUserId();
    const holding = await investments.get(investment_id);
    if (!holding) throw new ApiError("NOT_FOUND", "Holding not found.");

    const price = Number(target_price);
    const cond = condition || direction || "above";
    if (!price || price <= 0) throw new ApiError("VALIDATION", "Target price must be greater than zero.");
    if (!["above", "below"].includes(cond)) throw new ApiError("VALIDATION", "Condition must be 'above' or 'below'.");

    const currentPrice = Number(holding.current_price) || 0;
    const isTriggered = (cond === "above" && currentPrice >= price) || (cond === "below" && currentPrice <= price);

    const alertId = generateId("alt");
    const row = {
      id: alertId,
      holding_id: investment_id,
      target_price: round2(price),
      direction: cond,
      triggered: isTriggered,
      triggered_at: isTriggered ? nowISO() : null,
      created_at: nowISO(),
    };

    const { error } = await supabase.from("price_alerts").insert(row);
    if (error) handleSupabaseError(error, "Failed to create price alert");

    return {
      id: alertId,
      investment_id,
      holding_id: investment_id,
      target_price: round2(price),
      condition: cond,
      direction: cond,
      is_triggered: isTriggered,
      triggered: isTriggered,
      triggered_at: isTriggered ? nowISO() : null,
      holding_name: holding.name,
      identifier: holding.identifier,
      asset_type: holding.asset_type,
      current_price: currentPrice,
    };
  },

  async update(id, payload) {
    getCurrentUserId();
    const patch = {};

    if (payload.target_price !== undefined) {
      const price = Number(payload.target_price);
      if (!price || price <= 0) throw new ApiError("VALIDATION", "Target price must be greater than zero.");
      patch.target_price = round2(price);
      patch.triggered = false;
    }
    if (payload.condition !== undefined || payload.direction !== undefined) {
      const cond = payload.condition || payload.direction;
      if (!["above", "below"].includes(cond)) throw new ApiError("VALIDATION", "Condition must be 'above' or 'below'.");
      patch.direction = cond;
      patch.triggered = false;
    }

    const { error } = await supabase.from("price_alerts").update(patch).eq("id", id);
    if (error) handleSupabaseError(error, "Failed to update price alert");

    const list = await alerts.list();
    return list.find((a) => a.id === id);
  },

  async dismiss(id) {
    // Local dismissal state for UI
    try {
      const dismissed = JSON.parse(localStorage.getItem("investmate_dismissed_alerts") || "[]");
      if (!dismissed.includes(id)) {
        dismissed.push(id);
        localStorage.setItem("investmate_dismissed_alerts", JSON.stringify(dismissed));
      }
    } catch {
      // ignore
    }
    return { success: true, id };
  },

  async dismissAll() {
    try {
      const all = await alerts.list();
      const allIds = all.map((a) => a.id);
      localStorage.setItem("investmate_dismissed_alerts", JSON.stringify(allIds));
    } catch {
      // ignore
    }
    return { success: true };
  },

  async delete(id) {
    getCurrentUserId();
    const { error } = await supabase.from("price_alerts").delete().eq("id", id);
    if (error) handleSupabaseError(error, "Failed to delete alert");
    return { success: true };
  },
};

// ── DEMO SEED ─────────────────────────────────────────────────────────────

export async function seedDemoData(_userId) {
  // Empty implementation — all accounts start cleanly with zero holdings
  return { seeded: false };
}

// ── DATA MIGRATION HELPER (localStorage → Supabase) ──────────────────────

/**
 * Checks if there is unmigrated data stored in localStorage
 */
export function checkLocalStorageDataToMigrate(userId) {
  if (!userId) return null;
  try {
    const isMigrated = localStorage.getItem(`investmate_migrated_supabase_${userId}`);
    if (isMigrated === "true") return null;

    const raw = localStorage.getItem("investmate_db_v1");
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    const holdingsCount = Array.isArray(parsed?.investments) ? parsed.investments.length : 0;
    const goalsCount = Array.isArray(parsed?.goals) ? parsed.goals.length : 0;
    const alertsCount = Array.isArray(parsed?.alerts) ? parsed.alerts.length : 0;

    if (holdingsCount === 0 && goalsCount === 0 && alertsCount === 0) return null;

    return {
      holdingsCount,
      goalsCount,
      alertsCount,
      parsedData: parsed,
    };
  } catch (err) {
    console.error("Failed to check localStorage migration data:", err);
    return null;
  }
}

/**
 * Migrates local data into Supabase for the current user
 */
export async function migrateLocalStorageToSupabase(userId) {
  if (!userId) userId = getCurrentUserId();
  const info = checkLocalStorageDataToMigrate(userId);
  if (!info) return { migrated: false, message: "No local data to migrate." };

  const db = info.parsedData;
  let importedHoldings = 0;
  let importedGoals = 0;
  let importedAlerts = 0;

  // 1. Migrate Holdings, Transactions, and Income
  if (Array.isArray(db.investments)) {
    for (const inv of db.investments) {
      const holdingId = inv.id || generateId("inv");
      const holdingRow = {
        id: holdingId,
        user_id: userId,
        asset_type: inv.asset_type || "stocks",
        name: inv.name || "Untitled",
        identifier: inv.identifier || "",
        unit: inv.unit || ASSET_TYPES[inv.asset_type]?.unitLabel || "units",
        quantity: Number(inv.quantity) || 0,
        purchase_price: Number(inv.purchase_price) || 0,
        purchase_date: inv.purchase_date || todayISO(),
        fees_paid: Number(inv.fees_paid) || 0,
        taxes_paid: Number(inv.taxes_paid) || 0,
        current_price: Number(inv.current_price) || Number(inv.purchase_price) || 0,
        platform: inv.platform || "",
        status: inv.status || "active",
        sold_price: inv.sold_price != null ? Number(inv.sold_price) : null,
        sold_date: inv.sold_date || null,
        notes: inv.notes || "",
        type_fields: inv.type_fields || {},
        created_at: inv.created_at || nowISO(),
        updated_at: inv.updated_at || nowISO(),
      };

      await supabase.from("holdings").upsert(holdingRow);
      importedHoldings++;

      // Transactions
      if (Array.isArray(inv.transactions) && inv.transactions.length > 0) {
        for (const tx of inv.transactions) {
          await supabase.from("transactions").upsert({
            id: tx.id || generateId("tx"),
            holding_id: holdingId,
            type: tx.type || "buy",
            date: tx.date || todayISO(),
            quantity: Number(tx.quantity) || 0,
            price_per_unit: Number(tx.pricePerUnit || tx.price_per_unit) || 0,
            fees: Number(tx.fees) || 0,
            notes: tx.notes || "",
            created_at: tx.created_at || nowISO(),
          });
        }
      }

      // Income
      if (Array.isArray(inv.income) && inv.income.length > 0) {
        for (const inc of inv.income) {
          await supabase.from("income_records").upsert({
            id: inc.id || generateId("inc"),
            holding_id: holdingId,
            type: inc.type || "dividend",
            date: inc.date || todayISO(),
            amount: Number(inc.amount) || 0,
            reinvested: Boolean(inc.reinvested),
            notes: inc.notes || "",
            created_at: inc.created_at || nowISO(),
          });
        }
      }
    }
  }

  // 2. Migrate Goals
  if (Array.isArray(db.goals)) {
    for (const g of db.goals) {
      await supabase.from("goals").upsert({
        id: g.id || generateId("gol"),
        user_id: userId,
        name: g.name || "Untitled Goal",
        target_amount: Number(g.target_amount) || 0,
        target_date: g.target_date || null,
        category: g.category || "",
        notes: g.notes || "",
        created_at: g.created_at || nowISO(),
        updated_at: g.updated_at || nowISO(),
      });
      importedGoals++;
    }
  }

  // 3. Migrate Alerts
  if (Array.isArray(db.alerts)) {
    for (const a of db.alerts) {
      await supabase.from("price_alerts").upsert({
        id: a.id || generateId("alt"),
        holding_id: a.investment_id || a.holding_id,
        target_price: Number(a.target_price) || 0,
        direction: a.condition || a.direction || "above",
        triggered: Boolean(a.is_triggered || a.triggered),
        triggered_at: a.triggered_at || null,
        created_at: a.created_at || nowISO(),
      });
      importedAlerts++;
    }
  }

  // Mark migration complete in localStorage
  localStorage.setItem(`investmate_migrated_supabase_${userId}`, "true");

  return {
    migrated: true,
    importedHoldings,
    importedGoals,
    importedAlerts,
  };
}
