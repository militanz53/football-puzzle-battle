"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { savePuzzle } from "@/app/admin/actions";
import { PUZZLE_LABEL, PuzzleBoard } from "@/components/puzzles/PuzzleBoard";
import { DIFFICULTIES, type Issue, nextId, STATUSES, validatePuzzle } from "@/data/schema";
import { ROUND_ORDER } from "@/game/match";
import { REVEAL_COUNT } from "@/game/scoring";
import type { PuzzleType } from "@/game/types";
import { DEFAULT_QUESTION, type Draft, draftToRecord } from "./draft";
import { TypeFields } from "./TypeFields";
import { buttonClass, Card, Field, inputClass, IssueList } from "./ui";

interface Props {
  initial: Draft;
  /** Id of the record being edited; null when creating. */
  editing: string | null;
  /** Ids already in the pool, to suggest the next free one. */
  takenIds: string[];
}

/** Single puzzle add/edit (§24.1 fields). The type-specific part follows the type picked. */
export function PuzzleForm({ initial, editing, takenIds }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [attempted, setAttempted] = useState(false);
  const [serverIssues, setServerIssues] = useState<Issue[]>([]);
  const [stage, setStage] = useState(REVEAL_COUNT);
  const [saving, startSaving] = useTransition();

  const result = useMemo(() => validatePuzzle(draftToRecord(draft)), [draft]);
  const update = (change: (d: Draft) => Draft) => {
    setDraft(change);
    setServerIssues([]);
  };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => update((d) => ({ ...d, [key]: value }));

  function changeType(type: PuzzleType) {
    update((d) => ({
      ...d,
      type,
      // Keep a hand-typed id or question; replace the suggested ones.
      id: d.id === nextId(d.type, takenIds) ? nextId(type, takenIds) : d.id,
      question: d.question === DEFAULT_QUESTION[d.type] ? DEFAULT_QUESTION[type] : d.question,
    }));
  }

  function save() {
    setAttempted(true);
    if (!result.ok) return;
    startSaving(async () => {
      const response = await savePuzzle(result.puzzle, editing);
      if (!response.ok) {
        setServerIssues(response.issues);
        return;
      }
      router.push(`/admin?type=${result.puzzle.type}&saved=${encodeURIComponent(response.id)}`);
    });
  }

  const issues = [...(result.ok ? [] : result.issues), ...serverIssues];
  const text = (key: "question" | "correct_answer" | "competition" | "season" | "id") => ({
    className: inputClass,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  return (
    <form
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div className="flex flex-col gap-4">
        <Card title="Puzzle">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Type" hint={editing ? "Fixed once created." : "The form below follows the type."}>
              <select
                className={inputClass}
                value={draft.type}
                disabled={editing !== null}
                onChange={(e) => changeType(e.target.value as PuzzleType)}
              >
                {ROUND_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {PUZZLE_LABEL[t]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="ID">
              <input {...text("id")} />
            </Field>
            <Field label="Correct answer">
              <input {...text("correct_answer")} placeholder="Full name, e.g. Andrea Pirlo" />
            </Field>
            <Field label="Answer aliases (comma-separated)" hint="Case, accents and spaces are ignored when matching (§26.1).">
              <input
                className={inputClass}
                value={draft.answer_aliases}
                onChange={(e) => set("answer_aliases", e.target.value)}
                placeholder="Pirlo, L'Architetto"
              />
            </Field>
            <Field label="Question">
              <input {...text("question")} />
            </Field>
            <Field label="Tags (comma-separated)">
              <input className={inputClass} value={draft.tags} onChange={(e) => set("tags", e.target.value)} />
            </Field>
            <Field label="Difficulty">
              <select className={inputClass} value={draft.difficulty} onChange={(e) => set("difficulty", e.target.value as Draft["difficulty"])}>
                {DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Bot difficulty (§29.1)">
              <select
                className={inputClass}
                value={draft.bot_difficulty}
                onChange={(e) => set("bot_difficulty", e.target.value as Draft["bot_difficulty"])}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Competition (optional)">
              <input {...text("competition")} />
            </Field>
            <Field label="Season (optional)">
              <input {...text("season")} />
            </Field>
            <Field label="Status" hint="Drafts are never drawn into a match.">
              <select className={inputClass} value={draft.status} onChange={(e) => set("status", e.target.value as Draft["status"])}>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Reveal interval (s)" hint="Fixed at 3 in the MVP (§6.1).">
              <input
                className={inputClass}
                inputMode="numeric"
                value={draft.reveal_interval_seconds}
                onChange={(e) => set("reveal_interval_seconds", e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card title={`${PUZZLE_LABEL[draft.type]} · reveal data`}>
          <TypeFields draft={draft} update={update} />
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Card title="Preview">
          {result.ok ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-1">
                {Array.from({ length: REVEAL_COUNT }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setStage(n)}
                    className={`h-8 flex-1 rounded-md font-display text-sm font-semibold ${stage === n ? "bg-accent text-bg-primary" : "bg-bg-surface-alt text-text-secondary"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted">Reveal {stage} of {REVEAL_COUNT}, as a player sees it.</p>
              <PuzzleBoard key={stage} puzzle={result.puzzle} revealed={stage} />
            </div>
          ) : (
            <p className="text-sm text-text-muted">Appears once every field is valid.</p>
          )}
        </Card>

        {(attempted || serverIssues.length > 0) && issues.length > 0 && (
          <Card title={`${issues.length} to fix`}>
            <IssueList issues={issues} />
          </Card>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={saving} className={`${buttonClass.primary} flex-1`}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add puzzle"}
          </button>
          <button type="button" onClick={() => router.back()} className={buttonClass.secondary}>
            Cancel
          </button>
        </div>
        {!attempted && !result.ok && (
          <p className="text-xs text-text-muted">{result.issues.length} field(s) still need input.</p>
        )}
      </div>
    </form>
  );
}
