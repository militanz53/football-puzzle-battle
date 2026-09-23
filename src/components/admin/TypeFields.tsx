"use client";

import { GOAL_MAP_BOUNDS, HAIR_STYLES, KIT_PATTERNS } from "@/data/schema";
import type { Draft } from "./draft";
import { Field, inputClass } from "./ui";

// The reveal_data part of the form, one editor per puzzle type.

type Props = { draft: Draft; update: (change: (d: Draft) => Draft) => void };

export function TypeFields({ draft, update }: Props) {
  switch (draft.type) {
    case "career_journey":
      return (
        <Field
          label="Clubs (one per line, in order)"
          hint='At least 5. Easy: "Club (years)" · Medium: club names · Hard: home city or country only (§9.4).'
        >
          <textarea
            rows={8}
            className={inputClass}
            value={draft.career.clubs}
            onChange={(e) => update((d) => ({ ...d, career: { clubs: e.target.value } }))}
          />
        </Field>
      );
    case "teammate_web":
      return (
        <Field
          label="Teammates (one per line, hardest first)"
          hint="At least 6. Reveal 1 shows the first two, each reveal adds one. None may be the answer."
        >
          <textarea
            rows={8}
            className={inputClass}
            value={draft.web.players}
            onChange={(e) => update((d) => ({ ...d, web: { players: e.target.value } }))}
          />
        </Field>
      );
    case "photo_reveal":
      return <PhotoFields draft={draft} update={update} />;
    case "missing_xi":
      return <MissingXIFields draft={draft} update={update} />;
    case "goal_map":
      return <GoalMapFields draft={draft} update={update} />;
  }
}

function PhotoFields({ draft, update }: Props) {
  const ph = draft.photo;
  const set = (patch: Partial<Draft["photo"]>) => update((d) => ({ ...d, photo: { ...d.photo, ...patch } }));
  const colour = (label: string, key: "hairColor" | "skin" | "primary" | "secondary") => (
    <Field label={label}>
      <div className="flex gap-2">
        <input
          type="color"
          className="h-9 w-10 shrink-0 cursor-pointer rounded border border-border-subtle bg-bg-primary"
          value={/^#[0-9a-fA-F]{6}$/.test(ph[key]) ? ph[key] : "#000000"}
          onChange={(e) => set({ [key]: e.target.value.toUpperCase() })}
        />
        <input className={inputClass} value={ph[key]} onChange={(e) => set({ [key]: e.target.value })} />
      </div>
    </Field>
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-text-muted">
        Original illustration only, never a real photo (§9.2.1). These parameters drive the placeholder art and
        brief the illustrator.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Hair">
          <select className={inputClass} value={ph.hair} onChange={(e) => set({ hair: e.target.value })}>
            {HAIR_STYLES.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
        </Field>
        <Field label="Kit pattern">
          <select className={inputClass} value={ph.pattern} onChange={(e) => set({ pattern: e.target.value })}>
            {KIT_PATTERNS.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </Field>
        {colour("Hair colour", "hairColor")}
        {colour("Skin", "skin")}
        {colour("Kit primary", "primary")}
        {colour("Kit secondary", "secondary")}
      </div>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ph.captainArmband} onChange={(e) => set({ captainArmband: e.target.checked })} />
          Captain armband
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={ph.beard} onChange={(e) => set({ beard: e.target.checked })} />
          Beard
        </label>
      </div>
      <Field label="Stage labels (one per line)" hint="At least 5, one caption per reveal.">
        <textarea rows={5} className={inputClass} value={ph.stage_labels} onChange={(e) => set({ stage_labels: e.target.value })} />
      </Field>
      <Field label="license_type (optional)" hint="Unused in the MVP.">
        <input className={inputClass} value={ph.license_type} onChange={(e) => set({ license_type: e.target.value })} />
      </Field>
    </div>
  );
}

function ClueRows({ clues, onChange, hint }: { clues: Draft["goal"]["clues"]; onChange: (c: Draft["goal"]["clues"]) => void; hint: string }) {
  const set = (i: number, patch: Partial<Draft["goal"]["clues"][number]>) =>
    onChange(clues.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-text-secondary">Clues, in reveal order</span>
      {clues.map((c, i) => (
        <div key={i} className="grid grid-cols-[1.5rem_1fr_2fr] items-center gap-2">
          <span className="text-xs text-text-muted">{i + 1}</span>
          <input className={inputClass} placeholder="Label" value={c.label} onChange={(e) => set(i, { label: e.target.value })} />
          <input className={inputClass} placeholder="Value" value={c.value} onChange={(e) => set(i, { value: e.target.value })} />
        </div>
      ))}
      <span className="text-xs text-text-muted">{hint}</span>
    </div>
  );
}

function MissingXIFields({ draft, update }: Props) {
  const xi = draft.xi;
  const set = (patch: Partial<Draft["xi"]>) => update((d) => ({ ...d, xi: { ...d.xi, ...patch } }));
  const setSlot = (i: number, patch: Partial<Draft["xi"]["lineup"][number]>) =>
    set({ lineup: xi.lineup.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <div className="flex flex-col gap-4">
      <Field label="Team">
        <input className={inputClass} value={xi.team} onChange={(e) => set({ team: e.target.value })} />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-text-secondary">
          Line-up (11) · x, y in % of the pitch, y = 0 is the attacking end · tick the missing player
        </span>
        <div className="grid grid-cols-[auto_1fr_3.5rem_3.5rem_3.5rem] items-center gap-2 text-xs text-text-muted">
          <span>Missing</span>
          <span>Name</span>
          <span>No.</span>
          <span>x</span>
          <span>y</span>
          {xi.lineup.map((s, i) => (
            <SlotRow key={i} slot={s} missing={xi.missing === i} onMissing={() => set({ missing: i })} onChange={(p) => setSlot(i, p)} />
          ))}
        </div>
      </div>
      <ClueRows
        clues={xi.clues}
        onChange={(clues) => set({ clues })}
        hint="At least 5: Formation, Competition, Season, Opponent, Position (§9.3.1: contextual clues, not names)."
      />
    </div>
  );
}

function SlotRow({
  slot,
  missing,
  onMissing,
  onChange,
}: {
  slot: Draft["xi"]["lineup"][number];
  missing: boolean;
  onMissing: () => void;
  onChange: (patch: Partial<Draft["xi"]["lineup"][number]>) => void;
}) {
  return (
    <>
      <input type="radio" name="missing-slot" checked={missing} onChange={onMissing} className="mx-auto" />
      <input className={inputClass} value={slot.name} onChange={(e) => onChange({ name: e.target.value })} />
      <input className={inputClass} inputMode="numeric" value={slot.number} onChange={(e) => onChange({ number: e.target.value })} />
      <input className={inputClass} inputMode="decimal" value={slot.x} onChange={(e) => onChange({ x: e.target.value })} />
      <input className={inputClass} inputMode="decimal" value={slot.y} onChange={(e) => onChange({ y: e.target.value })} />
    </>
  );
}

function GoalMapFields({ draft, update }: Props) {
  const g = draft.goal;
  const set = (patch: Partial<Draft["goal"]>) => update((d) => ({ ...d, goal: { ...d.goal, ...patch } }));
  const attackers = g.attackers.split("\n").map((l) => l.trim()).filter(Boolean);
  const { width, depth } = GOAL_MAP_BOUNDS;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-text-muted">
        Metres: x across the pitch 0–{width} (attacker&apos;s left = 0), y from the goal line 0–{depth}. The goal
        mouth is x 30.34–37.66 at y 0; a goalkeeper stands near 34, 1.5. Watch the preview while you type.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Attackers (x, y per line)">
          <textarea rows={5} className={inputClass} value={g.attackers} onChange={(e) => set({ attackers: e.target.value })} />
        </Field>
        <Field label="Defenders (x, y per line)">
          <textarea rows={5} className={inputClass} value={g.defenders} onChange={(e) => set({ defenders: e.target.value })} />
        </Field>
      </div>
      <Field label="Passes before the shot (x, y -> x, y per line, in order)">
        <textarea rows={3} className={inputClass} value={g.passes} onChange={(e) => set({ passes: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scorer (shoots from)">
          <select className={inputClass} value={g.scorer} onChange={(e) => set({ scorer: Number(e.target.value) })}>
            {attackers.length === 0 && <option value={0}>Add attackers first</option>}
            {attackers.map((a, i) => (
              <option key={i} value={i}>
                Attacker {i + 1} ({a})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Shot ends at (x, y)">
          <input className={inputClass} value={g.shotTo} onChange={(e) => set({ shotTo: e.target.value })} />
        </Field>
      </div>
      <ClueRows
        clues={g.clues}
        onChange={(clues) => set({ clues })}
        hint="At least 4 (reveals 2–5): Competition, Season or Year, Opponent, Minute."
      />
    </div>
  );
}
