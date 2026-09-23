import type { Metadata } from "next";
import Link from "next/link";

// Unlisted developer tool: nothing in the game links here (no login in the MVP, §29).
export const metadata: Metadata = {
  title: "Puzzle Admin · Football Puzzle Battle",
  robots: { index: false, follow: false },
};

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/new", label: "Add puzzle" },
  { href: "/admin/import", label: "Bulk import" },
];

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border-subtle pb-4">
        <p className="font-display text-lg font-bold">
          Puzzle Admin <span className="text-sm font-semibold text-text-muted">· dev tool</span>
        </p>
        <nav className="flex flex-wrap gap-1">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-1.5 font-display text-sm font-semibold text-text-secondary hover:bg-bg-surface hover:text-text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}
