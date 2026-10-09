-- Reviewers can be listed by email, phone, or both.
alter table public.admins drop constraint admins_pkey;
alter table public.admins add column id bigint generated always as identity primary key;
alter table public.admins alter column email drop not null;
alter table public.admins add constraint admins_email_key unique (email);
-- Phone is digits only with country code, e.g. 15551234567.
alter table public.admins add column phone text unique check (phone ~ '^[0-9]{11,15}$');
alter table public.admins add constraint admins_email_or_phone check (email is not null or phone is not null);

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
       or a.phone = regexp_replace(coalesce(auth.jwt() ->> 'phone', ''), '\D', '', 'g')
  );
$$;

-- Auth hook: only people on the reviewer list can get an account,
-- so nobody else can trigger a text (or an email).
-- Turn it on in Authentication -> Hooks -> "Before User Created".
create or replace function private.only_reviewers_sign_up(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  em text := lower(nullif(event -> 'user' ->> 'email', ''));
  ph text := nullif(regexp_replace(coalesce(event -> 'user' ->> 'phone', ''), '\D', '', 'g'), '');
begin
  if exists (select 1 from public.admins a
             where (em is not null and lower(a.email) = em)
                or (ph is not null and a.phone = ph)) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'That number isn''t on the reviewer list.'));
end;
$$;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.only_reviewers_sign_up(jsonb) to supabase_auth_admin;
revoke execute on function private.only_reviewers_sign_up(jsonb) from public, anon, authenticated;
