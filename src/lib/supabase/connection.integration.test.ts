import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getBrowserSupabase } from "./browser";
import { supabaseUrl } from "./env";
import { pingSupabase } from "./health";
import { getServerSupabase } from "./server";

// Live check against the project in .env.local: npm run test:supabase.
// Needs no tables; see health.ts for how the probe works.

describe("Supabase connection", () => {
  it("reaches the project with the publishable key (browser client)", async () => {
    expect(await pingSupabase(getBrowserSupabase())).toEqual({ ok: true });
  });

  it("reaches the project with the secret key (server client)", async () => {
    expect(await pingSupabase(getServerSupabase())).toEqual({ ok: true });
  });

  it("gives admin rights to the secret key only", async () => {
    const server = await getServerSupabase().auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(server.error).toBeNull();

    const browser = await getBrowserSupabase().auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(browser.error).not.toBeNull();
  });

  it("would notice a wrong key", async () => {
    const bogus = createClient(supabaseUrl(), "sb_publishable_not_a_real_key", { auth: { persistSession: false } });
    expect((await pingSupabase(bogus)).ok).toBe(false);
  });
});
