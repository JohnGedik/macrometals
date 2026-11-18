create function public.valid_metal_model_weights(commodity text, version integer, weights jsonb)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  indicators text[];
  item jsonb;
  weight numeric;
  total integer := 0;
  count_keys integer := 0;
begin
  if version <> 1 or jsonb_typeof(weights) is distinct from 'object' then
    return false;
  end if;
  indicators := case commodity
    when 'gold' then array['real-rates', 'gold-seasonality', 'dxy', 'central-bank-purchases', 'etf-holdings', 'breakeven', 'm2', 'geopolitical-risk', 'cot-positioning']
    when 'silver' then array['real-rates', 'dxy', 'industrial-demand', 'solar-demand', 'etf-holdings', 'mine-supply', 'breakeven', 'cot-positioning']
    when 'copper' then array['industrial-demand', 'china-pmi', 'exchange-inventories', 'mine-supply', 'dxy', 'real-rates', 'energy-transition-demand', 'cot-positioning']
    when 'oil' then array['global-demand', 'global-supply', 'commercial-inventories', 'spare-capacity', 'refinery-runs', 'dxy', 'geopolitical-risk', 'cot-positioning']
  end;
  if indicators is null or not weights ?& indicators then return false; end if;
  for item in select value from jsonb_each(weights) loop
    if jsonb_typeof(item) <> 'number' then return false; end if;
    weight := (item #>> '{}')::numeric;
    if weight < 0 or weight > 100 or weight <> trunc(weight) then return false; end if;
    total := total + weight::integer;
    count_keys := count_keys + 1;
    if total > 100 or count_keys > cardinality(indicators) then return false; end if;
  end loop;
  return total = 100 and count_keys = cardinality(indicators);
end;
$$;

create table public.metal_models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  commodity text not null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  weights jsonb not null,
  definition_version integer not null default 1,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint metal_models_weights_check check (public.valid_metal_model_weights(commodity, definition_version, weights)),
  unique (user_id, commodity, id)
);

create unique index metal_models_name_idx on public.metal_models (user_id, commodity, lower(name));

create function public.advance_metal_model_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

create trigger advance_metal_model_revision before update on public.metal_models
  for each row execute function public.advance_metal_model_revision();

create table public.metal_model_defaults (
  user_id uuid not null,
  commodity text not null,
  model_id uuid not null,
  primary key (user_id, commodity),
  foreign key (user_id, commodity, model_id)
    references public.metal_models (user_id, commodity, id) on delete cascade
);

alter table public.metal_models enable row level security;
alter table public.metal_model_defaults enable row level security;

create policy "Users manage their own metal models" on public.metal_models
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Users manage their own model defaults" on public.metal_model_defaults
  for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.metal_models, public.metal_model_defaults from public, anon, authenticated;
grant select, delete on public.metal_models to authenticated;
grant insert (user_id, commodity, name, weights), update (name, weights) on public.metal_models to authenticated;
grant select, insert, update, delete on public.metal_model_defaults to authenticated;
