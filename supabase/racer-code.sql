-- Kart Race Control: racer code (results entry only).
-- Run once in Supabase → SQL Editor → New query → Run. Safe to run again.
-- 1) CHANGE THE RACER CODE on the line marked below before running.
--    Racers type it on the site to enter places and mark cups finished.
--    Everything else (check-ins, rounds, finals, settings, reset) still needs your PIN.

alter table private.admin add column if not exists racer_code text;
update private.admin set racer_code = 'CHANGE-ME-TOO';   -- <<< racer code (different from your PIN)

-- Who is this code? 'admin', 'racer', or null.
create or replace function public.check_role(p_pin text)
returns text language sql security definer set search_path = public, private as $$
  select case
    when exists (select 1 from private.admin where pin = p_pin) then 'admin'
    when exists (select 1 from private.admin where racer_code is not null and racer_code <> '' and racer_code = p_pin) then 'racer'
    else null end;
$$;

-- The tournament with every result removed, so two versions can be compared
-- to confirm a racer only changed places / finished flags.
create or replace function private.strip_results(b jsonb)
returns jsonb language sql immutable as $$
  select jsonb_set(
    jsonb_set(coalesce(b, '{}'::jsonb), '{rounds}', coalesce((
      select jsonb_agg(
        case when jsonb_typeof(r->'heats') = 'array' then
          jsonb_set(r, '{heats}', coalesce((
            select jsonb_agg(h - 'res' - 'done' order by hi)
            from jsonb_array_elements(r->'heats') with ordinality as x(h, hi)), '[]'::jsonb))
        else r end
        order by ri)
      from jsonb_array_elements(case when jsonb_typeof(b->'rounds') = 'array' then b->'rounds' else '[]'::jsonb end)
        with ordinality as y(r, ri)), '[]'::jsonb)),
    '{finals}',
    case when jsonb_typeof(b->'finals') = 'object' and jsonb_typeof(b->'finals'->'stages') = 'array' then
      jsonb_set(b->'finals', '{stages}', coalesce((
        select jsonb_agg(st - 'res' - 'done' order by si)
        from jsonb_array_elements(b->'finals'->'stages') with ordinality as z(st, si)), '[]'::jsonb))
    else coalesce(b->'finals', 'null'::jsonb) end);
$$;

create or replace function public.save_state(p_pin text, p_id text, p_body jsonb, p_base bigint)
returns bigint language plpgsql security definer set search_path = public, private as $$
declare cur bigint; cur_body jsonb; who text;
begin
  who := public.check_role(p_pin);
  if who is null then raise exception 'bad_pin'; end if;
  if p_id not in ('live', 'test') then raise exception 'bad_id'; end if;
  select version, body into cur, cur_body from public.tournaments where id = p_id for update;
  if cur is null then
    if who <> 'admin' then raise exception 'not_allowed'; end if;
    insert into public.tournaments (id, body, version) values (p_id, p_body, 1);
    return 1;
  end if;
  if p_base is not null and p_base <> cur then raise exception 'conflict'; end if;
  if who = 'racer' and private.strip_results(p_body) is distinct from private.strip_results(cur_body) then
    raise exception 'not_allowed';
  end if;
  insert into public.tournament_history (tid, version, body)
    select id, version, body from public.tournaments where id = p_id;
  update public.tournaments set body = p_body, version = cur + 1, updated_at = now() where id = p_id;
  delete from public.tournament_history
    where tid = p_id and hid not in (
      select hid from public.tournament_history where tid = p_id order by hid desc limit 50);
  return cur + 1;
end $$;

revoke all on function public.check_role(text) from public;
grant execute on function public.check_role(text) to anon, authenticated;
revoke all on function public.save_state(text, text, jsonb, bigint) from public;
grant execute on function public.save_state(text, text, jsonb, bigint) to anon, authenticated;

-- To change the racer code later:
--   update private.admin set racer_code = 'new-code';
-- To turn racer entry off:
--   update private.admin set racer_code = null;
