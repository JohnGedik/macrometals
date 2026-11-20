-- Run against an isolated Supabase database after applying migrations.
begin;

set local role service_role;

do $$
declare
  model uuid := '00000000-0000-4000-8000-000000000001';
  past_date date := (now() at time zone 'utc')::date - 7;
  today date := (now() at time zone 'utc')::date;
  first_result jsonb;
  retry_result jsonb;
  contribution jsonb := '[{
    "indicator_name":"real-rates",
    "indicator_weight":100,
    "indicator_value":1.5,
    "normalized_indicator_score":50,
    "contribution_to_model_score":0
  }]';
  past_snapshot uuid;
begin
  first_result := public.capture_model_snapshot(
    model, past_date, 1, '1.0.0', 50, 'neutral', 100, '{"real-rates":100}', contribution
  );
  retry_result := public.capture_model_snapshot(
    model, past_date, 2, 'different-version', 100, 'strong_bullish', 200,
    '{"real-rates":100}', contribution
  );
  if not (first_result ->> 'created')::boolean or (retry_result ->> 'created')::boolean then
    raise exception 'Snapshot retry changed or replaced the daily observation';
  end if;
  past_snapshot := (first_result ->> 'snapshot_id')::uuid;
  if not exists (
    select 1 from public.model_snapshots
    where snapshot_id = past_snapshot and score = 50 and asset_price = 100 and model_version = 1
  ) or (select count(*) from public.model_snapshots where model_id = model and snapshot_date = past_date) <> 1 then
    raise exception 'Snapshot is not append-only and idempotent';
  end if;

  perform public.capture_model_snapshot(
    model, today, 1, '1.0.0', 50, 'neutral', 101, '{"real-rates":100}', contribution
  );
  if public.evaluate_model_performance(today) <> 1 then
    raise exception 'Expected one newly evaluated snapshot';
  end if;
  if public.evaluate_model_performance(today) <> 0 then
    raise exception 'Idempotent evaluation changed an existing performance row';
  end if;
  if not exists (
    select 1 from public.model_performance
    where snapshot_id = past_snapshot
      and return_7d = 1
      and prediction_correct_7d = true
      and return_30d is null
  ) then
    raise exception 'Neutral 7-day performance did not use the configured band';
  end if;
  if not exists (
    select 1 from public.model_performance_metrics
    where model_id = model and horizon_days = 7
      and total_predictions = 1 and correct_predictions = 1 and accuracy_percentage = 100
      and average_forward_return = 1
  ) then
    raise exception 'Performance metrics did not aggregate evaluated observations';
  end if;

  begin
    update public.model_snapshots set score = 51 where snapshot_id = past_snapshot;
    raise exception 'Updated append-only model snapshot';
  exception when raise_exception then
    if sqlerrm = 'Updated append-only model snapshot' then raise; end if;
  end;

  begin
    delete from public.snapshot_indicator_contributions where snapshot_id = past_snapshot;
    raise exception 'Deleted append-only indicator contribution';
  exception when raise_exception then
    if sqlerrm = 'Deleted append-only indicator contribution' then raise; end if;
  end;
end;
$$;

rollback;
