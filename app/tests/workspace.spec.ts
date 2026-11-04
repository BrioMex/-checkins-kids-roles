import { test, expect, type Page } from "@playwright/test";
import { backend, people } from "./browser-backend";
import { fileURLToPath } from "node:url";

async function interceptPrint(page: Page) {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printRequested = String(Number(document.documentElement.dataset.printRequested ?? 0) + 1);
    };
  });
}
async function requestPrint(page: Page, range = "selected") {
  await page.getByRole("button", { name: "Imprimir rol", exact: true }).click();
  await page.getByLabel("Fechas a imprimir").selectOption(range);
  await page.getByRole("button", { name: "Imprimir", exact: true }).click();
}

test("muestra acceso privado y utiliza Google OAuth sin exponer directorio", async ({ context, page }) => {
  const mock = await backend();
  try {
    await mock.attach(context, "admin", false);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(page.getByText("Ana Ejemplo")).toHaveCount(0);
    const request = page.waitForRequest((req) => req.url().includes("/auth/v1/authorize"));
    await page.getByRole("button", { name: "Continuar con Google" }).click();
    const url = new URL((await request).url());
    expect(url.searchParams.get("provider")).toBe("google");
    expect(url.searchParams.get("redirect_to")).toBe("http://127.0.0.1:4174/");
  } finally { await mock.close(); }
});
test("guarda roles en PostgreSQL, conserva notas y se adapta a la pantalla", async ({ context, page }, info) => {
  const mock = await backend();
  try {
    await mock.attach(context);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator(".area-card")).toHaveCount(5);
    await page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Ana Ejemplo", exact: true }).click();
    await page.getByLabel("Voluntario", { exact: true }).selectOption(people.beto);
    await page.getByLabel("Nota para el equipo (opcional)").fill("Preparar la bienvenida");
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Preparar la bienvenida", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Beto Ejemplo", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("app-roles.png"), fullPage: true });
    expect(errors).toEqual([]);
  } finally { await mock.close(); }
});
test("el coordinador solo edita sus áreas y el voluntario no recibe accesos", async ({ browser, context, page }) => {
  const mock = await backend();
  const volunteerContext = await browser.newContext();
  try {
    await mock.attach(context, "coordinator");
    await page.goto("/");
    await expect(page.locator('.area-card.peach [data-action="edit-assignment"]')).toHaveCount(0);
    await expect(page.locator('.area-card.yellow [data-action="edit-assignment"]')).toHaveCount(3);
    await mock.attach(volunteerContext, "volunteer");
    const volunteer = await volunteerContext.newPage();
    await volunteer.goto("/");
    await expect(volunteer.getByRole("heading", { name: "Cada persona, en su lugar." })).toBeVisible();
    await expect(volunteer.locator('[data-action="edit-assignment"]')).toHaveCount(0);
    await volunteer.getByRole("button", { name: "Mi participación", exact: true }).click();
    await expect(volunteer.locator(".slot strong")).toHaveText(["Ana Ejemplo"]);
    await volunteer.getByRole("button", { name: "Configuración", exact: true }).click();
    await expect(volunteer.getByText("Acceso del equipo", { exact: true })).toHaveCount(0);
    await expect(volunteer.getByText("admin@example.test", { exact: true })).toHaveCount(0);
  } finally { await volunteerContext.close(); await mock.close(); }
});
test("actualiza otra sesión en tiempo real y no sobrescribe una edición antigua", async ({ context, page }) => {
  const mock = await backend();
  try {
    await mock.attach(context);
    const other = await context.newPage();
    await page.goto("/");
    await other.goto("/");
    await expect(page.locator(".local-status")).toContainText("tiempo real");
    await expect(other.locator(".local-status")).toContainText("tiempo real");
    const label = "Cambiar Maestro/a en Babies: Ana Ejemplo";
    await page.getByRole("button", { name: label, exact: true }).click();
    await other.getByRole("button", { name: label, exact: true }).click();
    await other.getByLabel("Voluntario", { exact: true }).selectOption(people.beto);
    await other.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(page.locator('#app [data-action="edit-assignment"]').filter({ hasText: "Beto Ejemplo" })).toHaveCount(1);
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Otra persona cambió");
    await expect(page.getByRole("dialog")).toBeVisible();
  } finally { await mock.close(); }
});
test("administra personas y permisos sin enviar invitaciones de correo", async ({ context, page }) => {
  const mock = await backend();
  try {
    await mock.attach(context);
    await page.goto("/");
    await page.getByRole("button", { name: "Voluntarios", exact: true }).click();
    await page.getByRole("button", { name: "Añadir voluntario", exact: true }).click();
    await page.getByLabel("Nombre completo").fill("Persona Nueva");
    await page.getByLabel("Kinder", { exact: true }).check();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Persona Nueva" })).toBeVisible();
    await page.getByRole("button", { name: "Configuración", exact: true }).click();
    await page.getByRole("button", { name: "Autorizar", exact: true }).click();
    await page.getByLabel("Correo de Google").fill("new@example.test");
    await page.getByLabel("Perfil", { exact: true }).selectOption("coordinator");
    await page.getByLabel("Kinder", { exact: true }).check();
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("new@example.test", { exact: true })).toBeVisible();
  } finally { await mock.close(); }
});
test("la falta de conexión bloquea ediciones sin perder la última lectura", async ({ context, page }) => {
  const mock = await backend();
  try {
    await mock.attach(context);
    await page.goto("/");
    await expect(page.locator(".area-card")).toHaveCount(5);
    await context.setOffline(true);
    await expect(page.getByRole("alert")).toContainText("edición está desactivada");
    await expect(page.locator('[data-action="edit-assignment"]')).toHaveCount(0);
    await expect(page.getByText("Ana Ejemplo", { exact: true })).toBeVisible();
    await context.setOffline(false);
    await expect(page.locator('[data-action="edit-assignment"]')).toHaveCount(14);
  } finally { await context.setOffline(false); await mock.close(); }
});
test("un espacio nuevo no contiene datos ficticios y permite iniciar la importación", async ({ context, page }) => {
  const mock = await backend(true);
  try {
    await mock.attach(context);
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "El equipo empieza aquí" })).toBeVisible();
    await page.getByRole("button", { name: "Importar Excel", exact: true }).click();
    await expect(page.getByLabel("Archivo Rol_x_area (.xlsx, hasta 5 MB)")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page.getByRole("button", { name: "Voluntarios", exact: true }).click();
    await expect(page.getByRole("heading", { name: "El directorio está vacío" })).toBeVisible();
  } finally { await mock.close(); }
});
test("previsualiza Excel localmente, señala los dos puestos en conflicto e importa solo al confirmar", async ({ context, page }) => {
  const mock = await backend(true);
  let imports = 0;
  page.on("request", (req) => { if (req.url().endsWith("/rpc/import_workbook")) imports++; });
  try {
    await mock.attach(context);
    await page.goto("/");
    await page.getByRole("button", { name: "Importar Excel", exact: true }).click();
    const file = page.getByLabel("Archivo Rol_x_area (.xlsx, hasta 5 MB)");
    await file.setInputFiles(fileURLToPath(new URL("./fixtures/conflict.xlsx", import.meta.url)));
    await page.getByRole("button", { name: "Previsualizar archivo", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("dos puestos");
    await expect(page.getByRole("alert")).toContainText("Babies, fila 5");
    await expect(page.getByRole("alert")).toContainText("Kinder, fila 5");
    expect(imports).toBe(0);
    await file.setInputFiles(fileURLToPath(new URL("./fixtures/clean.xlsx", import.meta.url)));
    await page.getByRole("button", { name: "Previsualizar archivo", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Revisa antes de importar." })).toBeVisible();
    await expect(page.getByText("Persona Inactiva", { exact: false })).toBeVisible();
    expect(imports).toBe(0);
    await page.getByRole("button", { name: "Confirmar importación", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.locator(".area-card")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Cambiar Maestro/a en Babies: Persona Ejemplo", exact: true })).toBeVisible();
    expect(imports).toBe(1);
  } finally { await mock.close(); }
});
test("cerrar sesión elimina la agenda de la pantalla y no reaparece al recargar", async ({ context, page }) => {
  const mock = await backend();
  try {
    await mock.attach(context);
    await page.goto("/");
    await expect(page.getByText("Ana Ejemplo", { exact: true })).toBeVisible();
    await page.locator('button[data-action="logout"]:visible').first().click();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(page.getByText("Ana Ejemplo", { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(page.getByText("Ana Ejemplo", { exact: true })).toHaveCount(0);
  } finally { await mock.close(); }
});
test("un acceso revocado borra la lectura anterior en lugar de tratarlo como un error offline", async ({ context, page }) => {
  const mock = await backend();
  try {
    await mock.attach(context, "coordinator");
    await page.goto("/");
    await expect(page.getByText("Ana Ejemplo", { exact: true })).toBeVisible();
    await mock.db.exec("update public.access_grants set active=false where role='coordinator'");
    await page.getByRole("button", { name: "Actualizar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Revisemos tu acceso." })).toBeVisible();
    await expect(page.getByText("Ana Ejemplo", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("alert")).toContainText("no tiene acceso activo");
  } finally { await mock.close(); }
});
test("imprime el día en cinco tablas cruzadas y conserva la búsqueda al imprimir todos", async ({ context, page }, info) => {
  const mock = await backend();
  try {
    await mock.db.exec("select public.generate_schedule('2099-01-11','2099-01-11')");
    await mock.db.query(`select public.write_assignment((select a.id from public.assignments a
      join public.positions p on p.id=a.position_id join public.occurrences o on o.id=a.occurrence_id
      where a.area_id='babies' and p.name='Maestro/a' and o.service_date='2099-01-04' and o.start_time='10:40'),$1,'Preparar materiales',1)`, [people.beto]);
    await mock.attach(context);
    await interceptPrint(page);
    await page.goto("/");
    await expect(page.locator(".area-card")).toHaveCount(5);
    await requestPrint(page);
    await expect(page.locator("html")).toHaveAttribute("data-print-requested", "1");
    const root = page.locator("#print-roles");
    await expect(root.locator(".print-sheet")).toHaveCount(1);
    await expect(root.locator(".print-sheet")).toHaveAttribute("data-date", "2099-01-04");
    await expect(root.getByRole("table")).toHaveCount(5);
    const babies = root.getByRole("table", { name: "Babies", exact: true });
    await expect(babies.locator("thead th")).toHaveText(["Puesto", /09:00/, /10:40/, /12:25/]);
    const teacher = babies.getByRole("row", { name: /Maestro\/a/ });
    await expect(teacher.locator("td").nth(0)).toHaveText("Ana Ejemplo");
    await expect(teacher.locator("td").nth(1)).toContainText("Beto Ejemplo");
    await expect(teacher.locator("td").nth(1)).toContainText("Preparar materiales");
    await expect(teacher.locator("td").nth(2)).toHaveText("Sin asignar");
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: info.outputPath("rol-impresion.png"), fullPage: true });
    const pdf = await page.pdf({ path: info.outputPath("rol-dia.pdf"), preferCSSPageSize: true, printBackground: true });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    await page.emulateMedia({ media: null });
    await expect(root).toBeEmpty();

    await page.getByLabel("Filtrar por área", { exact: true }).selectOption("babies");
    await page.getByRole("searchbox", { name: "Buscar voluntario" }).fill("béto");
    await requestPrint(page, "all");
    await expect(root.locator(".print-sheet")).toHaveCount(1);
    await expect(root.getByRole("table")).toHaveCount(1);
    await expect(root).toContainText("Beto Ejemplo");
    await expect(root).not.toContainText("Ana Ejemplo");
    await expect(root.getByRole("table").locator("tbody tr")).toHaveCount(1);
    const filtered = await page.pdf({ preferCSSPageSize: true });
    expect(filtered.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);

    await page.getByRole("searchbox", { name: "Buscar voluntario" }).fill("Sin coincidencias");
    await requestPrint(page, "all");
    await expect(page.getByRole("alert")).toContainText("No hay puestos que coincidan");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-print-requested", "2");
    await expect(root).toBeEmpty();
  } finally { await mock.close(); }
});
test("imprime todos los días en hojas separadas respetando área y pendientes", async ({ context, page }, info) => {
  const mock = await backend();
  try {
    await mock.db.exec("select public.generate_schedule('2099-01-11','2099-01-11')");
    await mock.db.query(`select public.write_assignment((select a.id from public.assignments a
      join public.positions p on p.id=a.position_id join public.occurrences o on o.id=a.occurrence_id
      where a.area_id='kinder' and p.name='Maestro/a' and o.service_date='2099-01-04' and o.start_time='09:00'),$1,'',1)`, [people.clara]);
    await mock.attach(context);
    await interceptPrint(page);
    await page.goto("/");
    await page.getByLabel("Filtrar por área", { exact: true }).selectOption("kinder");
    await page.locator('[data-action="pending"]').click();
    await requestPrint(page, "all");
    const root = page.locator("#print-roles");
    await expect(root.locator(".print-sheet")).toHaveCount(2);
    await expect(root.locator(".print-sheet").nth(0)).toHaveAttribute("data-date", "2099-01-04");
    await expect(root.locator(".print-sheet").nth(1)).toHaveAttribute("data-date", "2099-01-11");
    await expect(root.getByRole("table", { name: "Kinder", exact: true })).toHaveCount(2);
    await expect(root.getByRole("table")).toHaveCount(2);
    await expect(root).not.toContainText("Clara Ejemplo");
    await expect(root.getByRole("row", { name: /Maestro\/a/ }).first().locator("td").first()).toHaveText("—");
    await expect(root).toContainText("Solo pendientes");
    const pdf = await page.pdf({ path: info.outputPath("roles-por-dia.pdf"), preferCSSPageSize: true, printBackground: true });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(2);
  } finally { await mock.close(); }
});
test("ajusta notas extensas a una hoja y permite imprimir en modo de consulta sin retener datos al salir", async ({ context, page }, info) => {
  const mock = await backend();
  try {
    await mock.db.query("update public.assignments set note=$1", ["Preparar material para el equipo. ".repeat(9).slice(0, 300)]);
    await mock.attach(context, "volunteer");
    await interceptPrint(page);
    await page.goto("/");
    await expect(page.locator(".area-card")).toHaveCount(5);
    await requestPrint(page);
    const root = page.locator("#print-roles");
    await expect(root.getByRole("table")).toHaveCount(5);
    expect(await root.locator(".print-day-content").evaluate((content: HTMLElement) => Number(content.style.zoom))).toBeLessThan(.9);
    expect(await root.locator(".print-sheet").evaluate((sheet) => sheet.querySelector(".print-day-content")!.getBoundingClientRect().height <= sheet.getBoundingClientRect().height)).toBe(true);
    const pdf = await page.pdf({ path: info.outputPath("rol-notas-a4.pdf"), format: "A4", preferCSSPageSize: false, printBackground: true });
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    await requestPrint(page);
    await expect(root).toContainText("Ana Ejemplo");
    await page.locator('button[data-action="logout"]:visible').first().click();
    await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeVisible();
    await expect(root).toBeEmpty();
  } finally { await mock.close(); }
});
