"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { publishPuzzles } from "@/app/admin/actions";
import type { Difficulty, PuzzleStatus } from "@/game/types";
import { DeleteButton } from "./DeleteButton";
import { buttonClass, DifficultyTag } from "./ui";

export interface PuzzleRow {
  id: string;
  typeLabel: string;
  answer: string;
  aliases: string[];
  difficulty: Difficulty;
  status: PuzzleStatus;
}

/**
 * Puzzle list. Drafts can be published one by one from any view; with `selectable`
 * (the Drafts view) rows get checkboxes and a single "Publish selected" button,
 * which is the main review flow after a bulk import.
 */
export function PuzzleTable({
  rows,
  showType,
  selectable,
  highlight,
}: {
  rows: PuzzleRow[];
  showType: boolean;
  selectable: boolean;
  highlight: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startPublishing] = useTransition();

  const drafts = rows.filter((r) => r.status === "draft");
  // Rows can disappear after a publish or delete; only count what is still listed.
  const chosen = drafts.filter((r) => selected.has(r.id)).map((r) => r.id);
  const allChosen = drafts.length > 0 && chosen.length === drafts.length;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function publish(ids: string[]) {
    startPublishing(async () => {
      const { published } = await publishPuzzles(ids);
      setSelected(new Set());
      setMessage(published.length > 0 ? `Published ${published.join(", ")}.` : "Nothing to publish.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {selectable && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border-subtle bg-bg-surface px-4 py-3">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              aria-label="Select all drafts"
              checked={allChosen}
              disabled={drafts.length === 0}
              onChange={() => setSelected(allChosen ? new Set() : new Set(drafts.map((r) => r.id)))}
            />
            {chosen.length} of {drafts.length} selected
          </label>
          <button
            type="button"
            onClick={() => publish(chosen)}
            disabled={chosen.length === 0 || pending}
            className={`${buttonClass.primary} ml-auto`}
          >
            {pending ? "Publishing…" : `Publish selected (${chosen.length})`}
          </button>
        </div>
      )}

      {message && (
        <p role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">
          {message}
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border-subtle text-xs uppercase tracking-wider text-text-muted">
            <tr>
              {selectable && <th className="w-10 px-4 py-2" />}
              <th className="px-4 py-2 font-semibold">ID</th>
              {showType && <th className="px-4 py-2 font-semibold">Type</th>}
              <th className="px-4 py-2 font-semibold">Answer</th>
              <th className="px-4 py-2 font-semibold">Difficulty</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-border-subtle last:border-0 ${
                  selected.has(r.id) || highlight.includes(r.id) ? "bg-accent/5" : ""
                }`}
              >
                {selectable && (
                  <td className="px-4 py-2">
                    {r.status === "draft" && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.id}`}
                        checked={selected.has(r.id)}
                        onChange={() => toggle(r.id)}
                      />
                    )}
                  </td>
                )}
                <td className="px-4 py-2 font-mono text-xs text-text-secondary">{r.id}</td>
                {showType && <td className="px-4 py-2 text-text-secondary">{r.typeLabel}</td>}
                <td className="px-4 py-2">
                  <span className="font-semibold">{r.answer}</span>
                  {r.aliases.length > 0 && <span className="ml-2 text-xs text-text-muted">{r.aliases.join(", ")}</span>}
                </td>
                <td className="px-4 py-2">
                  <DifficultyTag value={r.difficulty} />
                </td>
                <td className="px-4 py-2 text-xs">
                  {r.status === "published" ? (
                    <span className="text-text-secondary">published</span>
                  ) : (
                    <span className="text-amber-300">draft</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {r.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => publish([r.id])}
                      disabled={pending}
                      aria-label={`Publish ${r.id}`}
                      className={`${buttonClass.ghost} text-accent hover:text-accent-hover`}
                    >
                      Publish
                    </button>
                  )}
                  <Link href={`/admin/edit/${encodeURIComponent(r.id)}`} className={buttonClass.ghost}>
                    Edit
                  </Link>
                  <DeleteButton id={r.id} label={r.answer} />
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-text-muted">
                  {selectable ? "No drafts waiting for review." : "No puzzles yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
