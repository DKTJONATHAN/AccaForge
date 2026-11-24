-- Tighten the account-based Premium foundation after production advisor review.
-- Premium tables intentionally have no browser policies: service_role-only access.
ALTER TABLE public.premium_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_workflow_runs ENABLE ROW LEVEL SECURITY;

-- Trigger functions are invoked by the trigger, not exposed as RPC endpoints.
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- Cover account billing foreign-key access paths.
CREATE INDEX IF NOT EXISTS billing_events_payment_id_idx ON public.billing_events(payment_id);
CREATE INDEX IF NOT EXISTS billing_events_subscription_id_idx ON public.billing_events(subscription_id);
CREATE INDEX IF NOT EXISTS renewal_authorizations_subscription_id_idx ON public.renewal_authorizations(subscription_id);
CREATE INDEX IF NOT EXISTS subscriptions_plan_id_idx ON public.subscriptions(plan_id);
