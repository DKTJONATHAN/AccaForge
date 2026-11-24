-- Account-based Premium foundation.
-- Public browsing remains anonymous. Only Premium-specific resources are private.
-- Existing phone-keyed members/payments are retained and linked after verified phone ownership.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email, avatar_url)
  VALUES (
    NEW.id,
    NULLIF(COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'), ''),
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', '')
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE TABLE IF NOT EXISTS public.user_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  verification_method text CHECK (verification_method IN ('supabase_phone_otp', 'verified_mpesa_payment', 'admin_review')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_phones_phone_format CHECK (phone ~ '^254[17][0-9]{8}$'),
  CONSTRAINT user_phones_user_phone_unique UNIQUE (user_id, phone)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_phones_phone_unique_verified
  ON public.user_phones(phone) WHERE verified_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS user_phones_one_primary_per_user
  ON public.user_phones(user_id) WHERE is_primary;

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS members_user_id_idx ON public.members(user_id);

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS renewal_mode text NOT NULL DEFAULT 'manual'
    CHECK (renewal_mode IN ('manual', 'ratiba')),
  ADD COLUMN IF NOT EXISTS provider_event_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS payments_user_created_idx
  ON public.payments(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_event_unique
  ON public.payments(provider_event_id) WHERE provider_event_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  phone text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'pending', 'past_due')),
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  auto_renew_enabled boolean NOT NULL DEFAULT false,
  renewal_provider text CHECK (renewal_provider IN ('daraja_ratiba')),
  renewal_reference text,
  source_member_id uuid UNIQUE REFERENCES public.members(id) ON DELETE SET NULL,
  source_payment_id uuid UNIQUE REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_expiry_after_start CHECK (expires_at > starts_at)
);
CREATE INDEX IF NOT EXISTS subscriptions_user_history_idx
  ON public.subscriptions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_active_expiry_idx
  ON public.subscriptions(user_id, expires_at DESC)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'payment_started', 'payment_succeeded', 'payment_failed', 'subscription_activated',
    'subscription_extended', 'renewal_authorized', 'renewal_cancelled',
    'refund_requested', 'refund_approved', 'refund_rejected', 'refund_completed'
  )),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_events_user_created_idx
  ON public.billing_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.renewal_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider = 'daraja_ratiba'),
  provider_reference text UNIQUE,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'cancelled', 'failed')),
  terms_version text NOT NULL,
  customer_authorized_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT renewal_authorization_active_requires_consent
    CHECK (status <> 'active' OR customer_authorized_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS renewal_authorizations_user_idx
  ON public.renewal_authorizations(user_id, created_at DESC);

-- Premium fixtures and predictions are stored separately from public D1 editions.
-- No anon/authenticated SELECT policies or grants are created for these tables.
CREATE TABLE IF NOT EXISTS public.premium_fixtures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  sport_key text NOT NULL,
  competition text NOT NULL,
  commence_time timestamptz NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  raw_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  fixture_status text NOT NULL DEFAULT 'scheduled'
    CHECK (fixture_status IN ('scheduled', 'in_play', 'finished', 'cancelled', 'postponed')),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS premium_fixtures_commence_idx
  ON public.premium_fixtures(commence_time);

CREATE TABLE IF NOT EXISTS public.premium_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.premium_fixtures(id) ON DELETE CASCADE,
  publication_date date NOT NULL,
  market_key text NOT NULL,
  market_name text NOT NULL,
  selection_name text NOT NULL,
  odds numeric(8,3) NOT NULL CHECK (odds > 1 AND odds <= 1000),
  bookmaker text NOT NULL,
  estimated_probability numeric(5,2) CHECK (estimated_probability > 0 AND estimated_probability < 100),
  confidence_score numeric(5,2) CHECK (confidence_score >= 0 AND confidence_score <= 100),
  reasoning text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'validated', 'published', 'withheld', 'settled')),
  result text CHECK (result IN ('won', 'lost', 'void', 'pending', 'push')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fixture_id, publication_date, market_key, selection_name)
);
CREATE INDEX IF NOT EXISTS premium_predictions_publication_idx
  ON public.premium_predictions(publication_date DESC, status);

CREATE TABLE IF NOT EXISTS public.premium_workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name text NOT NULL,
  publication_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'withheld')),
  fixtures_discovered integer NOT NULL DEFAULT 0,
  predictions_validated integer NOT NULL DEFAULT 0,
  predictions_published integer NOT NULL DEFAULT 0,
  failure_code text,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS premium_workflow_runs_date_idx
  ON public.premium_workflow_runs(publication_date DESC, started_at DESC);

-- RLS: profile and account owners can see their own account/billing records.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.renewal_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = (SELECT auth.uid()));
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS user_phones_select_own ON public.user_phones;
CREATE POLICY user_phones_select_own ON public.user_phones
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS subscriptions_select_own ON public.subscriptions;
CREATE POLICY subscriptions_select_own ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS billing_events_select_own ON public.billing_events;
CREATE POLICY billing_events_select_own ON public.billing_events
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS renewal_authorizations_select_own ON public.renewal_authorizations;
CREATE POLICY renewal_authorizations_select_own ON public.renewal_authorizations
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));

-- Browser users must not read/write the legacy member/payment tables or any
-- Premium fixture/prediction/workflow data directly through the Supabase API.
REVOKE ALL ON public.members, public.payments FROM anon, authenticated;
REVOKE ALL ON public.premium_fixtures, public.premium_predictions, public.premium_workflow_runs FROM anon, authenticated;
GRANT SELECT ON public.profiles, public.user_phones, public.subscriptions,
  public.billing_events, public.renewal_authorizations TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;
GRANT SELECT ON public.subscription_plans TO anon, authenticated;

-- Link an existing active phone-based membership only after Supabase Auth has
-- confirmed control of the same phone number. Never overwrite an account link.
CREATE OR REPLACE FUNCTION public.claim_legacy_premium_subscription(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_member public.members%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_phone text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_plan_id uuid;
  v_starts_at timestamptz;
  v_expires_at timestamptz;
  v_subscription_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF v_phone !~ '^254[17][0-9]{8}$' THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = v_user_id
      AND regexp_replace(COALESCE(u.phone, ''), '[^0-9]', '', 'g') = v_phone
      AND u.phone_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'phone_not_verified_for_account';
  END IF;

  SELECT * INTO v_member FROM public.members
  WHERE phone = v_phone FOR UPDATE;

  IF FOUND THEN
    IF v_member.user_id IS NOT NULL AND v_member.user_id <> v_user_id THEN
      RAISE EXCEPTION 'membership_already_claimed';
    END IF;
    v_plan_id := v_member.plan_id;
    v_expires_at := v_member.expires_at;
    v_starts_at := COALESCE(v_member.created_at, now());
    IF v_member.status <> 'active' OR v_expires_at IS NULL OR v_expires_at <= now() THEN
      RAISE EXCEPTION 'no_active_legacy_subscription';
    END IF;
    UPDATE public.members SET user_id = v_user_id, claimed_at = COALESCE(claimed_at, now())
      WHERE id = v_member.id;
  ELSE
    -- Recovery path for a successful historic payment whose member row is absent.
    SELECT * INTO v_payment FROM public.payments
    WHERE member_phone = v_phone AND status = 'success'
      AND expires_at IS NOT NULL AND expires_at > now()
    ORDER BY expires_at DESC, created_at DESC
    LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'no_active_legacy_subscription';
    END IF;
    v_plan_id := v_payment.plan_id;
    v_expires_at := v_payment.expires_at;
    v_starts_at := COALESCE(v_payment.created_at, now());
    INSERT INTO public.members(phone, plan_id, status, expires_at, user_id, claimed_at)
    VALUES(v_phone, v_plan_id, 'active', v_expires_at, v_user_id, now())
    RETURNING * INTO v_member;
  END IF;

  UPDATE public.payments SET user_id = v_user_id
  WHERE member_phone = v_phone AND status = 'success' AND user_id IS NULL;

  SELECT id INTO v_subscription_id FROM public.subscriptions
  WHERE source_member_id = v_member.id OR (user_id = v_user_id AND status = 'active' AND expires_at = v_expires_at)
  LIMIT 1;

  IF v_subscription_id IS NULL THEN
    INSERT INTO public.subscriptions(
      user_id, plan_id, phone, status, starts_at, expires_at, source_member_id
    ) VALUES (
      v_user_id, v_plan_id, v_phone, 'active', v_starts_at, v_expires_at, v_member.id
    ) RETURNING id INTO v_subscription_id;
  END IF;

  INSERT INTO public.billing_events(user_id, subscription_id, event_type, details)
  VALUES(v_user_id, v_subscription_id, 'subscription_activated',
    jsonb_build_object('source', 'legacy_phone_claim', 'expires_at', v_expires_at));

  RETURN jsonb_build_object(
    'claimed', true,
    'subscription_id', v_subscription_id,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.claim_legacy_premium_subscription(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_legacy_premium_subscription(text) TO authenticated;

-- All operational writes to billing and Premium data are server-only.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.premium_fixtures,
  public.premium_predictions, public.premium_workflow_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions, public.billing_events,
  public.renewal_authorizations, public.user_phones TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
