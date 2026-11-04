"use strict";
const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("presenta los roles sin errores y se adapta a la pantalla", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.getByRole("heading", { name: "Cada persona, en su lugar." })).toBeVisible();
  await expect(page.locator(".area-card")).toHaveCount(5);
  await expect(page.getByText("Datos ficticios;", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("roles.png"), fullPage: true });
  expect(errors).toEqual([]);
});

test("guarda una asignación y una nota tras recargar", async ({ page }) => {
  await page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Pablo Ríos", exact: true }).click();
  await page.getByLabel("Voluntario", { exact: true }).selectOption("ana");
  await page.getByLabel("Nota para el equipo", { exact: false }).fill("Preparar la bienvenida");
  await page.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.getByText("Preparar la bienvenida", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Ana López", exact: true })).toBeVisible();
  await expect(page.getByText("Preparar la bienvenida", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Actividad", exact: true }).click();
  await expect(page.getByText("Administración actualizó Maestro/a en Babies.")).toBeVisible();
});

test("impide duplicados sin cerrar el editor ni perder el formulario", async ({ page }) => {
  await page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Pablo Ríos", exact: true }).click();
  await page.getByLabel("Voluntario", { exact: true }).selectOption("maria");
  await page.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(page.getByRole("alert")).toContainText("ya tiene un puesto");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Voluntario", { exact: true })).toHaveValue("maria");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("coordinador edita solo Kinder y voluntario solo consulta", async ({ page }) => {
  await page.getByLabel("Simular perfil").selectOption("coordinator");
  await expect(page.locator('.area-card.peach [data-action="edit"]')).toHaveCount(0);
  await expect(page.locator('.area-card.yellow [data-action="edit"]')).toHaveCount(3);
  await page.getByLabel("Simular perfil").selectOption("volunteer");
  await expect(page.locator('[data-action="edit"]')).toHaveCount(0);
  await page.getByRole("button", { name: "Mi participación", exact: true }).click();
  await page.getByRole("button", { name: /Segundo.*10:40/ }).click();
  await expect(page.locator(".slot strong")).toHaveText(["Diego Luna"]);
});

test("permite recorrer fechas, usar filtros y consultar la tabla avanzada", async ({ page }) => {
  await page.getByLabel("Filtrar por área").selectOption("kinder");
  await expect(page.locator(".area-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Avanzado", exact: true }).click();
  await expect(page.locator(".assignments-table tbody tr")).toHaveCount(3);
  await page.getByLabel("Buscar voluntario").fill("lucia");
  await expect(page.locator(".assignments-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Limpiar filtros", exact: false }).click();
  await page.getByRole("button", { name: "Domingo siguiente" }).click();
  await expect(page.getByLabel("Fecha del servicio")).toHaveValue("2026-11-15");
  await page.getByRole("button", { name: "Por asignar", exact: false }).click();
  await expect(page.locator(".assignments-table .badge.complete")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("añade un voluntario a varias áreas y lo conserva sin interpretar HTML", async ({ page }) => {
  await page.getByRole("button", { name: /^Voluntarios/ }).click();
  await page.locator("#main").getByRole("button", { name: "Añadir voluntario", exact: true }).click();
  await page.getByLabel("Nombre completo").fill("Persona <b>Ejemplo</b>");
  await page.getByRole("dialog").getByRole("button", { name: "Añadir voluntario", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("selecciona al menos un área");
  await page.getByLabel("Babies", { exact: true }).check();
  await page.getByLabel("Kinder", { exact: true }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Añadir voluntario", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Persona <b>Ejemplo</b>" })).toBeVisible();
  await expect(page.locator(".volunteer-card h3 b")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /^Voluntarios/ }).click();
  await expect(page.getByRole("heading", { name: "Persona <b>Ejemplo</b>" })).toBeVisible();
});

test("actualiza otra pestaña y rechaza el formulario que quedó desactualizado", async ({ page, context }) => {
  const other = await context.newPage();
  await other.goto("/");
  await page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Pablo Ríos", exact: true }).click();
  await other.getByRole("button", { name: "Cambiar Maestro/a en Babies: Pablo Ríos", exact: true }).click();
  await other.getByLabel("Voluntario", { exact: true }).selectOption("ana");
  await other.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(page.locator("#toast")).toContainText("otra pestaña");
  await page.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(page.getByRole("alert")).toContainText("otra pestaña");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Ana López", exact: true })).toBeVisible();
});

test("exporta JSON y la propuesta declara las limitaciones reales", async ({ page }) => {
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar datos" }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  const content = JSON.parse(await fs.readFile(await download.path(), "utf8"));
  expect(content.prototype).toBe(true);
  expect(content.assignments.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Configuración", exact: true }).click();
  await expect(page.getByText("no es un inicio de sesión", { exact: false })).toBeVisible();
  await expect(page.getByText("no es todavía una PWA", { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("muestra un error de almacenamiento sin fingir que guardó", async ({ page }) => {
  await page.evaluate(() => {
    Storage.prototype.setItem = () => { throw new DOMException("Sin espacio", "QuotaExceededError"); };
  });
  await page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Pablo Ríos", exact: true }).click();
  await page.getByLabel("Voluntario", { exact: true }).selectOption("ana");
  await page.getByRole("button", { name: "Guardar cambio" }).click();
  await expect(page.getByRole("alert")).toContainText("No se guardó el cambio");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Pablo Ríos", exact: true })).toBeVisible();
});

test("preserva datos dañados en lugar de sobrescribirlos", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("area.visual-prototype.v1", '{"version":99}'));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("sin sobrescribir tus datos");
  await expect(page.locator('[data-action="edit"]')).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("area.visual-prototype.v1"))).toBe('{"version":99}');
});
