-- Server-authoritative matches (GDD §27). The server owns the schedule, the round
-- clock, buzz times, answer checking and scoring; browsers only see a sanitised
-- view of this row (src/server/match/view.ts), pushed over Supabase Realtime.
--
-- One row per match. The readable columns (round, puzzle, round start, buzz times,
-- score) are kept in step with `state` and `round` on every write, so a match can be
-- followed in the table editor; the server itself works from the two jsonb columns:
--   state: the MatchState of src/game/match.ts (schedule, finished rounds, current
--          puzzle, Sudden Death, status, winner). Contains the answers.
--   round: the current round's timeline: server start time, the bot's plan and the
--          player's buzz/answer events with their server receive times
--          (src/game/timeline.ts replays the round engine over it).

create table public.matches (
  id                 uuid primary key default gen_random_uuid(),
  status             text not null check (status in ('playing', 'round-result', 'over')),
  round_number       integer not null check (round_number >= 1),
  sudden_death       boolean not null default false,
  current_puzzle_id  text not null,
  round_started_at   timestamptz,
  player_buzz_ms     integer,
  bot_buzz_ms        integer,
  player_score       integer not null default 0,
  bot_score          integer not null default 0,
  winner             text check (winner in ('player', 'bot')),
  state              jsonb not null check (jsonb_typeof(state) = 'object'),
  round              jsonb check (round is null or jsonb_typeof(round) = 'object'),
  -- Optimistic concurrency: every write is "update … where version = <read version>".
  version            integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.matches is 'Server-authoritative match state (GDD §27). Server only: holds answers and the bot plan.';

create index matches_created_at_idx on public.matches (created_at);

create function public.matches_touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger matches_touch_updated_at
before update on public.matches
for each row execute function public.matches_touch_updated_at();

-- Row Level Security with no policies: the publishable key (anon / authenticated)
-- can neither read nor write a match. Only the secret key (service_role, which
-- bypasses RLS) is used, from Server Functions. Browsers get their view of the match
-- from those functions and from Realtime broadcasts, never from this table.
alter table public.matches enable row level security;
revoke all on table public.matches from anon, authenticated;
grant all on table public.matches to service_role;
