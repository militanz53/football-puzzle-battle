import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_COOKIE, createSessionToken } from "@/lib/admin/session";
import { config, proxy } from "./proxy";

const PASSWORD = "unit-test-admin-password-123";

beforeEach(() => vi.stubEnv("ADMIN_PANEL_PASSWORD", PASSWORD));

async function request(path: string, { method = "GET", cookie }: { method?: string; cookie?: string } = {}) {
  const headers = new Headers();
  if (cookie !== undefined) headers.set("cookie", `${ADMIN_COOKIE}=${cookie}`);
  return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { method, headers }));
}

describe("admin proxy", () => {
  it("runs on every /admin URL and nothing else", () => {
    expect(config.matcher).toEqual(["/admin", "/admin/:path*"]);
  });

  it("sends a page request without a session to the login page, remembering where it was going", async () => {
    const res = await request("/admin/import?x=1");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login?next=%2Fadmin%2Fimport%3Fx%3D1");
  });

  it("answers any other request without a session with 401 (e.g. a Server Function POST)", async () => {
    const res = await request("/admin", { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("lets the login page through", async () => {
    const res = await request("/admin/login");
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("lets a signed-in admin through", async () => {
    const res = await request("/admin/edit/goal_001", { cookie: await createSessionToken(PASSWORD) });
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not accept a forged cookie", async () => {
    const res = await request("/admin", { cookie: "9999999999999.forged" });
    expect(res.status).toBe(307);
  });

  it("fails closed without ADMIN_PANEL_PASSWORD", async () => {
    vi.stubEnv("ADMIN_PANEL_PASSWORD", "");
    const res = await request("/admin", { cookie: await createSessionToken(PASSWORD) });
    expect(res.status).toBe(503);
    expect(await res.text()).toMatch(/ADMIN_PANEL_PASSWORD is not set/);
  });
});
