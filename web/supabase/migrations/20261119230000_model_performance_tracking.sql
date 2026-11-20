create table public.performance_frameworks (
  version integer primary key,
  neutral_band_percent numeric not null check (neutral_band_percent >= 0),
  description text not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index performance_frameworks_one_active_idx
  on public.performance_frameworks (active)
  where active;

insert into public.performance_frameworks (version, neutral_band_percent, description, active)
values (1, 2, 'Simple directional accuracy', true);

create table public.models (
  model_id uuid primary key,
  user_id uuid references auth.users (id) on delete set null,
  model_name text not null check (model_name = btrim(model_name) and char_length(model_name) between 1 and 80),
  metal text not null check (metal in ('gold', 'silver', 'copper', 'oil')),
  indicator_weights jsonb not null,
  model_version integer not null default 1 check (model_version > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index models_active_metal_idx on public.models (metal) where active;
create index models_user_idx on public.models (user_id) where user_id is not null;

insert into public.models (model_id, model_name, metal, indicator_weights) values
  ('00000000-0000-4000-8000-000000000001', 'Gold Default Model', 'gold',
    '{"real-rates":20,"gold-seasonality":5,"dxy":20,"central-bank-purchases":15,"etf-holdings":15,"breakeven":5,"m2":10,"geopolitical-risk":5,"cot-positioning":5}'),
  ('00000000-0000-4000-8000-000000000002', 'Silver Default Model', 'silver',
    '{"real-rates":20,"dxy":15,"industrial-demand":20,"solar-demand":15,"etf-holdings":10,"mine-supply":10,"breakeven":5,"cot-positioning":5}'),
  ('00000000-0000-4000-8000-000000000003', 'Copper Default Model', 'copper',
    '{"industrial-demand":20,"china-pmi":20,"exchange-inventories":15,"mine-supply":15,"dxy":10,"real-rates":10,"energy-transition-demand":5,"cot-positioning":5}'),
  ('00000000-0000-4000-8000-000000000004', 'Oil Default Model', 'oil',
    '{"global-demand":20,"global-supply":20,"commercial-inventories":15,"spare-capacity":15,"refinery-runs":10,"dxy":10,"geopolitical-risk":5,"cot-positioning":5}');

insert into public.models (model_id, user_id, model_name, metal, indicator_weights, model_version, active, created_at, updated_at)
select id, user_id, name, commodity, weights, revision, true, created_at, updated_at
from public.metal_models;

create function public.sync_performance_model()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.models
    set active = false, updated_at = now()
    where model_id = old.id and user_id = old.user_id;
    return old;
  end if;

  insert into public.models (
    model_id, user_id, model_name, metal, indicator_weights, model_version, active, created_at, updated_at
  ) values (
    new.id, new.user_id, new.name, new.commodity, new.weights, new.revision, true, new.created_at, new.updated_at
  )
  on conflict (model_id) do update set
    user_id = excluded.user_id,
    model_name = excluded.model_name,
    metal = excluded.metal,
    indicator_weights = excluded.indicator_weights,
    model_version = excluded.model_version,
    active = true,
    updated_at = excluded.updated_at;
  return new;
end;
$$;

create trigger sync_performance_model_after_change
after insert or update or delete on public.metal_models
for each row execute function public.sync_performance_model();

create table public.model_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models (model_id),
  snapshot_date date not null,
  model_version integer not null check (model_version > 0),
  scoring_engine_version text not null,
  score numeric check (score is null or score between 0 and 100),
  signal text check (signal is null or signal in ('strong_bullish', 'bullish', 'neutral', 'bearish', 'strong_bearish')),
  asset_price numeric check (asset_price is null or asset_price > 0),
  weights_used jsonb not null,
  created_at timestamptz not null default now(),
  unique (model_id, snapshot_date),
  check (snapshot_date <= (now() at time zone 'utc')::date)
);

create table public.snapshot_indicator_contributions (
  contribution_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.model_snapshots (snapshot_id) on delete restrict,
  indicator_name text not null,
  indicator_weight numeric not null check (indicator_weight between 0 and 100),
  indicator_value numeric,
  normalized_indicator_score numeric check (normalized_indicator_score is null or normalized_indicator_score between 0 and 100),
  contribution_to_model_score numeric,
  created_at timestamptz not null default now(),
  unique (snapshot_id, indicator_name)
);

create table public.model_performance (
  performance_id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null unique references public.model_snapshots (snapshot_id) on delete restrict,
  return_7d numeric,
  return_30d numeric,
  return_90d numeric,
  return_180d numeric,
  prediction_correct_7d boolean,
  prediction_correct_30d boolean,
  prediction_correct_90d boolean,
  prediction_correct_180d boolean,
  accuracy_framework_version integer not null references public.performance_frameworks (version),
  neutral_band_percent numeric not null check (neutral_band_percent >= 0),
  calculated_at timestamptz not null default now()
);

create index model_snapshots_date_idx on public.model_snapshots (snapshot_date);
create index snapshot_contributions_snapshot_idx on public.snapshot_indicator_contributions (snapshot_id);
create index model_performance_pending_idx on public.model_performance (snapshot_id)
  where return_7d is null or return_30d is null or return_90d is null or return_180d is null;

create function public.reject_model_snapshot_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Model snapshot history is append-only';
end;
$$;

create trigger model_snapshots_are_append_only
before update or delete on public.model_snapshots
for each row execute function public.reject_model_snapshot_mutation();

create trigger snapshot_contributions_are_append_only
before update or delete on public.snapshot_indicator_contributions
for each row execute function public.reject_model_snapshot_mutation();

create function public.capture_model_snapshot(
  p_model_id uuid,
  p_snapshot_date date,
  p_model_version integer,
  p_scoring_engine_version text,
  p_score numeric,
  p_signal text,
  p_asset_price numeric,
  p_weights_used jsonb,
  p_contributions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot uuid;
  contribution_count integer;
begin
  if not exists (select 1 from public.models where model_id = p_model_id and active) then
    raise exception 'Model is not active';
  end if;
  if p_snapshot_date > (now() at time zone 'utc')::date or jsonb_typeof(p_weights_used) <> 'object'
      or jsonb_typeof(p_contributions) <> 'array' then
    raise exception 'Invalid model snapshot';
  end if;
  if p_signal is not null and p_signal not in ('strong_bullish', 'bullish', 'neutral', 'bearish', 'strong_bearish') then
    raise exception 'Invalid model signal';
  end if;

  insert into public.model_snapshots (
    model_id, snapshot_date, model_version, scoring_engine_version, score, signal, asset_price, weights_used
  ) values (
    p_model_id, p_snapshot_date, p_model_version, p_scoring_engine_version, p_score, p_signal, p_asset_price, p_weights_used
  )
  on conflict (model_id, snapshot_date) do nothing
  returning snapshot_id into snapshot;

  if snapshot is null then
    select snapshot_id into snapshot
    from public.model_snapshots
    where model_id = p_model_id and snapshot_date = p_snapshot_date;
    return jsonb_build_object('snapshot_id', snapshot, 'created', false);
  end if;

  insert into public.snapshot_indicator_contributions (
    snapshot_id, indicator_name, indicator_weight, indicator_value,
    normalized_indicator_score, contribution_to_model_score
  )
  select
    snapshot,
    contribution.indicator_name,
    contribution.indicator_weight,
    contribution.indicator_value,
    contribution.normalized_indicator_score,
    contribution.contribution_to_model_score
  from jsonb_to_recordset(p_contributions) as contribution(
    indicator_name text,
    indicator_weight numeric,
    indicator_value numeric,
    normalized_indicator_score numeric,
    contribution_to_model_score numeric
  );
  get diagnostics contribution_count = row_count;

  if contribution_count = 0 or contribution_count <> jsonb_array_length(p_contributions)
      or contribution_count <> jsonb_object_length(p_weights_used) then
    raise exception 'Snapshot contributions do not match the indicator weights';
  end if;

  return jsonb_build_object('snapshot_id', snapshot, 'created', true);
end;
$$;

create function public.evaluate_model_performance(p_as_of date default (now() at time zone 'utc')::date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  framework record;
  evaluated_count integer;
begin
  select version, neutral_band_percent into framework
  from public.performance_frameworks
  where active
  order by version desc
  limit 1;
  if framework.version is null then
    raise exception 'No active performance framework';
  end if;

  with candidates as (
    select
      snapshot.snapshot_id,
      snapshot.asset_price,
      snapshot.signal,
      (select future.asset_price
        from public.model_snapshots future
        join public.models future_model on future_model.model_id = future.model_id
        where future_model.metal = model.metal
          and future.snapshot_date = snapshot.snapshot_date + 7
          and future.asset_price is not null
        order by future.snapshot_id
        limit 1) as price_7d,
      (select future.asset_price
        from public.model_snapshots future
        join public.models future_model on future_model.model_id = future.model_id
        where future_model.metal = model.metal
          and future.snapshot_date = snapshot.snapshot_date + 30
          and future.asset_price is not null
        order by future.snapshot_id
        limit 1) as price_30d,
      (select future.asset_price
        from public.model_snapshots future
        join public.models future_model on future_model.model_id = future.model_id
        where future_model.metal = model.metal
          and future.snapshot_date = snapshot.snapshot_date + 90
          and future.asset_price is not null
        order by future.snapshot_id
        limit 1) as price_90d,
      (select future.asset_price
        from public.model_snapshots future
        join public.models future_model on future_model.model_id = future.model_id
        where future_model.metal = model.metal
          and future.snapshot_date = snapshot.snapshot_date + 180
          and future.asset_price is not null
        order by future.snapshot_id
        limit 1) as price_180d
    from public.model_snapshots snapshot
    join public.models model on model.model_id = snapshot.model_id
    where snapshot.snapshot_date <= p_as_of - 7
      and snapshot.asset_price is not null
      and snapshot.signal is not null
  ), returns as (
    select *,
      (price_7d / asset_price - 1) * 100 as return_7d,
      (price_30d / asset_price - 1) * 100 as return_30d,
      (price_90d / asset_price - 1) * 100 as return_90d,
      (price_180d / asset_price - 1) * 100 as return_180d
    from candidates
  ), accuracy as (
    select *,
      case when return_7d is null then null
        when signal in ('strong_bullish', 'bullish') then return_7d > 0
        when signal in ('strong_bearish', 'bearish') then return_7d < 0
        else return_7d between -framework.neutral_band_percent and framework.neutral_band_percent
      end as correct_7d,
      case when return_30d is null then null
        when signal in ('strong_bullish', 'bullish') then return_30d > 0
        when signal in ('strong_bearish', 'bearish') then return_30d < 0
        else return_30d between -framework.neutral_band_percent and framework.neutral_band_percent
      end as correct_30d,
      case when return_90d is null then null
        when signal in ('strong_bullish', 'bullish') then return_90d > 0
        when signal in ('strong_bearish', 'bearish') then return_90d < 0
        else return_90d between -framework.neutral_band_percent and framework.neutral_band_percent
      end as correct_90d,
      case when return_180d is null then null
        when signal in ('strong_bullish', 'bullish') then return_180d > 0
        when signal in ('strong_bearish', 'bearish') then return_180d < 0
        else return_180d between -framework.neutral_band_percent and framework.neutral_band_percent
      end as correct_180d
    from returns
  )
  insert into public.model_performance (
    snapshot_id,
    return_7d, return_30d, return_90d, return_180d,
    prediction_correct_7d, prediction_correct_30d, prediction_correct_90d, prediction_correct_180d,
    accuracy_framework_version, neutral_band_percent, calculated_at
  )
  select
    calculation.snapshot_id,
    calculation.return_7d, calculation.return_30d, calculation.return_90d, calculation.return_180d,
    calculation.correct_7d, calculation.correct_30d, calculation.correct_90d, calculation.correct_180d,
    framework.version, framework.neutral_band_percent, now()
  from accuracy calculation
  left join public.model_performance existing on existing.snapshot_id = calculation.snapshot_id
  where (
      calculation.return_7d is not null
      or calculation.return_30d is not null
      or calculation.return_90d is not null
      or calculation.return_180d is not null
    ) and (
      calculation.return_7d is not null and existing.return_7d is null
      or calculation.return_30d is not null and existing.return_30d is null
      or calculation.return_90d is not null and existing.return_90d is null
      or calculation.return_180d is not null and existing.return_180d is null
    )
  on conflict (snapshot_id) do update set
    return_7d = coalesce(model_performance.return_7d, excluded.return_7d),
    return_30d = coalesce(model_performance.return_30d, excluded.return_30d),
    return_90d = coalesce(model_performance.return_90d, excluded.return_90d),
    return_180d = coalesce(model_performance.return_180d, excluded.return_180d),
    prediction_correct_7d = coalesce(model_performance.prediction_correct_7d, excluded.prediction_correct_7d),
    prediction_correct_30d = coalesce(model_performance.prediction_correct_30d, excluded.prediction_correct_30d),
    prediction_correct_90d = coalesce(model_performance.prediction_correct_90d, excluded.prediction_correct_90d),
    prediction_correct_180d = coalesce(model_performance.prediction_correct_180d, excluded.prediction_correct_180d),
    calculated_at = now();
  get diagnostics evaluated_count = row_count;
  return evaluated_count;
end;
$$;

create view public.model_performance_metrics
with (security_barrier = true, security_invoker = true) as
with horizons(horizon_days) as (values (7), (30), (90), (180)),
evaluations as (
  select
    snapshot.model_id,
    7 as horizon_days,
    performance.return_7d as forward_return,
    performance.prediction_correct_7d as prediction_correct,
    snapshot.signal
  from public.model_snapshots snapshot
  join public.model_performance performance on performance.snapshot_id = snapshot.snapshot_id
  where performance.return_7d is not null
  union all
  select snapshot.model_id, 30, performance.return_30d, performance.prediction_correct_30d, snapshot.signal
  from public.model_snapshots snapshot
  join public.model_performance performance on performance.snapshot_id = snapshot.snapshot_id
  where performance.return_30d is not null
  union all
  select snapshot.model_id, 90, performance.return_90d, performance.prediction_correct_90d, snapshot.signal
  from public.model_snapshots snapshot
  join public.model_performance performance on performance.snapshot_id = snapshot.snapshot_id
  where performance.return_90d is not null
  union all
  select snapshot.model_id, 180, performance.return_180d, performance.prediction_correct_180d, snapshot.signal
  from public.model_snapshots snapshot
  join public.model_performance performance on performance.snapshot_id = snapshot.snapshot_id
  where performance.return_180d is not null
)
select
  model.model_id,
  horizon.horizon_days,
  count(evaluation.forward_return)::integer as total_predictions,
  count(evaluation.forward_return) filter (where evaluation.prediction_correct)::integer as correct_predictions,
  case when count(evaluation.forward_return) = 0 then null
    else 100.0 * count(evaluation.forward_return) filter (where evaluation.prediction_correct)
      / count(evaluation.forward_return)
  end as accuracy_percentage,
  avg(evaluation.forward_return) as average_forward_return,
  avg(evaluation.forward_return) filter (where evaluation.signal in ('strong_bullish', 'bullish')) as average_return_after_bullish_signals,
  avg(evaluation.forward_return) filter (where evaluation.signal in ('strong_bearish', 'bearish')) as average_return_after_bearish_signals
from public.models model
cross join horizons horizon
left join evaluations evaluation
  on evaluation.model_id = model.model_id and evaluation.horizon_days = horizon.horizon_days
group by model.model_id, horizon.horizon_days;

alter table public.models enable row level security;
alter table public.performance_frameworks enable row level security;
alter table public.model_snapshots enable row level security;
alter table public.snapshot_indicator_contributions enable row level security;
alter table public.model_performance enable row level security;

revoke all on public.models, public.performance_frameworks, public.model_snapshots,
  public.snapshot_indicator_contributions, public.model_performance, public.model_performance_metrics
  from public, anon, authenticated;
grant select, insert, update on public.models, public.performance_frameworks, public.model_snapshots,
  public.snapshot_indicator_contributions, public.model_performance to service_role;
grant select on public.model_performance_metrics to service_role;
grant usage on schema public to service_role;
revoke all on function public.capture_model_snapshot(uuid, date, integer, text, numeric, text, numeric, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.evaluate_model_performance(date) from public, anon, authenticated;
grant execute on function public.capture_model_snapshot(uuid, date, integer, text, numeric, text, numeric, jsonb, jsonb) to service_role;
grant execute on function public.evaluate_model_performance(date) to service_role;
