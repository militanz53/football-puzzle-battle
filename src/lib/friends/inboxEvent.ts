// Each signed-in account has a private Realtime channel, its inbox
// (src/lib/friends/inbox.ts). The server sends this event there whenever something
// changes for that player (a challenge arrives, is accepted, declined or withdrawn).
// The event carries nothing: the page asks the server what changed.
export const INBOX_EVENT = "changed";
