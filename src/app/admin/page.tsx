import Link from "next/link";
import { connection } from "next/server";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { buttonClass, DifficultyTag } from "@/components/admin/ui";
import { PUZZLE_LABEL } from "@/components/puzzles/PuzzleBoard";
import { loadPuzzles } from "@/data/puzzles";
import { ROUND_ORDER } from "@/game/match";
import type { PuzzleType } from "@/game/types";

const MVP_TARGET = 10; // §30: 10 per type

function isType(value: unknown): value is PuzzleType {
  return typeof value === "string" && (ROUND_ORDER as string[]).includes(value);
}

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  await connection(); // read the file on every request, never at build time
  const { type, saved } = await searchParams;
  const filter = isType(type) ? type : null;
  const pool = loadPuzzles();
  const shown = filter ? pool.filter((p) => p.type === filter) : pool;
  const savedIds = typeof saved === "string" ? saved.split(",") : [];

  return (
    <main className="flex flex-col gap-6">
      {/* Counts first: "how many puzzles are there?" is answered at a glance. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Link
          href="/admin"
          className={`flex flex-col justify-between rounded-2xl border p-4 ${filter === null ? "border-accent bg-accent/10" : "border-border-subtle bg-bg-surface hover:bg-bg-surface-alt"}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Total</span>
          <span className="font-display text-5xl font-bold text-accent">{pool.length}</span>
          <span className="text-xs text-text-muted">{pool.filter((p) => p.status === "published").length} published</span>
        </Link>
        {ROUND_ORDER.map((t) => {
          const ofType = pool.filter((p) => p.type === t);
          const by = (d: string) => ofType.filter((p) => p.difficulty === d).length;
          const drafts = ofType.filter((p) => p.status === "draft").length;
          return (
            <Link
              key={t}
              href={`/admin?type=${t}`}
              className={`flex flex-col justify-between gap-1 rounded-2xl border p-4 ${filter === t ? "border-accent bg-accent/10" : "border-border-subtle bg-bg-surface hover:bg-bg-surface-alt"}`}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{PUZZLE_LABEL[t]}</span>
              <span className="font-display text-5xl font-bold text-text-primary">{ofType.length}</span>
              <span className="text-xs text-text-muted">
                {by("easy")} easy · {by("medium")} med · {by("hard")} hard
                {drafts > 0 && ` · ${drafts} draft`}
              </span>
              {ofType.length < MVP_TARGET && (
                <span className="text-xs text-amber-300">{MVP_TARGET - ofType.length} below the §30 target</span>
              )}
            </Link>
          );
        })}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold">
            {filter ? PUZZLE_LABEL[filter] : "All puzzles"}{" "}
            <span className="text-text-muted">({shown.length})</span>
          </h1>
          <Link href={filter ? `/admin/new?type=${filter}` : "/admin/new"} className={buttonClass.primary}>
            + Add {filter ? PUZZLE_LABEL[filter] : "puzzle"}
          </Link>
        </div>

        {savedIds.length > 0 && (
          <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            Saved {savedIds.join(", ")}.
          </p>
        )}

        <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border-subtle text-xs uppercase tracking-wider text-text-muted">
              <tr>
                <th className="px-4 py-2 font-semibold">ID</th>
                {!filter && <th className="px-4 py-2 font-semibold">Type</th>}
                <th className="px-4 py-2 font-semibold">Answer</th>
                <th className="px-4 py-2 font-semibold">Difficulty</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-border-subtle last:border-0 ${savedIds.includes(p.id) ? "bg-accent/5" : ""}`}
                >
                  <td className="px-4 py-2 font-mono text-xs text-text-secondary">{p.id}</td>
                  {!filter && <td className="px-4 py-2 text-text-secondary">{PUZZLE_LABEL[p.type]}</td>}
                  <td className="px-4 py-2">
                    <span className="font-semibold">{p.correct_answer}</span>
                    {p.answer_aliases.length > 0 && (
                      <span className="ml-2 text-xs text-text-muted">{p.answer_aliases.join(", ")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <DifficultyTag value={p.difficulty} />
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {p.status === "published" ? (
                      <span className="text-text-secondary">published</span>
                    ) : (
                      <span className="text-amber-300">draft</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    <Link href={`/admin/edit/${encodeURIComponent(p.id)}`} className={buttonClass.ghost}>
                      Edit
                    </Link>
                    <DeleteButton id={p.id} label={p.correct_answer} />
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-text-muted">
                    No puzzles yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
