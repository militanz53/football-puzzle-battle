import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { ImportPanel } from "@/components/admin/ImportPanel";
import { fetchAllPuzzles } from "@/data/puzzles";

export default async function ImportPage() {
  await connection();
  await requireAdmin();
  return (
    <main className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-bold">Bulk import</h1>
      <ImportPanel pool={await fetchAllPuzzles()} />
    </main>
  );
}
