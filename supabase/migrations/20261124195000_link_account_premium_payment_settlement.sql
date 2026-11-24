-- Link successful account checkout settlement to the account subscription ledger.
-- The payment is still activated only after the existing Daraja STK Query verification.

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
  v_subscription_id uuid;
BEGIN
  SELECT * INTO v_payment
  FROM public.payments
  WHERE checkout_request_id = p_checkout_request_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'payment_not_found'; END IF;

  IF v_payment.status = 'success' AND v_payment.session_token IS NOT NULL THEN
    RETURN jsonb_build_object(
      'session_token', v_payment.session_token,
      'expires_at', v_payment.expires_at,
      'activated', false
    );
  END IF;
  IF v_payment.status <> 'pending' THEN RAISE EXCEPTION 'payment_not_pending'; END IF;
  IF p_result_code <> 0
     OR p_amount_ksh <> v_payment.amount_ksh
     OR p_member_phone <> v_payment.member_phone THEN
    RAISE EXCEPTION 'payment_verification_mismatch';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_payment.plan_id;
  IF NOT FOUND OR v_plan.duration_days < 1 THEN RAISE EXCEPTION 'invalid_subscription_plan'; END IF;
  IF p_mpesa_receipt IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payments
    WHERE mpesa_receipt = p_mpesa_receipt AND checkout_request_id <> p_checkout_request_id
  ) THEN RAISE EXCEPTION 'mpesa_receipt_already_used'; END IF;

  SELECT * INTO v_member FROM public.members
  WHERE phone = v_payment.member_phone FOR UPDATE;
  v_member_exists := FOUND;
  v_start := CASE
    WHEN v_member_exists AND v_member.expires_at > now() THEN v_member.expires_at
    ELSE now()
  END;
  v_expiry := v_start + make_interval(days => v_plan.duration_days);
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  IF v_member_exists THEN
    UPDATE public.members
    SET plan_id = v_payment.plan_id,
        status = 'active',
        session_token = v_token,
        expires_at = v_expiry,
        user_id = COALESCE(v_member.user_id, v_payment.user_id),
        updated_at = now()
    WHERE id = v_member.id;
  ELSE
    INSERT INTO public.members (phone, plan_id, status, session_token, expires_at, user_id)
    VALUES (v_payment.member_phone, v_payment.plan_id, 'active', v_token, v_expiry, v_payment.user_id)
    RETURNING * INTO v_member;
  END IF;

  UPDATE public.payments
  SET status = 'success',
      mpesa_receipt = p_mpesa_receipt,
      result_code = p_result_code,
      result_desc = p_result_desc,
      callback_received = true,
      session_token = v_token,
      expires_at = v_expiry,
      updated_at = now()
  WHERE id = v_payment.id;

  IF v_payment.user_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (
      user_id, plan_id, phone, status, starts_at, expires_at, source_payment_id
    ) VALUES (
      v_payment.user_id, v_payment.plan_id, v_payment.member_phone,
      'active', v_start, v_expiry, v_payment.id
    )
    ON CONFLICT (source_payment_id) DO NOTHING
    RETURNING id INTO v_subscription_id;

    IF v_subscription_id IS NULL THEN
      SELECT id INTO v_subscription_id FROM public.subscriptions
      WHERE source_payment_id = v_payment.id LIMIT 1;
    END IF;

    INSERT INTO public.billing_events(user_id, subscription_id, payment_id, event_type, details)
    VALUES (
      v_payment.user_id, v_subscription_id, v_payment.id, 'payment_succeeded',
      jsonb_build_object('amount_ksh', p_amount_ksh, 'mpesa_receipt', p_mpesa_receipt)
    );
    INSERT INTO public.billing_events(user_id, subscription_id, payment_id, event_type, details)
    VALUES (
      v_payment.user_id, v_subscription_id, v_payment.id,
      CASE WHEN v_member_exists THEN 'subscription_extended' ELSE 'subscription_activated' END,
      jsonb_build_object('plan_id', v_payment.plan_id, 'starts_at', v_start, 'expires_at', v_expiry)
    );
  END IF;

  RETURN jsonb_build_object(
    'session_token', v_token,
    'expires_at', v_expiry,
    'subscription_id', v_subscription_id,
    'activated', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_premium_payment(text, integer, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_premium_payment(text, integer, text, text, integer, text)
  TO service_role;
