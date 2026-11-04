import { beforeAll, afterAll, beforeEach, afterEach, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { snapshotSchema } from "../src/schema";

let db: PGlite;
const admin = "11111111-1111-4111-8111-111111111111";
const coordinator = "22222222-2222-4222-8222-222222222222";
const viewer = "33333333-3333-4333-8333-333333333333";
const outsider = "44444444-4444-4444-8444-444444444444";
const ana = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const bea = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function rpc<T = unknown>(actor: string, name: string, args: unknown[] = []) {
  await db.exec("savepoint rpc_attempt");
  try {
    await db.exec("set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
    const result = await db.query<{ value: T }>(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`, args);
    await db.exec("reset role; release savepoint rpc_attempt");
    return result.rows[0].value;
  } catch (error) {
    await db.exec("rollback to savepoint rpc_attempt; reset role; release savepoint rpc_attempt");
    throw error;
  }
}
async function snapshot(actor = admin) {
  return snapshotSchema.parse(await rpc(actor, "read_workspace"));
}
async function generate() { return rpc<number>(admin, "generate_schedule", ["2099-01-04", "2099-01-04"]); }

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    create table auth.identities(user_id uuid references auth.users, provider text, identity_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid;
    $$;
    grant usage on schema auth to authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/202611030001_workspace.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../supabase/migrations/202611030002_import_safe_delete.sql", import.meta.url), "utf8"));
});
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("begin");
  for (const [id, email] of [[admin, "admin@example.test"], [coordinator, "coord@example.test"], [viewer, "viewer@example.test"], [outsider, "outside@example.test"]]) {
    await db.query("insert into auth.users values($1)", [id]);
    await db.query("insert into auth.identities values($1,'google',$2)", [id, JSON.stringify({ email, email_verified: true })]);
  }
  await db.query("insert into public.volunteers(id,name,area_ids) values($1,'Ana Ejemplo',array['kinder','babies']),($2,'Bea Ejemplo',array['kinder'])", [ana, bea]);
  await db.exec(`
    insert into public.access_grants(email,role,area_ids) values
      ('admin@example.test','admin','{}'),('coord@example.test','coordinator',array['kinder']),('viewer@example.test','volunteer','{}');
  `);
  await rpc(admin, "enter_workspace");
  await rpc(coordinator, "enter_workspace");
  await rpc(viewer, "enter_workspace");
});
afterEach(async () => { await db.exec("rollback"); });

describe("PostgreSQL: acceso y persistencia", () => {
  it("rechaza Google sin autorización y no confía en un correo no verificado", async () => {
    await expect(rpc(outsider, "enter_workspace")).rejects.toThrow("no está autorizado");
    await db.query("update auth.identities set identity_data=jsonb_set(identity_data,'{email_verified}','false') where user_id=$1", [admin]);
    await expect(rpc(admin, "enter_workspace")).rejects.toThrow("correo verificado");
    await expect(rpc(outsider, "read_workspace")).rejects.toThrow("no tiene acceso");
  });
  it("solo administración recibe correos de acceso y los datos cumplen el contrato tipado", async () => {
    expect((await snapshot()).grants).toHaveLength(3);
    expect((await snapshot(viewer)).grants).toEqual([]);
    expect((await snapshot()).assignments).toEqual([]);
  });
  it("RLS impide leer datos a un extraño y no hay escritura directa", async () => {
    await db.exec("savepoint permission_check; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [outsider]);
    expect((await db.query("select * from public.volunteers")).rows).toEqual([]);
    await expect(db.query("insert into public.volunteers(name,area_ids) values('Intruso',array['kinder'])")).rejects.toThrow("permission denied");
    await db.exec("rollback to savepoint permission_check; reset role; release savepoint permission_check");
  });
  it("un coordinador no puede invitar usuarios ni editar otras áreas", async () => {
    await generate();
    const state = await snapshot();
    const baby = state.assignments.find((a) => a.areaId === "babies")!;
    const kinder = state.assignments.find((a) => a.areaId === "kinder")!;
    await expect(rpc(coordinator, "write_assignment", [baby.id, ana, "", 1])).rejects.toThrow("permiso");
    await expect(rpc(viewer, "write_assignment", [kinder.id, ana, "", 1])).rejects.toThrow("permiso");
    await expect(rpc(coordinator, "save_grant", [null, "new@example.test", "admin", [], null, true, 0])).rejects.toThrow("administración");
    await rpc(coordinator, "write_assignment", [kinder.id, ana, "Llevar material", 1]);
    expect((await snapshot()).assignments.find((a) => a.id === kinder.id)?.note).toBe("Llevar material");
  });
  it("el servidor impide duplicados incluso entre áreas y detecta versiones antiguas", async () => {
    await generate();
    const state = await snapshot();
    const kinder = state.assignments.find((a) => a.areaId === "kinder")!;
    const baby = state.assignments.find((a) => a.areaId === "babies" && a.occurrenceId === kinder.occurrenceId)!;
    await rpc(admin, "write_assignment", [kinder.id, ana, "", 1]);
    await expect(rpc(admin, "write_assignment", [baby.id, ana, "", 1])).rejects.toThrow("otro puesto");
    await expect(rpc(admin, "write_assignment", [kinder.id, bea, "", 1])).rejects.toThrow("cambió");
    await expect(rpc(admin, "write_assignment", [kinder.id, bea, "", null])).rejects.toThrow("cambió");
    const current = await snapshot();
    expect(current.assignments.find((a) => a.id === kinder.id)?.volunteerId).toBe(ana);
    expect(current.activity[0].actor).toContain("admin");
  });
  it("valida elegibilidad e impide retirar áreas con participaciones futuras", async () => {
    await generate();
    const baby = (await snapshot()).assignments.find((a) => a.areaId === "babies")!;
    await expect(rpc(admin, "write_assignment", [baby.id, bea, "", 1])).rejects.toThrow("pertenezca");
    await rpc(admin, "write_assignment", [baby.id, ana, "", 1]);
    await expect(rpc(admin, "save_volunteer", [ana, "Ana Ejemplo", ["kinder"], true, "", 1])).rejects.toThrow("Libera primero");
    await rpc(admin, "write_assignment", [baby.id, null, "", 2]);
    await expect(rpc(admin, "save_volunteer", [ana, "Ana Ejemplo", ["kinder"], true, "", 1])).resolves.toBe(ana);
  });
  it("genera periodos sin borrar personas, notas ni versiones", async () => {
    expect(await generate()).toBe(42);
    const slot = (await snapshot()).assignments.find((a) => a.areaId === "kinder")!;
    await rpc(admin, "write_assignment", [slot.id, ana, "Conservar", 1]);
    expect(await generate()).toBe(0);
    expect((await snapshot()).assignments.find((a) => a.id === slot.id)).toMatchObject({ volunteerId: ana, note: "Conservar", version: 2 });
  });
  it("mantiene el orden de los puestos independientemente de sus identificadores", async () => {
    await db.exec(`update public.positions set id=(case name
      when 'Maestro/a' then 'ffffffff-ffff-4fff-8fff-ffffffffffff'
      when 'Ayuda' then 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
      else 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' end)::uuid where area_id='babies'`);
    await generate();
    const state = await snapshot();
    const occurrence = state.occurrences[0].id;
    expect(state.assignments.filter((a) => a.areaId === "babies" && a.occurrenceId === occurrence)
      .map((a) => state.positions.find((p) => p.id === a.positionId)?.name)).toEqual(["Maestro/a", "Ayuda", "Asistente 1"]);
  });
  it("la generación respeta los sábados activos, no solo domingos", async () => {
    await rpc(admin, "save_service", [null, "Sábado", 6, "17:00", true, 0]);
    expect(await rpc(admin, "generate_schedule", ["2099-01-03", "2099-01-04"])).toBe(56);
    const state = await snapshot();
    expect(state.occurrences.map((o) => o.date)).toContain("2099-01-03");
    await expect(rpc(admin, "generate_schedule", ["2099-01-01", "2100-01-01"])).rejects.toThrow("periodo");
  });
  it("conserva inactivos sin área y no genera puestos nuevos en servicios desactivados", async () => {
    await rpc(admin, "save_volunteer", [null, "Sin área", [], false, "", 0]);
    expect((await snapshot()).volunteers.find((v) => v.name === "Sin área")?.areas).toEqual([]);
    await generate();
    const state = await snapshot();
    for (const service of state.services) await rpc(admin, "save_service", [service.id, service.name, service.day, service.time, false, service.version]);
    await rpc(admin, "save_position", [null, "kinder", "Puesto nuevo", true, 0]);
    expect(await generate()).toBe(0);
    expect((await snapshot()).assignments).toHaveLength(42);
  });
  it("no permite eliminar el último administrador y la revocación se aplica en el servidor", async () => {
    const state = await snapshot();
    const grant = state.grants.find((g) => g.role === "admin")!;
    await expect(rpc(admin, "save_grant", [grant.id, grant.email, "volunteer", [], null, true, 1])).rejects.toThrow("al menos un administrador");
    const target = state.grants.find((g) => g.role === "coordinator")!;
    await rpc(admin, "save_grant", [target.id, target.email, target.role, target.areas, null, false, 1]);
    await expect(rpc(coordinator, "get_revision")).rejects.toThrow("no tiene acceso");
  });
  it("solo permite zonas horarias reales y conserva los servicios ya generados", async () => {
    await expect(rpc(admin, "save_settings", ["Equipo", "Inexistente/Zona", 1])).rejects.toThrow("zona horaria");
    await generate();
    const initial = await snapshot();
    const service = initial.services[0];
    await rpc(admin, "save_service", [service.id, "Nuevo nombre", 0, "08:00", false, 1]);
    const current = await snapshot();
    expect(current.occurrences).toEqual(initial.occurrences);
  });
  it("importa el libro en una transacción y no permite sobrescribir una agenda", async () => {
    await db.exec("delete from public.volunteers");
    const payload = importPayload();
    expect(await rpc(admin, "import_workbook", [JSON.stringify(payload)])).toBe(1);
    const current = await snapshot();
    expect(current.volunteers.map((v) => v.name)).toEqual(["Persona Importada"]);
    expect(current.services.map((s) => s.name)).toEqual(["Servicio"]);
    expect(current.positions.map((p) => p.name)).toEqual(["Maestro/a"]);
    expect(current.assignments[0].note).toBe("Nota importada");
    expect(current.volunteers[0].id).toBe(current.assignments[0].volunteerId);
    await expect(rpc(admin, "import_workbook", [JSON.stringify(payload)])).rejects.toThrow("No sobrescribe");
    expect((await snapshot()).assignments).toEqual(current.assignments);
  });
  it("un fallo de importación revierte incluso plantillas y voluntarios ya insertados", async () => {
    await db.exec("delete from public.volunteers");
    const before = await snapshot();
    const payload = importPayload();
    payload.assignments.push({ ...payload.assignments[0] });
    await expect(rpc(admin, "import_workbook", [JSON.stringify(payload)])).rejects.toThrow("duplicate key");
    const after = await snapshot();
    expect(after.volunteers).toEqual([]);
    expect(after.services).toEqual(before.services);
    expect(after.positions).toEqual(before.positions);
    expect(after.revision).toBe(before.revision);
  });
});

function importPayload() {
  return {
    format: "area-excel-v1",
    volunteers: [{ ref: "one", name: "Persona Importada", active: true, areas: ["kinder"], note: "" }],
    services: [{ ref: "service", name: "Servicio", day: 0, time: "09:00", active: true }],
    positions: [{ ref: "position", areaId: "kinder", name: "Maestro/a", active: true }],
    occurrences: [{ ref: "occurrence", serviceRef: "service", date: "2099-01-04", time: "09:00", name: "Servicio" }],
    assignments: [{ occurrenceRef: "occurrence", areaId: "kinder", positionRef: "position", volunteerRef: "one", note: "Nota importada" }]
  };
}
