-- Ranked (GDD §13.5, §14, §16): accounts, ratings and a separate ranked queue. A
-- parallel system on top of Quick Match: anonymous Quick Match, its queue rows and
-- its matches keep working exactly as before (every new column has a default that
-- means "Quick Match").
--
-- Accounts are Supabase Auth users (email + password), created and checked by the
-- server. The game never uses the browser's Supabase session: everything below is
-- read and written with the secret key (service_role) by Server Functions.

-- ---------------------------------------------------------------------------
-- Profiles: the permanent identity and rating of an account.
-- ---------------------------------------------------------------------------

create table public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  -- Letters, digits and _ (checked in src/lib/account/rules.ts), 3-16 characters.
  username       text not null check (length(username) between 3 and 16),
  -- Elo-like rating (src/lib/account/elo.ts); tiers are in src/lib/account/rank.ts.
  rating         integer not null default 1200 check (rating >= 0),
  matches_played integer not null default 0 check (matches_played >= 0),
  matches_won    integer not null default 0 check (matches_won >= 0),
  matches_lost   integer not null default 0 check (matches_lost >= 0),
  created_at     timestamptz not null default now()
);

comment on table public.profiles is 'Ranked accounts (GDD §13.5, §14): username and rating. Written only by the server.';

-- One username per player, whatever the case ("Kadir" and "kadir" are the same name).
create unique index profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant all on table public.profiles to service_role;
-- A signed-in Supabase session may read its own row (the game itself does not use
-- one; this is for later clients). Nobody but the server writes.
grant select on table public.profiles to authenticated;
create policy "profiles: read own row" on public.profiles for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Ranked queue: the same table as Quick Match, in its own lane.
-- ---------------------------------------------------------------------------

alter table public.match_queue
  add column mode    text not null default 'quick' check (mode in ('quick', 'ranked')),
  -- The account searching (ranked only).
  add column user_id uuid references auth.users (id) on delete cascade,
  add constraint match_queue_ranked_has_user check (mode = 'quick' or user_id is not null);

-- As before, plus: a player is only paired within their own mode (ranked with
-- ranked, Quick Match with Quick Match), and never with their own account on
-- another browser.
create or replace function public.claim_queue_partner(p_entry uuid, p_fresh_seconds integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.match_queue%rowtype;
  partner uuid;
begin
  select * into me from public.match_queue where id = p_entry for update;
  if not found or me.status <> 'waiting' then
    return null;
  end if;

  select q.id into partner
  from public.match_queue q
  where q.status = 'waiting'
    and q.id <> p_entry
    and q.mode = me.mode
    and q.session_id <> me.session_id
    and (me.user_id is null or q.user_id is distinct from me.user_id)
    and q.last_seen_at > now() - make_interval(secs => p_fresh_seconds)
    and q.search_until > now()
  order by q.created_at
  limit 1
  for update skip locked;

  if partner is null then
    return null;
  end if;

  update public.match_queue set status = 'paired', paired_with = partner, resolved_at = now() where id = p_entry;
  update public.match_queue set status = 'paired', paired_with = p_entry, resolved_at = now() where id = partner;
  return partner;
end;
$$;

revoke execute on function public.claim_queue_partner(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_queue_partner(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Ranked matches and their rating changes.
-- ---------------------------------------------------------------------------

alter table public.matches
  add column mode          text not null default 'quick' check (mode in ('quick', 'ranked')),
  -- Once a ranked match is over: { a: { before, after, delta }, b: { … } }.
  add column ranked_result jsonb check (ranked_result is null or jsonb_typeof(ranked_result) = 'object');

-- Applies a finished ranked match to both profiles, exactly once, however many
-- requests notice the end at the same moment. Who played and who won come from the
-- match row itself (players.<seat>.account.userId, winner), not from the caller; the
-- caller supplies the rating changes (src/lib/account/elo.ts). Returns the stored
-- result (the first caller's), or null for a match that is not a finished ranked one.
create function public.settle_ranked_match(p_match uuid, p_result jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.matches%rowtype;
  seat text;
  account uuid;
  won boolean;
begin
  select * into m from public.matches where id = p_match for update;
  if not found or m.mode <> 'ranked' or m.status <> 'over' or m.winner is null then
    return null;
  end if;
  if m.ranked_result is not null then
    return m.ranked_result;
  end if;

  update public.matches set ranked_result = p_result where id = p_match;
  foreach seat in array array['a', 'b'] loop
    account := (m.players -> seat -> 'account' ->> 'userId')::uuid;
    won := m.winner = (case seat when 'a' then 'player' else 'bot' end);
    update public.profiles
    set rating = greatest(0, rating + (p_result -> seat ->> 'delta')::integer),
        matches_played = matches_played + 1,
        matches_won = matches_won + (case when won then 1 else 0 end),
        matches_lost = matches_lost + (case when won then 0 else 1 end)
    where user_id = account;
  end loop;
  return p_result;
end;
$$;

revoke execute on function public.settle_ranked_match(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.settle_ranked_match(uuid, jsonb) to service_role;
