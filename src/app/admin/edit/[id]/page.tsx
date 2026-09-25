import { notFound } from "next/navigation";
import { connection } from "next/server";
import { draftFromPuzzle } from "@/components/admin/draft";
import { PuzzleForm } from "@/components/admin/PuzzleForm";
import { fetchAllPuzzles } from "@/data/puzzles";

export default async function EditPuzzlePage({ params }: PageProps<"/admin/edit/[id]">) {
  await connection();
  const { id } = await params;
  const pool = await fetchAllPuzzles();
  const puzzle = pool.find((p) => p.id === decodeURIComponent(id));
  if (!puzzle) notFound();

  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold">
        Edit <span className="font-mono text-base text-text-secondary">{puzzle.id}</span>
      </h1>
      <PuzzleForm initial={draftFromPuzzle(puzzle)} editing={puzzle.id} takenIds={pool.map((p) => p.id)} />
    </main>
  );
}
