create table public.fred_source_snapshots (
  id text primary key check (id ~ '^[0-9a-f]{64}$'),
  series_id text not null check (series_id in ('M2SL', 'T5YIE', 'DFII10')),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  schema_version integer not null check (schema_version = 1),
  definition jsonb not null check (jsonb_typeof(definition) = 'object'),
  raw_csv text not null check (octet_length(raw_csv) between 1 and 2097152),
  first_captured_at timestamptz not null default clock_timestamp(),
  check (checksum = encode(sha256(convert_to(raw_csv, 'UTF8')), 'hex')),
  check (definition ->> 'seriesId' is not null and definition ->> 'seriesId' = series_id)
);

create table public.fred_source_captures (
  id bigint generated always as identity primary key,
  series_id text not null,
  snapshot_id text not null references public.fred_source_snapshots(id),
  captured_at timestamptz not null default clock_timestamp()
);

create index fred_source_captures_series_time_idx
  on public.fred_source_captures(series_id, captured_at desc, id desc);

alter table public.fred_source_snapshots enable row level security;
alter table public.fred_source_captures enable row level security;
revoke all on public.fred_source_snapshots, public.fred_source_captures from public, anon, authenticated, service_role;
grant select on public.fred_source_snapshots, public.fred_source_captures to service_role;
revoke all on sequence public.fred_source_captures_id_seq from public, anon, authenticated, service_role;

create function public.capture_fred_snapshot(
  p_id text, p_series_id text, p_checksum text, p_definition jsonb,
  p_raw_csv text, p_schema_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  prior_capture public.fred_source_captures%rowtype;
  current_capture public.fred_source_captures%rowtype;
  stored public.fred_source_snapshots%rowtype;
  previous jsonb := null;
  changed boolean;
begin
  if p_series_id is null or p_series_id not in ('M2SL', 'T5YIE', 'DFII10')
    or p_id is null or p_id !~ '^[0-9a-f]{64}$'
    or p_schema_version is distinct from 1 or p_checksum is null
    or p_raw_csv is null or p_definition is null
    or p_checksum <> encode(sha256(convert_to(p_raw_csv, 'UTF8')), 'hex') then
    raise exception 'Invalid source snapshot';
  end if;

  perform pg_advisory_xact_lock(hashtext('fred-source:' || p_series_id));

  select * into prior_capture from public.fred_source_captures
    where series_id = p_series_id order by captured_at desc, id desc limit 1;

  insert into public.fred_source_snapshots(id, series_id, checksum, schema_version, definition, raw_csv)
    values (p_id, p_series_id, p_checksum, p_schema_version, p_definition, p_raw_csv)
    on conflict (id) do nothing;

  select * into stored from public.fred_source_snapshots where id = p_id;
  if stored.series_id <> p_series_id or stored.checksum <> p_checksum
    or stored.definition <> p_definition or stored.raw_csv <> p_raw_csv then
    raise exception 'Source snapshot identity mismatch';
  end if;

  changed := prior_capture.id is null or prior_capture.snapshot_id <> p_id;
  if changed then
    if prior_capture.id is not null then
      select jsonb_build_object(
        'id', source.id, 'schemaVersion', source.schema_version,
        'seriesId', source.series_id,
        'sourceUrl', 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' || source.series_id,
        'checksum', source.checksum,
        'capturedAt', extract(epoch from prior_capture.captured_at),
        'definition', source.definition, 'rawCsv', source.raw_csv
      ) into previous from public.fred_source_snapshots source where source.id = prior_capture.snapshot_id;
    end if;
    insert into public.fred_source_captures(series_id, snapshot_id)
      values (p_series_id, p_id) returning * into current_capture;
  else
    current_capture := prior_capture;
  end if;

  return jsonb_build_object('captured_at', current_capture.captured_at,
    'first_captured_at', stored.first_captured_at, 'previous', previous, 'changed', changed);
end;
$$;

revoke all on function public.capture_fred_snapshot(text, text, text, jsonb, text, integer) from public, anon, authenticated;
grant execute on function public.capture_fred_snapshot(text, text, text, jsonb, text, integer) to service_role;