import { z } from "zod";

export const areaIds = ["babies", "kinder", "kids", "preteens", "checkin"] as const;
export const areaId = z.enum(areaIds);
export const role = z.enum(["admin", "coordinator", "volunteer"]);
export const date = z.iso.date();
export const time = z.string().regex(/^\d{2}:\d{2}$/);
export const volunteerSchema = z.object({
  id: z.uuid(), name: z.string().min(1).max(80), active: z.boolean(),
  areas: z.array(areaId), note: z.string(), version: z.number().int()
});
export const serviceSchema = z.object({
  id: z.uuid(), name: z.string(), day: z.number().int().min(0).max(6),
  time, active: z.boolean(), version: z.number().int()
});
export const positionSchema = z.object({
  id: z.uuid(), areaId, name: z.string(), active: z.boolean(), version: z.number().int()
});
export const grantSchema = z.object({
  id: z.uuid(), email: z.email(), role, areas: z.array(areaId),
  volunteerId: z.uuid().nullable(), active: z.boolean(), version: z.number().int()
});
export const snapshotSchema = z.object({
  revision: z.number().int(),
  actor: z.object({ id: z.uuid(), role, areas: z.array(areaId), volunteerId: z.uuid().nullable() }),
  settings: z.object({ name: z.string(), timezone: z.string(), version: z.number().int() }),
  volunteers: z.array(volunteerSchema),
  services: z.array(serviceSchema),
  positions: z.array(positionSchema),
  occurrences: z.array(z.object({ id: z.uuid(), serviceId: z.uuid(), date, time, name: z.string() })),
  assignments: z.array(z.object({
    id: z.uuid(), occurrenceId: z.uuid(), areaId, positionId: z.uuid(),
    volunteerId: z.uuid().nullable(), note: z.string(), version: z.number().int()
  })),
  activity: z.array(z.object({ id: z.string(), at: z.string(), actor: z.string(), text: z.string(), detail: z.string() })),
  grants: z.array(grantSchema)
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export type Volunteer = Snapshot["volunteers"][number];
export type Assignment = Snapshot["assignments"][number];
export type AreaId = z.infer<typeof areaId>;
export type AccessRole = z.infer<typeof role>;
export const areas: { id: AreaId; name: string; color: string; symbol: string }[] = [
  { id: "babies", name: "Babies", color: "peach", symbol: "✿" },
  { id: "kinder", name: "Kinder", color: "yellow", symbol: "☀" },
  { id: "kids", name: "Kids", color: "sage", symbol: "✧" },
  { id: "preteens", name: "Preteens", color: "lavender", symbol: "☆" },
  { id: "checkin", name: "Check-in", color: "blue", symbol: "✓" }
];
export const roleNames: Record<AccessRole, string> = { admin: "Administrador", coordinator: "Coordinador", volunteer: "Voluntario" };
export const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
export function canEdit(snapshot: Snapshot, area: AreaId) {
  return snapshot.actor.role === "admin" || (snapshot.actor.role === "coordinator" && snapshot.actor.areas.includes(area));
}
export function visibleAssignments(snapshot: Snapshot) {
  const active = new Set(snapshot.positions.filter((p) => p.active).map((p) => p.id));
  return snapshot.assignments.filter((a) => active.has(a.positionId) || a.volunteerId !== null);
}
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
export function normalized(value: string) {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
export function today(timezone: string) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function quarterEnd(start: string) {
  const d = new Date(`${start}T12:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 3);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
