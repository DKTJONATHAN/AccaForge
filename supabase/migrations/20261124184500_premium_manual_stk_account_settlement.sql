-- Ratiba is not part of AccaForge Premium. Renewals always use a fresh customer-approved STK Push.
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_renewal_mode_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_renewal_mode_check CHECK (renewal_mode = 'manual');
UPDATE public.payments SET renewal_mode = 'manual' WHERE renewal_mode <> 'manual';
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_renewal_provider_check;
UPDATE public.subscriptions SET auto_renew_enabled = false, renewal_provider = NULL
WHERE auto_renew_enabled OR renewal_provider IS NOT NULL;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_renewal_provider_check
  CHECK (renewal_provider IS NULL OR renewal_provider = 'daraja_stk');
ALTER TABLE public.renewal_authorizations DROP CONSTRAINT IF EXISTS renewal_authorizations_provider_check;
ALTER TABLE public.renewal_authorizations ADD CONSTRAINT renewal_authorizations_provider_check CHECK (provider = 'daraja_stk');

CREATE OR REPLACE FUNCTION public.finalize_account_premium_payment(
  p_checkout_request_id text, p_amount_ksh integer, p_member_phone text,
  p_mpesa_receipt text, p_result_code integer, p_result_desc text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_member public.members%ROWTYPE;
  v_token text;
  v_expiry timestamptz;
  v_start timestamptz;
  v_subscription_id uuid;
  v_member_exists boolean;
  v_event_type text;
BEGIN
  SELECT * INTO v_payment FROM public.payments
  WHERE checkout_request_id = p_checkout_request_id FOR UPDATE;
  IF NOT FOUND OR v_payment.user_id IS NULL THEN RAISE EXCEPTION 'account_payment_not_found'; END IF;
  IF v_payment.status = 'success' THEN
    SELECT id INTO v_subscription_id FROM public.subscriptions WHERE source_payment_id = v_payment.id;
    RETURN jsonb_build_object('activated', false, 'subscription_id', v_subscription_id, 'expires_at', v_payment.expires_at);
  END IF;
  IF v_payment.status <> 'pending' THEN RAISE EXCEPTION 'payment_not_pending'; END IF;
  IF p_result_code <> 0 OR p_amount_ksh <> v_payment.amount_ksh OR p_member_phone <> v_payment.member_phone
    THEN RAISE EXCEPTION 'payment_verification_mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_phones up WHERE up.user_id = v_payment.user_id
    AND up.phone = v_payment.member_phone AND up.verified_at IS NOT NULL)
    THEN RAISE EXCEPTION 'payment_phone_not_verified_for_account'; END IF;
  IF p_mpesa_receipt IS NULL OR btrim(p_mpesa_receipt) = '' THEN RAISE EXCEPTION 'verified_mpesa_receipt_required'; END IF;
  IF EXISTS (SELECT 1 FROM public.payments WHERE mpesa_receipt = p_mpesa_receipt
    AND checkout_request_id <> p_checkout_request_id) THEN RAISE EXCEPTION 'mpesa_receipt_already_used'; END IF;
  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_payment.plan_id AND is_active = true;
  IF NOT FOUND OR v_plan.duration_days < 1 THEN RAISE EXCEPTION 'invalid_subscription_plan'; END IF;
  SELECT * INTO v_member FROM public.members WHERE phone = v_payment.member_phone FOR UPDATE;
  v_member_exists := FOUND;
  IF v_member_exists AND v_member.user_id IS NOT NULL AND v_member.user_id <> v_payment.user_id
    THEN RAISE EXCEPTION 'membership_already_claimed'; END IF;
  v_start := CASE WHEN v_member_exists AND v_member.expires_at > now() THEN v_member.expires_at ELSE now() END;
  v_expiry := v_start + make_interval(days => v_plan.duration_days);
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  IF v_member_exists THEN
    UPDATE public.members SET user_id = v_payment.user_id, claimed_at = COALESCE(claimed_at, now()),
      plan_id = v_payment.plan_id, status = 'active', session_token = v_token, expires_at = v_expiry, updated_at = now()
    WHERE id = v_member.id;
  ELSE
    INSERT INTO public.members(phone,user_id,claimed_at,plan_id,status,session_token,expires_at)
    VALUES(v_payment.member_phone,v_payment.user_id,now(),v_payment.plan_id,'active',v_token,v_expiry);
  END IF;
  INSERT INTO public.subscriptions(user_id,plan_id,phone,status,starts_at,expires_at,auto_renew_enabled,renewal_provider,source_payment_id)
  VALUES(v_payment.user_id,v_payment.plan_id,v_payment.member_phone,'active',v_start,v_expiry,false,NULL,v_payment.id)
  RETURNING id INTO v_subscription_id;
  UPDATE public.payments SET status='success',mpesa_receipt=p_mpesa_receipt,result_code=p_result_code,
    result_desc=p_result_desc,callback_received=true,session_token=v_token,expires_at=v_expiry,
    renewal_mode='manual',updated_at=now() WHERE id=v_payment.id;
  INSERT INTO public.billing_events(user_id,subscription_id,payment_id,event_type,details)
  VALUES(v_payment.user_id,v_subscription_id,v_payment.id,'payment_succeeded',
    jsonb_build_object('amount_ksh',v_payment.amount_ksh,'receipt',p_mpesa_receipt,'phone',v_payment.member_phone));
  v_event_type := CASE WHEN v_start > now() THEN 'subscription_extended' ELSE 'subscription_activated' END;
  INSERT INTO public.billing_events(user_id,subscription_id,payment_id,event_type,details)
  VALUES(v_payment.user_id,v_subscription_id,v_payment.id,v_event_type,
    jsonb_build_object('plan_id',v_payment.plan_id,'expires_at',v_expiry,'renewal_mode','manual'));
  RETURN jsonb_build_object('activated',true,'subscription_id',v_subscription_id,'session_token',v_token,'expires_at',v_expiry);
END;
$$;
REVOKE ALL ON FUNCTION public.finalize_account_premium_payment(text,integer,text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_account_premium_payment(text,integer,text,text,integer,text) TO service_role;
