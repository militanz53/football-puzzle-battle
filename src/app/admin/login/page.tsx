import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LoginForm } from "@/components/admin/LoginForm";
import { isAdminSignedIn } from "@/lib/admin/auth";
import { AdminConfigError, safeNextPath } from "@/lib/admin/session";

export const metadata: Metadata = { title: "Sign in · Puzzle Admin" };

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  await connection();
  const next = safeNextPath((await searchParams).next);

  let configError: string | null = null;
  try {
    if (await isAdminSignedIn()) redirect(next);
  } catch (e) {
    if (!(e instanceof AdminConfigError)) throw e;
    configError = e.message;
  }

  return (
    <main className="flex flex-1 items-center justify-center py-12">
      <section className="w-full max-w-sm rounded-2xl border border-border-subtle bg-bg-surface p-6">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-text-muted">Football Puzzle Battle</p>
        <h1 className="mt-1 font-display text-2xl font-bold">Puzzle Admin</h1>
        {configError ? (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {configError}
          </p>
        ) : (
          <LoginForm next={next} />
        )}
      </section>
    </main>
  );
}
