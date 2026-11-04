import { test, expect } from "@playwright/test";

test("el paquete instalable no incluye cuentas ficticias y su shell abre sin conexión", async ({ page, context, request, baseURL }) => {
  const home = new URL("./", baseURL).href;
  const base = new URL(home).pathname;
  const manifestURL = new URL("manifest.webmanifest", home).href;
  const manifest = await (await request.get(manifestURL)).json();
  expect(manifest.display).toBe("standalone");
  expect(new URL(manifest.start_url, manifestURL).href).toBe(home);
  expect(new URL(manifest.scope, manifestURL).href).toBe(home);
  for (const icon of manifest.icons) expect((await request.get(new URL(icon.src, manifestURL).href)).ok()).toBe(true);
  await page.goto(manifestURL);
  await page.evaluate(() => caches.open("area-shell-other-project"));
  await page.goto(home);
  await expect(page.getByRole("heading", { name: "Tu equipo, a un paso." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Abrir guía de configuración/ })).toHaveAttribute("href", `${base}CONFIGURAR.md`);
  await expect.poll(() => page.locator(".brand img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(home);
  const cached = await page.evaluate(async (base) => {
    const keys = await caches.keys();
    const cache = await caches.open(keys.find((key) => key.startsWith(`area-shell-${encodeURIComponent(base)}-`))!);
    return (await cache.keys()).map((entry) => entry.url);
  }, base);
  expect(await page.evaluate(() => caches.has("area-shell-other-project"))).toBe(true);
  expect(cached.some((url) => url.includes("/assets/"))).toBe(true);
  expect(cached.every((url) => new URL(url).origin === new URL(page.url()).origin)).toBe(true);
  expect(cached.every((url) => new URL(url).pathname.startsWith(base))).toBe(true);
  expect(cached.some((url) => /supabase|auth\/v1|rest\/v1/.test(url))).toBe(false);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Tu equipo, a un paso." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
