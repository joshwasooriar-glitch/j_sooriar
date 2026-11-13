import { readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildHealth, migrationVersion } from "@/lib/health";

const SHIPPED = readdirSync(join(__dirname, "..", "supabase", "migrations"))
  .map(migrationVersion)
  .filter((v): v is string => v !== null);

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

async function callRoute() {
  vi.resetModules();
  const { GET } = await import("@/app/api/health/route");
  const res = await GET();
  return { status: res.status, text: await res.text() };
}

describe("GET /api/health", () => {
  it("exists and answers 200 in demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("JARVIS_AI_ENABLED", "");
    const { status, text } = await callRoute();
    expect(status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      status: "ok",
      supabase: { configured: false, reachable: null },
      data: "demo",
      ai: { enabled: false },
      migrations: { applied: null, expected: SHIPPED, pending: null, error: null },
    });
  });

  it("reports the database's applied migrations and what is pending", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("JARVIS_AI_ENABLED", "true");
    const applied = SHIPPED.slice(0, -1);
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      expect(String(input)).toBe("http://supabase.test/rest/v1/rpc/applied_migrations");
      return new Response(JSON.stringify(applied.map((version) => ({ version }))), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const { status, text } = await callRoute();
    const body = JSON.parse(text);
    expect(status).toBe(503);
    expect(body.data).toBe("live");
    expect(body.ai).toEqual({ enabled: true });
    expect(body.supabase).toEqual({ configured: true, reachable: true });
    expect(body.migrations.applied).toEqual(applied);
    expect(body.migrations.pending).toEqual(SHIPPED.slice(-1));
  });

  it("never puts a secret, the Supabase URL or a raw error in the response", async () => {
    const secrets = {
      NEXT_PUBLIC_SUPABASE_URL: "https://secret-project-ref.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-SENTINEL-1",
      SUPABASE_SERVICE_ROLE_KEY: "service-SENTINEL-2",
      OPENAI_API_KEY: "sk-SENTINEL-3",
    };
    for (const [k, v] of Object.entries(secrets)) vi.stubEnv(k, v);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("fetch failed: secret-project-ref.supabase.co"));
    const { status, text } = await callRoute();
    expect(status).toBe(503);
    expect(JSON.parse(text).migrations.error).toBe("unreachable");
    expect(JSON.parse(text).supabase.reachable).toBe(false);
    for (const v of [...Object.values(secrets), "secret-project-ref", "SENTINEL", "fetch failed"]) {
      expect(text).not.toContain(v);
    }
  });

  it("reports a database without the helper function as function_missing", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: "PGRST202", message: "Could not find the function" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );
    const { status, text } = await callRoute();
    expect(status).toBe(503);
    expect(JSON.parse(text).migrations).toMatchObject({ applied: null, pending: null, error: "function_missing" });
  });
});

describe("buildHealth", () => {
  it("is ok when every shipped migration is applied", () => {
    const h = buildHealth({ supabaseConfigured: true, aiEnabled: false, applied: { versions: ["2", "1"] }, expected: ["1", "2"] });
    expect(h.status).toBe("ok");
    expect(h.migrations).toEqual({ applied: ["1", "2"], expected: ["1", "2"], pending: [], error: null });
  });

  it("ignores files that are not migrations", () => {
    expect(migrationVersion("20261105000000_ledger_functions.sql")).toBe("20261105000000");
    expect(migrationVersion("README.md")).toBeNull();
    expect(migrationVersion("seed.sql")).toBeNull();
  });
});
