import "server-only";
import { secretSupabaseKey } from "@/lib/supabase/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { INBOX_EVENT } from "./inboxEvent";

// A player's inbox: a Realtime broadcast channel whose name only the server can work
// out (an HMAC of the account id, keyed from the secret key), handed to that player's
// own pages. Broadcast channels are open to anyone who knows the name, so the name is
// the secret, and the event carries no data anyway: it only says "ask the server".

const encoder = new TextEncoder();

export async function inboxChannel(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(`fpb-inbox:${secretSupabaseKey()}`), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(userId)));
  return `inbox:${Array.from(mac.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Tells the player's open pages to look again. Best effort: a page that misses it catches up on its next load. */
export async function notifyInbox(userId: string): Promise<void> {
  const db = getServerSupabase();
  const channel = db.channel(await inboxChannel(userId));
  try {
    await channel.httpSend(INBOX_EVENT, {});
  } catch (e) {
    console.warn(`Inbox notification failed: ${(e as Error).message}`);
  } finally {
    await db.removeChannel(channel);
  }
}
