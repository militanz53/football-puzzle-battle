// Supabase settings from the environment (.env.local in development; see .env.example).
// NEXT_PUBLIC_* values are inlined into browser bundles at build time, which only
// works for literal `process.env.NEXT_PUBLIC_…` reads, so they are spelled out here.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in from the Supabase dashboard.`);
  }
  return value;
}

/** The project URL; public, used by both clients. */
export function supabaseUrl(): string {
  return required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Safe for the browser: the project URL and the publishable key. */
export function publicSupabaseConfig(): { url: string; publishableKey: string } {
  return {
    url: supabaseUrl(),
    publishableKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  };
}

/**
 * Server only. The secret key bypasses Row Level Security, so it must never reach
 * a browser; Next.js leaves non-NEXT_PUBLIC variables out of client bundles anyway.
 */
export function secretSupabaseKey(): string {
  return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}
