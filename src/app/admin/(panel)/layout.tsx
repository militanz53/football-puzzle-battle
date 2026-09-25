import Link from "next/link";
import { buttonClass } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { logout } from "../login/actions";

const NAV = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/new", label: "Add puzzle" },
  { href: "/admin/import", label: "Bulk import" },
];

// Every page in this group also calls requireAdmin() itself: a layout does not
// re-render on every navigation, so it cannot be the only check.
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
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
        <form action={logout} className="ml-auto">
          <button type="submit" className={buttonClass.ghost}>
            Sign out
          </button>
        </form>
      </header>
      {children}
    </>
  );
}
