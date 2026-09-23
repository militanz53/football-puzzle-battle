"use client";

import { useState, useTransition } from "react";
import { importPuzzles } from "@/app/admin/actions";
import { PUZZLE_LABEL, PuzzleBoard } from "@/components/puzzles/PuzzleBoard";
import { type ImportResult, parseImport } from "@/data/schema";
import { SCHEMA_PROMPT } from "@/data/schemaGuide";
import { REVEAL_COUNT } from "@/game/scoring";
import type { Puzzle, PuzzleType } from "@/game/types";
import { buttonClass, Card, DifficultyTag, inputClass, IssueList } from "./ui";

/**
 * Bulk import: paste a JSON array (e.g. from an AI tool), check every record
 * against the schema and the current pool, preview the valid ones, then add them
 * in one write. The server checks the batch again before writing.
 */
export function ImportPanel({ pool }: { pool: Puzzle[] }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const items = result?.ok ? result.items : [];
  const valid = items.filter((i) => i.puzzle);
  const invalid = items.filter((i) => !i.puzzle);

  function validate() {
    setDone(null);
    setServerError(null);
    setResult(parseImport(text, pool));
  }

  function confirm() {
    startSaving(async () => {
      const response = await importPuzzles(valid.map((i) => i.puzzle!));
      if (!response.ok) {
        // The pool changed since validating (e.g. another tab); re-check against it.
        setServerError(
          `Nothing was added: ${response.problems.length} record(s) no longer pass on the server. Validate again to see why.`,
        );
        return;
      }
      setDone(`Added ${response.ids.length} puzzle(s): ${response.ids.join(", ")}.`);
      setResult(null);
      setText("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <SchemaGuide />

      <Card title="Paste JSON">
        <textarea
          rows={14}
          spellCheck={false}
          className={`${inputClass} font-mono text-xs`}
          placeholder='[ { "type": "career_journey", "difficulty": "medium", ... } ]'
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={validate} disabled={text.trim() === ""} className={buttonClass.primary}>
            Validate
          </button>
          <span className="text-xs text-text-muted">
            A JSON array of puzzles. A single object, a {"{ \"puzzles\": [...] }"} wrapper or a ```json fence also work.
          </span>
        </div>
      </Card>

      {done && <p className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent">{done}</p>}
      {result && !result.ok && <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">{result.error}</p>}

      {result?.ok && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-bg-surface p-4">
            <p className="text-sm">
              <span className="font-display text-2xl font-bold text-accent">{valid.length}</span> ready to add
              {invalid.length > 0 && (
                <>
                  {" · "}
                  <span className="font-display text-2xl font-bold text-red-300">{invalid.length}</span> with errors (skipped)
                </>
              )}
            </p>
            <button type="button" onClick={confirm} disabled={valid.length === 0 || saving} className={buttonClass.primary}>
              {saving ? "Adding…" : `Add ${valid.length} puzzle${valid.length === 1 ? "" : "s"}`}
            </button>
          </div>
          {serverError && <p className="text-sm text-red-300">{serverError}</p>}

          {invalid.length > 0 && (
            <Card title="Errors">
              <ul className="flex flex-col gap-4">
                {invalid.map((item) => (
                  <li key={item.index} className="flex flex-col gap-1.5">
                    <p className="text-sm font-semibold">
                      #{item.index}
                      <span className="ml-2 text-text-secondary">{typeLabel(item.type)}</span>
                      <span className="ml-2">{item.label}</span>
                      {item.id && <span className="ml-2 font-mono text-xs text-text-muted">{item.id}</span>}
                    </p>
                    <IssueList issues={item.issues} />
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {valid.length > 0 && (
            <Card title="Preview">
              <ul className="flex flex-col divide-y divide-border-subtle">
                {valid.map(({ index, puzzle }) => (
                  <PreviewRow key={index} index={index} puzzle={puzzle!} />
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function typeLabel(type: string | undefined): string {
  return type && type in PUZZLE_LABEL ? PUZZLE_LABEL[type as PuzzleType] : `unknown type${type ? ` "${type}"` : ""}`;
}

function PreviewRow({ index, puzzle }: { index: number; puzzle: Puzzle }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left text-sm">
        <span className="text-text-muted">#{index}</span>
        <span className="font-mono text-xs text-text-secondary">{puzzle.id}</span>
        <span className="text-text-secondary">{PUZZLE_LABEL[puzzle.type]}</span>
        <span className="font-semibold">{puzzle.correct_answer}</span>
        <DifficultyTag value={puzzle.difficulty} />
        {puzzle.status === "draft" && <span className="text-xs text-amber-300">draft</span>}
        <span className="ml-auto text-xs text-text-muted">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <div className="mt-3 max-w-sm">
          <PuzzleBoard puzzle={puzzle} revealed={REVEAL_COUNT} />
        </div>
      )}
    </li>
  );
}

function SchemaGuide() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(SCHEMA_PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setOpen(!open)} className={buttonClass.secondary}>
          {open ? "Hide example format" : "Show example format"}
        </button>
        <button type="button" onClick={copy} className={buttonClass.ghost}>
          {copied ? "Copied" : "Copy format for an AI tool"}
        </button>
        <span className="text-xs text-text-muted">Every field of every type, plus one example of each.</span>
      </div>
      {open && (
        <pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg border border-border-subtle bg-bg-primary p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-text-secondary">
          {SCHEMA_PROMPT}
        </pre>
      )}
    </Card>
  );
}
