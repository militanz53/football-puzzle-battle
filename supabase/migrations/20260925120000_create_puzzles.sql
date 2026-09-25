-- Puzzle table (GDD §24 / §24.1). Column names are the snake_case fields of the
-- Puzzle type in src/game/types.ts, so records move between the app and the table
-- unchanged (see src/data/rows.ts). Full validation lives in src/data/schema.ts;
-- the checks below are a second line of defence.

create table public.puzzles (
  id                      text primary key check (id ~ '^[a-z0-9][a-z0-9_-]*$'),
  type                    text not null check (type in ('goal_map', 'photo_reveal', 'missing_xi', 'career_journey', 'teammate_web')),
  status                  text not null default 'draft' check (status in ('published', 'draft')),
  difficulty              text not null check (difficulty in ('easy', 'medium', 'hard')),
  bot_difficulty          text not null default 'medium' check (bot_difficulty in ('easy', 'medium', 'hard')),
  question                text not null check (length(trim(question)) > 0),
  correct_answer          text not null check (length(trim(correct_answer)) > 0),
  answer_aliases          text[] not null default '{}',
  competition             text,
  season                  text,
  tags                    text[] not null default '{}',
  -- §6.1: fixed at 3 in the MVP; kept per puzzle for later overrides.
  reveal_interval_seconds integer not null default 3 check (reveal_interval_seconds > 0),
  -- §9.2.1: Photo Reveal uses original illustrations only, never real photos.
  image_source            text check (image_source = 'illustration'),
  license_type            text,
  reveal_data             jsonb not null check (jsonb_typeof(reveal_data) = 'object'),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint photo_reveal_is_illustration check (type <> 'photo_reveal' or image_source = 'illustration')
);

comment on table public.puzzles is 'Puzzle content (GDD §24). Readable when published; written only by the server (secret key).';

-- The game draws published puzzles by type (buildSchedule).
create index puzzles_type_status_idx on public.puzzles (type, status);

create function public.puzzles_touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger puzzles_touch_updated_at
before update on public.puzzles
for each row execute function public.puzzles_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The publishable key acts as the "anon" role (and a future logged-in user as
-- "authenticated"): they may read published puzzles and nothing else. With RLS on
-- and no insert/update/delete policy, every write from those roles is refused.
-- The secret key acts as "service_role", which bypasses RLS: only the server
-- (Server Functions in src/app/admin/actions.ts) holds it.

alter table public.puzzles enable row level security;

create policy "Published puzzles are readable by everyone"
on public.puzzles
for select
to anon, authenticated
using (status = 'published');

-- Belt and braces: take away the table privileges RLS does not cover (TRUNCATE is
-- not subject to RLS), then grant back reading only.
revoke all on table public.puzzles from anon, authenticated;
grant select on table public.puzzles to anon, authenticated;
-- Supabase grants this by default; stated so the server's access does not depend on it.
grant all on table public.puzzles to service_role;
