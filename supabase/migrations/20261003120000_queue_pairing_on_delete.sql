-- Deleting an account failed once it had ever been paired in the ranked queue:
-- the account's match_queue rows are removed with it (user_id … on delete cascade),
-- but the partner's row still pointed at one of them through paired_with, whose
-- foreign key had no delete rule. A pairing is history once the match exists, so
-- the partner's row simply forgets it.

alter table public.match_queue drop constraint match_queue_paired_with_fkey;
alter table public.match_queue
  add constraint match_queue_paired_with_fkey foreign key (paired_with) references public.match_queue (id) on delete set null;
