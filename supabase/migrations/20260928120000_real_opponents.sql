-- Two real players in one match (GDD §13.1, §27). A paired Quick Match is now a
-- single row that both players write to: seat a is the engine's "player" side, seat
-- b its opponent side. Matches against the bot leave these columns null.

alter table public.matches
  -- Both seats of a real-player match: { a: { session, name }, b: { session, name }, since }.
  -- Server only (the whole table is), like the rest of the row.
  add column players         jsonb check (players is null or jsonb_typeof(players) = 'object'),
  add column opponent_session text,
  -- Presence: each player's browser checks in every few seconds; a seat silent for
  -- 20 s has left, and the other player wins (src/server/match/service.ts).
  add column seat_a_seen_at  timestamptz,
  add column seat_b_seen_at  timestamptz,
  -- How a match ended early: { reason: "left", seat: "a" | "b" }.
  add column ended           jsonb check (ended is null or jsonb_typeof(ended) = 'object');
