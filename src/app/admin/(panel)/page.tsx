import Link from "next/link";
import { connection } from "next/server";
import { requireAdmin } from "@/lib/admin/auth";
import { PuzzleTable, type PuzzleRow } from "@/components/admin/PuzzleTable";
import { buttonClass } from "@/components/admin/ui";
import { PUZZLE_LABEL } from "@/components/puzzles/PuzzleBoard";
import { fetchAllPuzzles } from "@/data/puzzles";
import { ROUND_ORDER } from "@/game/match";
import type { PuzzleStatus, PuzzleType } from "@/game/types";

const MVP_TARGET = 10; // §30: 10 per type

function isType(value: unknown): value is PuzzleType {
  return typeof value === "string" && (ROUND_ORDER as string[]).includes(value);
}

function isStatus(value: unknown): value is PuzzleStatus {
  return value === "published" || value === "draft";
}

/** Dashboard URL with the given filters (null clears one). */
function href(type: PuzzleType | null, status: PuzzleStatus | null): string {
  const params = new URLSearchParams();
  if (type) params.set("type", type);
  if (status) params.set("status", status);
  const query = params.toString();
  return query ? `/admin?${query}` : "/admin";
}

const tabClass = (active: boolean) =>
  `rounded-lg px-3 py-1.5 font-display text-sm font-semibold ${
    active ? "bg-bg-surface-alt text-text-primary" : "text-text-secondary hover:text-text-primary"
  }`;

export default async function AdminDashboard({ searchParams }: PageProps<"/admin">) {
  await connection();
  await requireAdmin();
  const { type, status, saved } = await searchParams;
  const typeFilter = isType(type) ? type : null;
  const statusFilter = isStatus(status) ? status : null;
  const pool = await fetchAllPuzzles();
  const ofType = typeFilter ? pool.filter((p) => p.type === typeFilter) : pool;
  const shown = statusFilter ? ofType.filter((p) => p.status === statusFilter) : ofType;
  const draftCount = pool.filter((p) => p.status === "draft").length;
  const draftsInView = ofType.filter((p) => p.status === "draft").length;
  const savedIds = typeof saved === "string" ? saved.split(",") : [];

  const rows: PuzzleRow[] = shown.map((p) => ({
    id: p.id,
    typeLabel: PUZZLE_LABEL[p.type],
    answer: p.correct_answer,
    aliases: p.answer_aliases,
    difficulty: p.difficulty,
    status: p.status,
  }));

  return (
    <main className="flex flex-col gap-6">
      {/* Counts first: "how many puzzles are there?" is answered at a glance. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Link
          href={href(null, statusFilter)}
          className={`flex flex-col justify-between rounded-2xl border p-4 ${typeFilter === null ? "border-accent bg-accent/10" : "border-border-subtle bg-bg-surface hover:bg-bg-surface-alt"}`}
        >
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">Total</span>
          <span className="font-display text-5xl font-bold text-accent">{pool.length}</span>
          <span className="text-xs text-text-muted">
            {pool.length - draftCount} published
            {draftCount > 0 && <span className="text-amber-300"> · {draftCount} draft</span>}
          </span>
        </Link>
        {ROUND_ORDER.map((t) => {
          const list = pool.filter((p) => p.type === t);
          const published = list.filter((p) => p.status === "published");
          const by = (d: string) => published.filter((p) => p.difficulty === d).length;
          const drafts = list.length - published.length;
          return (
            <Link
              key={t}
              href={href(t, statusFilter)}
              className={`flex flex-col justify-between gap-1 rounded-2xl border p-4 ${typeFilter === t ? "border-accent bg-accent/10" : "border-border-subtle bg-bg-surface hover:bg-bg-surface-alt"}`}
            >
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{PUZZLE_LABEL[t]}</span>
              <span className="font-display text-5xl font-bold text-text-primary">{list.length}</span>
              <span className="text-xs text-text-muted">
                {by("easy")} easy · {by("medium")} med · {by("hard")} hard
                {drafts > 0 && <span className="text-amber-300"> · {drafts} draft</span>}
              </span>
              {published.length < MVP_TARGET && (
                <span className="text-xs text-amber-300">{MVP_TARGET - published.length} below the §30 target</span>
              )}
            </Link>
          );
        })}
      </section>

      {draftCount > 0 && statusFilter !== "draft" && (
        <Link
          href={href(null, "draft")}
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm text-amber-200 hover:bg-amber-300/15"
        >
          <span>
            <span className="font-display text-lg font-bold">{draftCount}</span> draft{draftCount === 1 ? "" : "s"} waiting
            for review. Drafts are never drawn into a match.
          </span>
          <span className="font-semibold">Review drafts →</span>
        </Link>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold">
            {typeFilter ? PUZZLE_LABEL[typeFilter] : "All puzzles"}
            {statusFilter && ` · ${statusFilter === "draft" ? "drafts" : "published"}`}{" "}
            <span className="text-text-muted">({shown.length})</span>
          </h1>
          <Link href={typeFilter ? `/admin/new?type=${typeFilter}` : "/admin/new"} className={buttonClass.primary}>
            + Add {typeFilter ? PUZZLE_LABEL[typeFilter] : "puzzle"}
          </Link>
        </div>

        <nav className="flex flex-wrap gap-1" aria-label="Filter by status">
          <Link href={href(typeFilter, null)} className={tabClass(statusFilter === null)}>
            All
          </Link>
          <Link href={href(typeFilter, "published")} className={tabClass(statusFilter === "published")}>
            Published
          </Link>
          <Link href={href(typeFilter, "draft")} className={tabClass(statusFilter === "draft")}>
            Drafts <span className={draftsInView > 0 ? "text-amber-300" : "text-text-muted"}>({draftsInView})</span>
          </Link>
        </nav>

        {savedIds.length > 0 && (
          <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
            Saved {savedIds.join(", ")}.
          </p>
        )}

        <PuzzleTable
          key={`${typeFilter}-${statusFilter}`}
          rows={rows}
          showType={typeFilter === null}
          selectable={statusFilter === "draft"}
          highlight={savedIds}
        />
      </section>
    </main>
  );
}
