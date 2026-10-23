-- Historical weekly aggregates from UNO_Leaderboard.xlsx.
-- These are weekly totals only; the original spreadsheet has no individual match log.
-- Execute schema.sql first. Safe to rerun without duplicating records.

insert into public.players (name) values
  ('Alice'),
  ('Yasmin'),
  ('Michelangelo'),
  ('Bas'),
  ('Fleur'),
  ('Kareena'),
  ('Saurabh'),
  ('Emil'),
  ('Zara'),
  ('Myron'),
  ('Jesse'),
  ('Buku'),
  ('Sunny'),
  ('Pedro'),
  ('Friso'),
  ('Stan'),
  ('Sander'),
  ('Noa')
on conflict do nothing;

with imported (name, week_start, wins, seconds, thirds, penalties, points) as (
  values
    ('Alice', '2026-10-12'::date, 2, 0, 1, 1, 6),
    ('Fleur', '2026-10-12'::date, 0, 1, 4, 1, 5),
    ('Emil', '2026-10-12'::date, 0, 0, 0, 1, -1),
    ('Jesse', '2026-10-12'::date, 1, 0, 1, 1, 3),
    ('Myron', '2026-10-12'::date, 1, 1, 1, 3, 3),
    ('Michelangelo', '2026-10-12'::date, 2, 3, 0, 2, 10),
    ('Sander', '2026-10-12'::date, 0, 0, 0, 1, -1),
    ('Saurabh', '2026-10-12'::date, 1, 0, 0, 0, 3),
    ('Stan', '2026-10-12'::date, 0, 0, 1, 0, 1),
    ('Kareena', '2026-10-12'::date, 1, 3, 1, 0, 10),
    ('Bas', '2026-10-12'::date, 1, 1, 1, 0, 6),
    ('Sunny', '2026-10-12'::date, 1, 0, 0, 4, -1),
    ('Yasmin', '2026-10-12'::date, 1, 3, 0, 0, 9),
    ('Buku', '2026-10-12'::date, 1, 0, 0, 0, 3),
    ('Alice', '2026-10-19'::date, 3, 3, 1, 0, 16),
    ('Fleur', '2026-10-19'::date, 1, 1, 1, 1, 5),
    ('Emil', '2026-10-19'::date, 1, 3, 1, 1.5, 8.5),
    ('Myron', '2026-10-19'::date, 1, 0, 0, 0, 3),
    ('Michelangelo', '2026-10-19'::date, 1, 0, 1, 1, 3),
    ('Saurabh', '2026-10-19'::date, 1, 1, 0, 0, 5),
    ('Kareena', '2026-10-19'::date, 0, 0, 2, 2, 0),
    ('Bas', '2026-10-19'::date, 1, 1, 0, 0, 5),
    ('Sunny', '2026-10-19'::date, 0, 1, 2, 0, 4),
    ('Yasmin', '2026-10-19'::date, 2, 2, 1, 1.5, 9.5),
    ('Friso', '2026-10-19'::date, 1, 0, 1, 2, 2),
    ('Pedro', '2026-10-19'::date, 0, 1, 0, 0, 2),
    ('Zara', '2026-10-19'::date, 2, 0, 1, 0, 7),
    ('Noa', '2026-10-19'::date, 0, 0, 0, 2, -2)
)
insert into public.legacy_weekly_scores (player_id, week_start, wins, seconds, thirds, penalties, points)
select p.id, i.week_start, i.wins, i.seconds, i.thirds, i.penalties, i.points
from imported i join public.players p on p.name = i.name
on conflict (player_id, week_start) do update set
  wins = excluded.wins, seconds = excluded.seconds, thirds = excluded.thirds,
  penalties = excluded.penalties, points = excluded.points;
