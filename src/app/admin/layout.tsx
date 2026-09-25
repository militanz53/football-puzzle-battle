import type { Metadata } from "next";

// Unlisted developer tool: nothing in the game links here, and it is behind a
// shared password (src/lib/admin). The panel's own chrome is in (panel)/layout.tsx;
// the login page sits outside that group.
export const metadata: Metadata = {
  title: "Puzzle Admin · Football Puzzle Battle",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6">{children}</div>;
}
