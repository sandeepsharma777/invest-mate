# InvestMate

Your unified, manual-entry investment ledger powered by **Firebase Authentication** and **Supabase (PostgreSQL with Row Level Security)**.

## Architecture & Data Flow

1. **Authentication**: **Firebase Auth** handles user identity, account creation, and session tokens.
2. **Database & Storage**: **Supabase (PostgreSQL)** stores all ledger data across relational tables (`holdings`, `transactions`, `income_records`, `price_alerts`, `goals`).
3. **Third-Party Auth / JWT Bridging**: The Supabase JS client (`src/lib/supabase.js`) is configured with the `accessToken` callback and `global.headers` to attach the live Firebase Bearer token to all PostgREST queries.
4. **Row Level Security (RLS)**: PostgreSQL policies on Supabase enforce multi-tenant data isolation using `public.firebase_uid()` matching `auth.jwt() ->> 'sub'`.

## Database Schema

- `public.holdings` — All asset positions (stocks, mutual funds, gold, fixed deposits, crypto)
- `public.transactions` — Buy, sell, and deposit transactions for cost basis and CAGR/XIRR accounting
- `public.income_records` — Dividend and interest income entries
- `public.price_alerts` — Target price threshold alerts
- `public.goals` — Financial milestones and target timelines

## Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

