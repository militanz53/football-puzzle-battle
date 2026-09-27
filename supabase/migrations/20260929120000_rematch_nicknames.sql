-- Mutual rematch and player nicknames for real-player matches (GDD §13.1, §13.2).

-- Rematch offers after a real-player match: { a?: <epoch ms>, b?: <epoch ms>, next?: <match id> }.
-- Both seats asking within the window makes `next`, a new match between the same two.
alter table public.matches
  add column rematch jsonb check (rematch is null or jsonb_typeof(rematch) = 'object');

-- The nickname the player chose (or was given) when they joined the queue; a paired
-- match shows each player the other's nickname.
alter table public.match_queue
  add column nickname text check (nickname is null or length(nickname) between 3 and 16);
