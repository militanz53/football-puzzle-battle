-- Ranked against the bot (GDD §13.5, §14). When no other ranked player turns up within
-- the search window, the bot takes the match as in Quick Match: under a nickname and a
-- "ghost" rating near the player's. Only the player's profile changes afterwards.
--
-- matches.opponent_kind = 'bot' already records that it was the bot (never shown to
-- the player). The new column holds what settling needs, since such a match has no
-- players seats: { userId, username, rating, opponentRating }.

alter table public.matches
  add column ranked_solo jsonb check (ranked_solo is null or jsonb_typeof(ranked_solo) = 'object'),
  add constraint matches_ranked_solo_is_ranked_bot check (ranked_solo is null or (mode = 'ranked' and opponent_kind = 'bot'));

-- Leaving a ranked bot match unfinished counts as a loss when the player next searches;
-- that lookup is by account.
create index matches_unfinished_ranked_bot on public.matches ((ranked_solo ->> 'userId'))
  where ranked_solo is not null and status <> 'over';

-- As before for two players; against the bot, only the player (seat a) is updated.
create or replace function public.settle_ranked_match(p_match uuid, p_result jsonb)
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

  if m.opponent_kind = 'bot' then
    if m.ranked_solo is null then
      return null;
    end if;
    update public.matches set ranked_result = p_result where id = p_match;
    account := (m.ranked_solo ->> 'userId')::uuid;
    won := m.winner = 'player';
    update public.profiles
    set rating = greatest(0, rating + (p_result -> 'a' ->> 'delta')::integer),
        matches_played = matches_played + 1,
        matches_won = matches_won + (case when won then 1 else 0 end),
        matches_lost = matches_lost + (case when won then 0 else 1 end)
    where user_id = account;
    return p_result;
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
