import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, adminPassword, AdminConfigError, LOGIN_PATH, verifySessionToken } from "@/lib/admin/session";

// Next.js 16 Proxy (formerly Middleware): a first gate in front of every /admin URL.
// Without a valid session cookie, pages redirect to the login screen and any other
// request (e.g. a Server Function POST) gets 401. This is the optimistic check the
// Next.js auth guide recommends; the real check runs again in every panel page and
// admin Server Function (src/lib/admin/auth.ts).

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  if (pathname === LOGIN_PATH) return NextResponse.next();

  let password: string;
  try {
    password = adminPassword();
  } catch (e) {
    if (e instanceof AdminConfigError) return new NextResponse(e.message, { status: 503 });
    throw e;
  }

  if (await verifySessionToken(request.cookies.get(ADMIN_COOKIE)?.value, password)) return NextResponse.next();

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("Sign in to the admin panel first.", { status: 401 });
  }
  const login = new URL(LOGIN_PATH, request.url);
  login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
