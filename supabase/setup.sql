-- Kart Race Control: run this once in Supabase → SQL Editor → New query → Run.
-- 1) CHANGE THE PIN on the line marked below before running.
--    Use a word or phrase, not 4 digits (e.g. 'blue-shell-party').

create schema if not exists private;

create table if not exists private.admin (pin text not null);
delete from private.admin;
insert into private.admin (pin) values ('CHANGE-ME');   -- <<< your organizer PIN

create table if not exists public.tournaments (
  id text primary key,
  body jsonb not null default '{}'::jsonb,
  version bigint not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.tournaments (id) values ('live'), ('test') on conflict do nothing;

create table if not exists public.tournament_history (
  hid bigserial primary key,
  tid text not null,
  version bigint,
  body jsonb,
  saved_at timestamptz not null default now()
);

-- Anyone can read results; nobody can write except through the PIN-checked functions.
alter table public.tournaments enable row level security;
alter table public.tournament_history enable row level security;
drop policy if exists "read results" on public.tournaments;
create policy "read results" on public.tournaments for select to anon, authenticated using (true);
grant usage on schema public to anon, authenticated;
grant select on public.tournaments to anon, authenticated;

create or replace function public.check_pin(p_pin text)
returns boolean language sql security definer set search_path = public, private as $$
  select exists (select 1 from private.admin where pin = p_pin);
$$;

create or replace function public.save_state(p_pin text, p_id text, p_body jsonb, p_base bigint)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare cur bigint;
begin
  if not exists (select 1 from private.admin where pin = p_pin) then
    raise exception 'bad_pin';
  end if;
  if p_id not in ('live', 'test') then raise exception 'bad_id'; end if;
  select version into cur from public.tournaments where id = p_id for update;
  if cur is null then
    insert into public.tournaments (id, body, version) values (p_id, p_body, 1);
    return 1;
  end if;
  if p_base is not null and p_base <> cur then raise exception 'conflict'; end if;
  insert into public.tournament_history (tid, version, body)
    select id, version, body from public.tournaments where id = p_id;
  update public.tournaments set body = p_body, version = cur + 1, updated_at = now() where id = p_id;
  delete from public.tournament_history
    where tid = p_id and hid not in (
      select hid from public.tournament_history where tid = p_id order by hid desc limit 50);
  return cur + 1;
end $$;

create or replace function public.list_history(p_pin text, p_id text)
returns table (hid bigint, version bigint, saved_at timestamptz, body jsonb)
language plpgsql security definer set search_path = public, private as $$
begin
  if not exists (select 1 from private.admin where pin = p_pin) then raise exception 'bad_pin'; end if;
  return query select h.hid, h.version, h.saved_at, h.body from public.tournament_history h
    where h.tid = p_id order by h.hid desc limit 50;
end $$;

revoke all on function public.check_pin(text) from public;
revoke all on function public.save_state(text, text, jsonb, bigint) from public;
revoke all on function public.list_history(text, text) from public;
grant execute on function public.check_pin(text) to anon, authenticated;
grant execute on function public.save_state(text, text, jsonb, bigint) to anon, authenticated;
grant execute on function public.list_history(text, text) to anon, authenticated;

-- Live updates for the TV and phones.
do $$ begin
  alter publication supabase_realtime add table public.tournaments;
exception when duplicate_object then null; end $$;

-- To change the PIN later, run:
--   update private.admin set pin = 'new-pin-here';
