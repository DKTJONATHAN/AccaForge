-- Harden M-Pesa premium payment settlement.
-- Callbacks are untrusted until Daraja STK Query independently confirms the matching transaction.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS poll_token_hash text,
  ADD COLUMN IF NOT EXISTS session_token text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_mpesa_receipt_unique
  ON public.payments (mpesa_receipt)
  WHERE mpesa_receipt IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_premium_payment(
  p_checkout_request_id text,
  p_amount_ksh integer,
  p_member_phone text,
  p_mpesa_receipt text,
  p_result_code integer,
  p_result_desc text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_member public.members%ROWTYPE;
  v_token text;
  v_expiry timestamptz;
  v_start timestamptz;
  v_member_exists boolean;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE checkout_request_id = p_checkout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  IF v_payment.status = 'success' AND v_payment.session_token IS NOT NULL THEN
    RETURN jsonb_build_object('session_token', v_payment.session_token, 'expires_at', v_payment.expires_at, 'activated', false);
  END IF;
  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending';
  END IF;
  IF p_result_code <> 0
     OR p_amount_ksh <> v_payment.amount_ksh
     OR p_member_phone <> v_payment.member_phone
     OR length(coalesce(p_mpesa_receipt, '')) < 6 THEN
    RAISE EXCEPTION 'payment_verification_mismatch';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_payment.plan_id;
  IF NOT FOUND OR v_plan.duration_days < 1 THEN
    RAISE EXCEPTION 'invalid_subscription_plan';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payments
    WHERE mpesa_receipt = p_mpesa_receipt AND checkout_request_id <> p_checkout_request_id
  ) THEN
    RAISE EXCEPTION 'mpesa_receipt_already_used';
  END IF;

  SELECT * INTO v_member
  FROM public.members
  WHERE phone = v_payment.member_phone
  FOR UPDATE;
  v_member_exists := FOUND;
  v_start := CASE
    WHEN v_member_exists AND v_member.expires_at > now() THEN v_member.expires_at
    ELSE now()
  END;
  v_expiry := v_start + make_interval(days => v_plan.duration_days);
  v_token := encode(gen_random_bytes(32), 'hex');

  IF v_member_exists THEN
    UPDATE public.members
    SET plan_id = v_payment.plan_id, status = 'active', session_token = v_token,
        expires_at = v_expiry, updated_at = now()
    WHERE id = v_member.id;
  ELSE
    INSERT INTO public.members (phone, plan_id, status, session_token, expires_at)
    VALUES (v_payment.member_phone, v_payment.plan_id, 'active', v_token, v_expiry);
  END IF;

  UPDATE public.payments
  SET status = 'success', mpesa_receipt = p_mpesa_receipt,
      result_code = p_result_code, result_desc = p_result_desc,
      callback_received = true, session_token = v_token, expires_at = v_expiry, updated_at = now()
  WHERE id = v_payment.id;

  RETURN jsonb_build_object('session_token', v_token, 'expires_at', v_expiry, 'activated', true);
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_premium_payment(text, integer, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_premium_payment(text, integer, text, text, integer, text)
  TO service_role;

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.members, public.payments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.members, public.payments TO service_role;
