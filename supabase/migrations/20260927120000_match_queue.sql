-- Quick Match queue (GDD §13.1). PLAY puts the player in this queue under an
-- anonymous session id (an httpOnly cookie, no account). For a short search window
-- the server looks for another waiting player; if none turns up, the match goes to
-- the bot under a random nickname. Server only: the secret key reads and writes,
-- the publishable key has no access.

create table public.match_queue (
  id             uuid primary key default gen_random_uuid(),
  session_id     text not null check (length(session_id) between 8 and 64),
  -- waiting: searching · paired: another waiting player was found ·
  -- timed_out: nobody came, the bot takes the match · abandoned: the player left
  status         text not null default 'waiting' check (status in ('waiting', 'paired', 'timed_out', 'abandoned')),
  search_until   timestamptz not null,
  last_seen_at   timestamptz not null default now(),
  paired_with    uuid references public.match_queue (id),
  match_id       uuid references public.matches (id) on delete set null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);

comment on table public.match_queue is 'Quick Match queue (GDD §13.1). Server only. status paired vs timed_out gives the real-opponent rate.';

create index match_queue_waiting_idx on public.match_queue (created_at) where status = 'waiting';

alter table public.match_queue enable row level security;
revoke all on table public.match_queue from anon, authenticated;
grant all on table public.match_queue to service_role;

-- Pairs a waiting entry with the oldest other waiting player that is still polling
-- (seen within p_fresh_seconds, not the same browser session). Both rows become
-- 'paired' together in one transaction; SKIP LOCKED keeps two players who search at
-- the same moment from blocking each other (they simply try again on the next poll).
-- Returns the partner's entry id, or null when there is nobody (or the entry is no
-- longer waiting).
create function public.claim_queue_partner(p_entry uuid, p_fresh_seconds integer)
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
    and q.session_id <> me.session_id
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

-- Who the match was against. Kept for the real-opponent rate; never sent to browsers
-- (src/server/match/view.ts builds their view without these columns).
alter table public.matches
  add column opponent_kind  text not null default 'bot' check (opponent_kind in ('bot', 'human')),
  add column opponent_name  text not null default 'Opponent',
  add column queue_entry_id uuid references public.match_queue (id) on delete set null,
  add column player_session text;
