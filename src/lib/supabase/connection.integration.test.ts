import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { careerPuzzle } from "@/game/__fixtures__/careerPuzzle";
import { fetchAllPuzzles, fetchPublishedPuzzles } from "@/data/puzzles";
import { PUZZLES_TABLE, puzzleToRow } from "@/data/rows";
import { supabaseUrl } from "./env";
import { pingSupabase } from "./health";
import { getPublicSupabase } from "./public";
import { getServerSupabase } from "./server";

// Live checks against the project in .env.local: npm run test:supabase.
// They add two temporary rows (ids starting "it_") and remove them afterwards.

describe("Supabase connection", () => {
  it("reaches the project with the publishable key (public client)", async () => {
    expect(await pingSupabase(getPublicSupabase())).toEqual({ ok: true });
  });

  it("reaches the project with the secret key (server client)", async () => {
    expect(await pingSupabase(getServerSupabase())).toEqual({ ok: true });
  });

  it("gives admin rights to the secret key only", async () => {
    const server = await getServerSupabase().auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(server.error).toBeNull();

    const publicKey = await getPublicSupabase().auth.admin.listUsers({ page: 1, perPage: 1 });
    expect(publicKey.error).not.toBeNull();
  });

  it("would notice a wrong key", async () => {
    const bogus = createClient(supabaseUrl(), "sb_publishable_not_a_real_key", { auth: { persistSession: false } });
    expect((await pingSupabase(bogus)).ok).toBe(false);
  });
});

describe("puzzles table: Row Level Security", () => {
  const PUBLISHED = { ...careerPuzzle, id: "it_rls_published", correct_answer: "Integration Published", status: "published" as const };
  const DRAFT = { ...careerPuzzle, id: "it_rls_draft", correct_answer: "Integration Draft", status: "draft" as const };
  const server = () => getServerSupabase().from(PUZZLES_TABLE);
  const anon = () => getPublicSupabase().from(PUZZLES_TABLE);
  const cleanUp = async () => {
    const { error } = await server().delete().in("id", [PUBLISHED.id, DRAFT.id, "it_rls_intruder"]);
    if (error) throw new Error(error.message);
  };

  beforeAll(async () => {
    await cleanUp();
    const { error } = await server().insert([puzzleToRow(PUBLISHED), puzzleToRow(DRAFT)]);
    if (error) throw new Error(`Could not add the test rows: ${error.message}`);
  });
  afterAll(cleanUp);

  it("lets the publishable key read published puzzles only", async () => {
    const { data, error } = await anon().select("id, status").in("id", [PUBLISHED.id, DRAFT.id]);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: PUBLISHED.id, status: "published" }]);
  });

  it("hides every draft from the publishable key, even without a status filter", async () => {
    const [everything, visible] = await Promise.all([fetchAllPuzzles(getServerSupabase()), fetchAllPuzzles(getPublicSupabase())]);
    expect(visible.map((p) => p.id)).toEqual(everything.filter((p) => p.status === "published").map((p) => p.id));
    expect(visible.some((p) => p.id === DRAFT.id)).toBe(false);
  });

  it("gives the game (fetchPublishedPuzzles) no drafts", async () => {
    const pool = await fetchPublishedPuzzles();
    expect(pool.every((p) => p.status === "published")).toBe(true);
    expect(pool.some((p) => p.id === PUBLISHED.id)).toBe(true);
  });

  it("refuses every write with the publishable key", async () => {
    const insert = await anon().insert(puzzleToRow({ ...PUBLISHED, id: "it_rls_intruder" }));
    const update = await anon().update({ question: "Hacked?" }).eq("id", PUBLISHED.id).select("id");
    const publish = await anon().update({ status: "published" }).eq("id", DRAFT.id).select("id");
    const remove = await anon().delete().eq("id", PUBLISHED.id).select("id");
    for (const attempt of [insert, update, publish, remove]) expect(attempt.error?.code).toBe("42501");
  });

  it("left both rows exactly as they were", async () => {
    const { data } = await server().select("id, status, question").in("id", [PUBLISHED.id, DRAFT.id, "it_rls_intruder"]).order("id");
    expect(data).toEqual([
      { id: DRAFT.id, status: "draft", question: careerPuzzle.question },
      { id: PUBLISHED.id, status: "published", question: careerPuzzle.question },
    ]);
  });
});
