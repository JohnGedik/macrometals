create or replace function public.ensure_own_profile()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  account auth.users%rowtype;
  profile_name text;
  profile_slug text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if exists (select 1 from public.profiles where id = auth.uid()) then
    return;
  end if;

  select * into strict account from auth.users where id = auth.uid();
  profile_name := coalesce(
    nullif(account.raw_user_meta_data ->> 'full_name', ''),
    nullif(account.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(account.email, '@', 1), ''),
    'Author'
  );
  profile_slug := 'author-' || replace(account.id::text, '-', '');

  insert into public.profiles (id, email, display_name, avatar_url, slug, username)
  values (account.id, account.email, profile_name, account.raw_user_meta_data ->> 'avatar_url', profile_slug, profile_slug)
  on conflict (id) do nothing;
end;
$$;

revoke all on function public.ensure_own_profile() from public, anon;
grant execute on function public.ensure_own_profile() to authenticated;
