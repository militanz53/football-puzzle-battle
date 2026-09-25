import { connection } from "next/server";
import { emptyDraft } from "@/components/admin/draft";
import { PuzzleForm } from "@/components/admin/PuzzleForm";
import { fetchAllPuzzles } from "@/data/puzzles";
import { nextId } from "@/data/schema";
import { ROUND_ORDER } from "@/game/match";
import type { PuzzleType } from "@/game/types";

export default async function NewPuzzlePage({ searchParams }: PageProps<"/admin/new">) {
  await connection();
  const { type } = await searchParams;
  const initialType: PuzzleType = (ROUND_ORDER as unknown[]).includes(type) ? (type as PuzzleType) : ROUND_ORDER[0];
  const takenIds = (await fetchAllPuzzles()).map((p) => p.id);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold">Add puzzle</h1>
      <PuzzleForm initial={emptyDraft(initialType, nextId(initialType, takenIds))} editing={null} takenIds={takenIds} />
    </main>
  );
}
