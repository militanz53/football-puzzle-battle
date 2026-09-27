-- Friends and friendly challenges, on top of Ranked accounts (GDD §13.2 Challenge
-- Friend, §13.5). Quick Match and Ranked are unchanged.
--
-- As with profiles, the game reads and writes these tables only with the secret key
-- (service_role), from Server Functions that check who is signed in. The policies
-- below are for a signed-in Supabase session (authenticated): each user sees only
-- their own requests, friendships and challenges, and nobody but the server writes.

-- ---------------------------------------------------------------------------
-- Friend requests
-- ---------------------------------------------------------------------------

create table public.friend_requests (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users (id) on delete cascade,
  to_user      uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);

comment on table public.friend_requests is 'Friend requests between accounts. Written only by the server.';

-- One open request per direction at a time.
create unique index friend_requests_one_pending on public.friend_requests (from_user, to_user) where status = 'pending';
create index friend_requests_to_pending on public.friend_requests (to_user) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Friendships: one row per pair, user_a < user_b.
-- ---------------------------------------------------------------------------

create table public.friendships (
  user_a     uuid not null references auth.users (id) on delete cascade,
  user_b     uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);

comment on table public.friendships is 'Accepted friendships, one row per pair (user_a < user_b). Written only by the server.';

create index friendships_user_b on public.friendships (user_b);

-- ---------------------------------------------------------------------------
-- Challenges: a friendly match offered to a friend.
-- ---------------------------------------------------------------------------

create table public.challenges (
  id           uuid primary key default gen_random_uuid(),
  from_user    uuid not null references auth.users (id) on delete cascade,
  to_user      uuid not null references auth.users (id) on delete cascade,
  -- The challenger's browser (anonymous session): their seat in the match.
  from_session text not null check (length(from_session) between 8 and 64),
  status       text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  -- The challenger's waiting screen checks in; a challenge whose challenger stopped
  -- waiting can no longer be accepted (src/lib/friends/challenges.ts).
  from_seen_at timestamptz not null default now(),
  match_id     uuid references public.matches (id) on delete set null,
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);

comment on table public.challenges is 'Friendly match challenges between friends. Written only by the server.';

create index challenges_to_pending on public.challenges (to_user) where status = 'pending';
create index challenges_from_pending on public.challenges (from_user) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.challenges enable row level security;

revoke all on table public.friend_requests, public.friendships, public.challenges from anon, authenticated;
grant all on table public.friend_requests, public.friendships, public.challenges to service_role;
grant select on table public.friend_requests, public.friendships, public.challenges to authenticated;

create policy "friend_requests: own" on public.friend_requests for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
create policy "friendships: own" on public.friendships for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy "challenges: own" on public.challenges for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));

-- ---------------------------------------------------------------------------
-- Friendly matches: a third match mode. They never touch ratings:
-- settle_ranked_match already refuses any match whose mode is not 'ranked'.
-- ---------------------------------------------------------------------------

alter table public.matches drop constraint matches_mode_check;
alter table public.matches add constraint matches_mode_check check (mode in ('quick', 'ranked', 'friendly'));
