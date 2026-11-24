/*
# Premium subscription tables for M-Pesa Daraja 3.0 integration

## Purpose
Adds a paid Premium package to AccaForge. Visitors pay via Safaricom M-Pesa STK Push (Daraja 3.0 API).
On successful payment, a member record is created with a session token and subscription expiry.
All payment logic runs through Supabase Edge Functions using the service_role key, so member
and payment tables are locked to service_role only — the browser never reads or writes them directly.

## New Tables

### subscription_plans
Defines the available premium packages (price in Ksh, duration in days, features list).
- `id` (uuid, primary key)
- `name` (text, not null) — e.g. "Monthly Premium"
- `price_ksh` (integer, not null) — price in Kenyan Shillings
- `duration_days` (integer, not null) — how many days the subscription lasts
- `description` (text) — short marketing copy
- `features` (text[]) — list of premium features included
- `is_active` (boolean, default true) — only active plans are offered
- `sort_order` (integer, default 0) — display ordering
- `created_at` (timestamptz, default now())

### members
Stores a premium subscriber identified by M-Pesa phone number.
- `id` (uuid, primary key)
- `phone` (text, unique, not null) — M-Pesa phone number in 2547XXXXXXXX format
- `plan_id` (uuid, references subscription_plans) — current plan
- `status` (text, default 'inactive') — 'active', 'inactive', 'expired'
- `session_token` (text, unique) — token issued after payment, stored in browser localStorage
- `expires_at` (timestamptz) — when the subscription ends
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

### payments
Records every M-Pesa transaction attempt.
- `id` (uuid, primary key)
- `checkout_request_id` (text, unique) — Safaricom's checkout request ID
- `member_phone` (text, not null) — phone number that was prompted
- `plan_id` (uuid, references subscription_plans) — which plan was purchased
- `amount_ksh` (integer, not null) — amount charged
- `status` (text, default 'pending') — 'pending', 'success', 'failed', 'cancelled', 'timeout'
- `mpesa_receipt` (text) — M-Pesa transaction code on success
- `result_code` (integer) — Safaricom result code
- `result_desc` (text) — Safaricom result description
- `callback_received` (boolean, default false)
- `created_at` (timestamptz, default now())
- `updated_at` (timestamptz, default now())

## Security
- `subscription_plans`: RLS enabled. SELECT granted to anon + authenticated so the frontend can display plans.
  No INSERT/UPDATE/DELETE from the Data API — plans are managed via SQL/service_role only.
- `members`: RLS enabled. Only service_role can access (no anon/authenticated grants).
  All member reads/writes go through Edge Functions using SUPABASE_SERVICE_ROLE_KEY.
- `payments`: RLS enabled. Only service_role can access.
  All payment reads/writes go through Edge Functions.

## Important Notes
1. The browser never directly queries members or payments — all access is mediated by
   Supabase Edge Functions that use the service_role key and enforce session-token validation.
2. Session tokens are generated server-side using gen_random_uuid() and returned to the browser
   only after a successful M-Pesa payment callback.
3. subscription_plans is seeded with one monthly plan (Ksh 199 / 30 days) to start.
*/

CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_ksh integer NOT NULL,
  duration_days integer NOT NULL,
  description text NOT NULL DEFAULT '',
  features text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE NOT NULL,
  plan_id uuid REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'inactive',
  session_token text UNIQUE,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id text UNIQUE,
  member_phone text NOT NULL,
  plan_id uuid REFERENCES subscription_plans(id),
  amount_ksh integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  mpesa_receipt text,
  result_code integer,
  result_desc text,
  callback_received boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_session_token ON members(session_token);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_payments_checkout_request_id ON payments(checkout_request_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON subscription_plans TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON members TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON payments TO service_role;

DROP POLICY IF EXISTS "anon_read_subscription_plans" ON subscription_plans;
CREATE POLICY "anon_read_subscription_plans"
ON subscription_plans FOR SELECT
TO anon, authenticated
USING (true);

INSERT INTO subscription_plans (name, price_ksh, duration_days, description, features, is_active, sort_order)
VALUES (
  'Monthly Premium',
  199,
  30,
  'Unlock all daily editions with full fixture breakdowns, deeper analysis notes, and the complete recent archive beyond the 3-day window.',
  ARRAY[
    'All four daily formats: Safe Picks, Super 5, Super 10, All-Matches',
    'Full fixture, market and selection details for every edition',
    'Extended archive access beyond 3 days',
    'Detailed edition analysis notes',
    'Recorded track record and results history'
  ],
  true,
  0
)
ON CONFLICT DO NOTHING;
