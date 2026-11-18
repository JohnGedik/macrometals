-- Run against an isolated Supabase database after applying migrations.
begin;

insert into auth.users (id, email) values
  ('31000000-0000-4000-8000-000000000001', 'model-first@example.test'),
  ('31000000-0000-4000-8000-000000000002', 'model-second@example.test');

set local role authenticated;
select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);

do $$
declare
  owner uuid := auth.uid();
  first_id uuid;
  second_id uuid;
  valid jsonb := '{"real-rates":20,"gold-seasonality":5,"dxy":20,"central-bank-purchases":15,"etf-holdings":15,"breakeven":5,"m2":10,"geopolitical-risk":5,"cot-positioning":5}';
begin
  insert into public.metal_models (user_id, commodity, name, weights) values (owner, 'gold', 'First', valid)
    returning id into first_id;
  insert into public.metal_models (user_id, commodity, name, weights) values (owner, 'gold', 'Second', valid)
    returning id into second_id;
  perform set_config('metal_model_test.first_id', first_id::text, true);

  begin
    update public.metal_models set weights = valid || '{"dxy":19}' where id = first_id;
    raise exception 'Accepted weights that do not total 100';
  exception when check_violation then null;
  end;
  begin
    update public.metal_models set weights = (valid - 'dxy') || '{"unrecognized":20}' where id = first_id;
    raise exception 'Accepted an unknown indicator';
  exception when check_violation then null;
  end;

  update public.metal_models set name = 'Renamed' where id = first_id and revision = 1;
  if not exists (select 1 from public.metal_models where id = first_id and name = 'Renamed' and revision = 2) then
    raise exception 'Rename did not persist or advance the revision';
  end if;

  insert into public.metal_model_defaults values (owner, 'gold', second_id);
  insert into public.metal_model_defaults values (owner, 'gold', first_id)
    on conflict (user_id, commodity) do update set model_id = excluded.model_id;
  if not exists (select 1 from public.metal_model_defaults where model_id = first_id) then
    raise exception 'Default was not replaced';
  end if;
  begin
    insert into public.metal_model_defaults values (owner, 'silver', first_id);
    raise exception 'Accepted a default from another commodity';
  exception when foreign_key_violation then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000002', true);

do $$
declare
  other_model uuid := current_setting('metal_model_test.first_id')::uuid;
begin
  if exists (select 1 from public.metal_models where id = other_model)
    or exists (select 1 from public.metal_model_defaults where model_id = other_model) then
    raise exception 'Another user can see a private model or default';
  end if;
  update public.metal_models set name = 'Other user' where id = other_model;
  if found then raise exception 'Another user can rename the model'; end if;
  delete from public.metal_models where id = other_model;
  if found then raise exception 'Another user can delete the model'; end if;
  begin
    insert into public.metal_model_defaults values (auth.uid(), 'gold', other_model);
    raise exception 'Accepted a default from another user';
  exception when foreign_key_violation then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '31000000-0000-4000-8000-000000000001', true);

do $$
declare
  first_id uuid := current_setting('metal_model_test.first_id')::uuid;
begin
  delete from public.metal_models where id = first_id and revision = 2;
  if not found or exists (select 1 from public.metal_model_defaults where model_id = first_id) then
    raise exception 'Deleting the model did not clear its default';
  end if;
end;
$$;

rollback;
