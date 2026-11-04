import { afterEach, describe, it, expect, vi } from "vitest";
import { configuration, WorkspaceApi } from "../src/api";
import { quarterEnd, escapeHtml } from "../src/schema";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("configuración y fechas", () => {
  it.each(["/", "/checkins-kids-roles/"])("Google regresa a la ruta publicada %s", async (base) => {
    const api = new WorkspaceApi({ url: "https://area-test.supabase.co", key: "sb_publishable_test" });
    const signIn = vi.spyOn(api.client.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: "https://area-test.supabase.co/auth/v1/authorize" }, error: null
    });
    vi.stubEnv("BASE_URL", base);
    vi.stubGlobal("window", { location: { origin: "https://example.github.io" } });
    await api.login();
    expect(signIn).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: `https://example.github.io${base}`, queryParams: { prompt: "select_account" } }
    });
  });
  it("no activa datos ficticios cuando falta configuración", () => {
    expect(configuration({})).toBeNull();
    expect(() => configuration({ VITE_SUPABASE_URL: "https://test.supabase.co" })).toThrow("Completa");
  });
  it("rechaza claves secretas y destinos distintos al proyecto Supabase", () => {
    expect(() => configuration({ VITE_SUPABASE_URL: "https://test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_no" })).toThrow("secreta");
    expect(() => configuration({ VITE_SUPABASE_URL: "http://example.test", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake" })).toThrow("HTTPS");
    const token = `x.${btoa(JSON.stringify({ role: "service_role" }))}.x`;
    expect(() => configuration({ VITE_SUPABASE_URL: "https://test.supabase.co", VITE_SUPABASE_PUBLISHABLE_KEY: token })).toThrow("nunca service_role");
  });
  it("calcula tres meses sin desbordar meses cortos", () => {
    expect(quarterEnd("2026-11-03")).toBe("2027-02-02");
    expect(quarterEnd("2026-11-30")).toBe("2027-02-27");
  });
  it("escapa valores introducidos por las personas antes de mostrarlos", () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });
});
