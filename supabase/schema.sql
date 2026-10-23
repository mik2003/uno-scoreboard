-- UNO Scoreboard • Supabase setup
-- Run ONCE in Supabase → SQL Editor, before seed_from_excel.sql.
-- A public leaderboard + authorized, atomic write functions. No service-role key in the browser.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint player_name_length check (char_length(btrim(name)) between 1 and 50)
);
create unique index if not exists players_name_case_insensitive
  on public.players ((lower(btrim(name))));

-- Run the following manually for each editor, AFTER executing this schema:
-- insert into public.editors (email) values ('you@yourwork.com') on conflict do nothing;
create table if not exists public.editors (
  email text primary key
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  played_on date not null,
  first_place uuid not null references public.players(id),
  second_place uuid not null references public.players(id),
  third_place uuid not null references public.players(id),
  losers uuid[] not null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint distinct_finishers check (
    first_place <> second_place and first_place <> third_place and second_place <> third_place
  ),
  constraint losers_nonempty check (coalesce(array_length(losers, 1), 0) between 1 and 30),
  constraint short_notes check (notes is null or char_length(notes) <= 300)
);
create index if not exists matches_played_on_idx on public.matches (played_on desc, created_at desc);

-- Spreadsheet records were weekly aggregates; reconstructing individual historical games is impossible.
create table if not exists public.legacy_weekly_scores (
  player_id uuid not null references public.players(id),
  week_start date not null,
  wins integer not null default 0 check (wins >= 0),
  seconds integer not null default 0 check (seconds >= 0),
  thirds integer not null default 0 check (thirds >= 0),
  penalties numeric(14, 6) not null default 0 check (penalties >= 0),
  points numeric(14, 6) not null default 0,
  primary key (player_id, week_start),
  constraint week_is_monday check (extract(isodow from week_start) = 1),
  constraint legacy_points_check check (abs(points - (3*wins + 2*seconds + thirds - penalties)) < 0.000001)
);

-- Least-privilege read access; all writes must go through validated RPC functions.
alter table public.players enable row level security;
alter table public.editors enable row level security;
alter table public.matches enable row level security;
alter table public.legacy_weekly_scores enable row level security;

revoke all on public.players, public.editors, public.matches, public.legacy_weekly_scores from anon, authenticated;
grant select on public.players, public.matches, public.legacy_weekly_scores to anon, authenticated;

-- Readers can see the scoreboard. The editors allow-list is never readable from the website.
drop policy if exists everyone_can_read_players on public.players;
create policy everyone_can_read_players on public.players for select to anon, authenticated using (true);
drop policy if exists everyone_can_read_matches on public.matches;
create policy everyone_can_read_matches on public.matches for select to anon, authenticated using (true);
drop policy if exists everyone_can_read_legacy on public.legacy_weekly_scores;
create policy everyone_can_read_legacy on public.legacy_weekly_scores for select to anon, authenticated using (true);

create or replace function public.can_edit_scores()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null
    and exists (
      select 1 from public.editors e
      where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;
revoke all on function public.can_edit_scores() from public, anon, authenticated;
grant execute on function public.can_edit_scores() to authenticated;

create or replace function public.add_player(p_name text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.can_edit_scores() then
    raise exception 'You are not authorized to manage players.' using errcode = '42501';
  end if;
  p_name := btrim(p_name);
  if p_name is null or char_length(p_name) not between 1 and 50 then
    raise exception 'Player name must be 1–50 characters.';
  end if;
  insert into public.players(name) values (p_name) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.add_player(text) from public, anon, authenticated;
grant execute on function public.add_player(text) to authenticated;

create or replace function public.record_match(
  p_played_on date,
  p_first_place uuid,
  p_second_place uuid,
  p_third_place uuid,
  p_losers uuid[],
  p_notes text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_all_player_ids uuid[];
  v_distinct_count integer;
begin
  if not public.can_edit_scores() then
    raise exception 'You are not authorized to record matches.' using errcode = '42501';
  end if;
  if p_played_on is null or p_played_on > current_date or p_played_on < date '2020-01-01' then
    raise exception 'Choose a valid match date (today or earlier).';
  end if;
  if p_first_place is null or p_second_place is null or p_third_place is null
      or p_first_place = p_second_place or p_first_place = p_third_place
      or p_second_place = p_third_place then
    raise exception 'First, second and third places must be three different players.';
  end if;
  if coalesce(array_length(p_losers, 1), 0) not between 1 and 30 then
    raise exception 'Select one or more players with the most cards.';
  end if;
  select count(distinct u.id) into v_distinct_count from unnest(p_losers) as u(id);
  if v_distinct_count <> array_length(p_losers, 1) then
    raise exception 'Most-card players must be unique and not null.';
  end if;
  v_all_player_ids := array[p_first_place, p_second_place, p_third_place] || p_losers;
  if exists (
    select 1 from unnest(v_all_player_ids) as ref(id)
    left join public.players p on p.id = ref.id and p.active
    where p.id is null
  ) then
    raise exception 'One of the selected players does not exist or is inactive.';
  end if;
  if p_notes is not null and char_length(p_notes) > 300 then
    raise exception 'Notes may not exceed 300 characters.';
  end if;

  insert into public.matches (played_on, first_place, second_place, third_place, losers, notes, created_by)
  values (p_played_on, p_first_place, p_second_place, p_third_place, p_losers, nullif(btrim(p_notes), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_match(date, uuid, uuid, uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.record_match(date, uuid, uuid, uuid, uuid[], text) to authenticated;

create or replace function public.delete_match(p_match_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_edit_scores() then
    raise exception 'You are not authorized to delete matches.' using errcode = '42501';
  end if;
  delete from public.matches where id = p_match_id;
  if not found then
    raise exception 'Match not found.';
  end if;
end;
$$;
revoke all on function public.delete_match(uuid) from public, anon, authenticated;
grant execute on function public.delete_match(uuid) to authenticated;
