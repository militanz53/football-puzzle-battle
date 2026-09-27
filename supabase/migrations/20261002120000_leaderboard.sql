-- Ranked leaderboard (GDD §14): everyone may see it, signed in or not.
--
-- profiles stays closed to the publishable key. Instead this view exposes only the
-- public columns (username, rating, match counts) plus the position, and nothing
-- else: no user id, and no email (that lives in auth.users, never in profiles).
--
-- The view runs with its owner's rights (security_invoker = false), which is what
-- lets anon read these columns without any access to the table itself. That is the
-- point of it; it must never select more than the columns below.
--
-- Only players with at least one ranked match are listed: a new account sits at the
-- starting 1200 and would otherwise outrank everyone who has lost a game.

create view public.leaderboard
with (security_invoker = false)
as
select
  -- Standard competition ranking: equal ratings share a position (1, 2, 2, 4).
  rank() over (order by p.rating desc) as position,
  p.username,
  p.rating,
  p.matches_played,
  p.matches_won,
  p.matches_lost
from public.profiles p
where p.matches_played > 0;

comment on view public.leaderboard is 'Public Ranked leaderboard (GDD §14): username, rating, match counts and position only.';

revoke all on public.leaderboard from public, anon, authenticated;
grant select on public.leaderboard to anon, authenticated, service_role;
