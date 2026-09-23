import type { Issue } from "@/data/schema";

// Plain building blocks for the admin panel: a developer tool, so §22 colours
// and fonts but no decoration.

export const inputClass =
  "w-full rounded-lg border border-border-subtle bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted-2 focus:border-accent focus:outline-none";

export const buttonClass = {
  primary:
    "rounded-lg bg-accent px-4 py-2 font-display text-sm font-bold text-bg-primary hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "rounded-lg border border-border-subtle px-4 py-2 font-display text-sm font-semibold text-text-primary hover:bg-bg-surface-alt disabled:opacity-50",
  ghost: "rounded-lg px-3 py-1.5 font-display text-sm font-semibold text-text-secondary hover:text-text-primary",
  danger:
    "rounded-lg px-3 py-1.5 font-display text-sm font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50",
};

export function Card({ title, children, className = "" }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border-subtle bg-bg-surface p-4 ${className}`}>
      {title && <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-wider text-text-secondary">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      {children}
      {hint && <span className="text-xs text-text-muted">{hint}</span>}
    </label>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {issues.map((issue, i) => (
        <li key={i} className="text-red-300">
          {issue.path && <code className="mr-2 rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-200">{issue.path}</code>}
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

const DIFFICULTY_COLOUR = { easy: "text-accent", medium: "text-amber-300", hard: "text-red-300" };

export function DifficultyTag({ value }: { value: "easy" | "medium" | "hard" }) {
  return <span className={`text-xs font-semibold uppercase ${DIFFICULTY_COLOUR[value]}`}>{value}</span>;
}
