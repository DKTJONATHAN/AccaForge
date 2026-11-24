CREATE INDEX IF NOT EXISTS premium_predictions_fixture_status_idx
  ON public.premium_predictions(fixture_id, status, result);
CREATE INDEX IF NOT EXISTS premium_fixtures_status_commence_idx
  ON public.premium_fixtures(fixture_status, commence_time);
CREATE INDEX IF NOT EXISTS premium_workflow_runs_name_started_idx
  ON public.premium_workflow_runs(workflow_name, started_at DESC);
