import { z } from "zod";
import { areaId, areas, date, time, normalized, dayNames } from "./schema";

export const workbookSchema = z.object({
  format: z.literal("area-excel-v1"),
  volunteers: z.array(z.object({
    ref: z.string(), name: z.string().min(1).max(80), active: z.boolean(),
    areas: z.array(areaId), note: z.string().max(300)
  }).refine((v) => !v.active || v.areas.length > 0, "Una persona activa necesita al menos un área.")).max(2000),
  services: z.array(z.object({ ref: z.string(), name: z.string().min(1).max(60), day: z.number().int().min(0).max(6), time, active: z.boolean() })).min(1),
  positions: z.array(z.object({ ref: z.string(), areaId, name: z.string().min(1).max(60), active: z.boolean() })).min(1),
  occurrences: z.array(z.object({ ref: z.string(), serviceRef: z.string(), name: z.string(), date, time })),
  assignments: z.array(z.object({
    occurrenceRef: z.string(), areaId, positionRef: z.string(), volunteerRef: z.string().nullable(), note: z.string().max(300)
  })).max(10000)
});
export type WorkbookPayload = z.infer<typeof workbookSchema>;
type Sheet = { sheet: string; data: unknown[][] };
const text = (value: unknown) => value == null ? "" : String(value).trim();
function flag(value: unknown, label: string) {
  if (typeof value === "boolean") return value;
  const valueText = normalized(text(value));
  if (["si", "yes", "true", "1"].includes(valueText)) return true;
  if (["", "no", "false", "0"].includes(valueText)) return false;
  throw new Error(`${label}: usa Sí o No.`);
}
export function excelDate(value: unknown) {
  let result: string;
  if (value instanceof Date) result = value.toISOString().slice(0, 10);
  else if (typeof value === "number") result = new Date(Math.round((value - 25569) * 86400000)).toISOString().slice(0, 10);
  else {
    const raw = normalized(text(value));
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) result = raw;
    else {
      const match = raw.match(/^(\d{4})\s*-\s*([a-z]+)\s*-\s*(\d{1,2})/);
      const months = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      if (!match || !months.includes(match[2])) throw new Error(`Fecha no reconocida: ${text(value)}.`);
      result = `${match[1]}-${String(months.indexOf(match[2]) + 1).padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    }
  }
  return date.parse(result);
}
export function excelTime(value: unknown) {
  if (value instanceof Date) return `${String(value.getUTCHours()).padStart(2, "0")}:${String(value.getUTCMinutes()).padStart(2, "0")}`;
  if (typeof value === "number") {
    const minutes = Math.round(((value % 1) + 1) % 1 * 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  const match = text(value).match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (!match) throw new Error(`Hora no reconocida: ${text(value)}.`);
  let hours = Number(match[1]);
  if (match[3]) hours = hours % 12 + (match[3].toUpperCase() === "PM" ? 12 : 0);
  if (hours > 23 || Number(match[2]) > 59) throw new Error("Hora fuera de rango.");
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}
export function parseSheets(sheets: Sheet[]): WorkbookPayload {
  const sheet = (name: string) => {
    const found = sheets.find((s) => normalized(s.sheet) === normalized(name));
    if (!found) throw new Error(`Falta la hoja “${name}”.`);
    if (found.data.length > 2000) throw new Error(`La hoja “${name}” supera 2.000 filas.`);
    return found.data;
  };
  const v = sheet("Voluntarios");
  const result: WorkbookPayload = { format: "area-excel-v1", volunteers: [], services: [], positions: [], occurrences: [], assignments: [] };
  const byName = new Map<string, string>();
  for (let r = 4; r < v.length; r++) {
    const name = text(v[r]?.[1]);
    if (!name) continue;
    const ref = `person-${r}`;
    const key = normalized(name);
    if (byName.has(key)) throw new Error(`Voluntarios, fila ${r + 1}: nombre duplicado. Diferencia a las personas con el mismo nombre.`);
    const selectedAreas = areas.filter((a, i) => flag(v[r]?.[i + 5], `Voluntarios ${r + 1}, ${a.name}`)).map((a) => a.id);
    const active = flag(v[r]?.[0], `Voluntarios, fila ${r + 1}`);
    if (active && !selectedAreas.length) throw new Error(`Voluntarios, fila ${r + 1}: selecciona al menos un área para ${name} o márcalo como inactivo.`);
    byName.set(key, ref);
    result.volunteers.push({ ref, name, active, areas: selectedAreas, note: text(v[r]?.[4]) });
  }
  for (let r = 4; r < 10; r++) {
    const dayLabel = text(v[r]?.[11]);
    if (!dayLabel) {
      if (flag(v[r]?.[13], `Servicio, fila ${r + 1}`)) throw new Error(`Servicio, fila ${r + 1}: falta el día.`);
      continue;
    }
    const day = dayNames.findIndex((d) => normalized(d) === normalized(dayLabel));
    if (day < 0) throw new Error(`Servicio, fila ${r + 1}: día no reconocido.`);
    const startTime = excelTime(v[r]?.[12]);
    result.services.push({ ref: `service-${r}`, name: text(v[r]?.[14]) || `${dayLabel} ${startTime}`, day, time: startTime, active: flag(v[r]?.[13], `Servicio, fila ${r + 1}`) });
  }
  for (const area of areas) {
    const first = area.id === "checkin" ? 25 : 13;
    for (let r = first; r < first + 10; r++) {
      const name = text(v[r]?.[11]);
      if (!name) continue;
      result.positions.push({ ref: `${area.id}|${normalized(name)}`, areaId: area.id, name, active: flag(v[r]?.[12], `Puesto, fila ${r + 1}`) });
    }
  }
  const occurrences = new Set<string>();
  const occupied = new Map<string, string>();
  for (const area of areas) {
    const rows = sheet(`Asignaciones ${area.id === "checkin" ? "Checkin" : area.name}`);
    const headings = rows[3] ?? [];
    const noteIndex = headings.findIndex((h) => normalized(text(h)) === "notas");
    const lastColumn = noteIndex >= 0 ? noteIndex : headings.length;
    for (let r = 4; r < rows.length; r++) {
      const row = rows[r];
      if (!text(row?.[0])) {
        if (row?.slice(1).some((cell) => text(cell))) throw new Error(`${area.name}, fila ${r + 1}: hay información sin fecha.`);
        continue;
      }
      const dateValue = excelDate(row[0]);
      const startTime = excelTime(row[1]);
      const name = text(row[2]);
      const day = new Date(`${dateValue}T12:00:00Z`).getUTCDay();
      const service = result.services.find((s) => s.day === day && s.time === startTime && normalized(s.name) === normalized(name));
      if (!service) throw new Error(`${area.name}, fila ${r + 1}: el servicio no coincide con la configuración de Voluntarios.`);
      const occurrenceRef = `${dateValue}|${startTime}`;
      if (!occurrences.has(occurrenceRef)) {
        occurrences.add(occurrenceRef);
        result.occurrences.push({ ref: occurrenceRef, serviceRef: service.ref, date: dateValue, time: startTime, name });
      } else if (result.occurrences.find((o) => o.ref === occurrenceRef)?.serviceRef !== service.ref) {
        throw new Error(`Hay dos servicios diferentes el ${dateValue} a las ${startTime}.`);
      }
      for (let c = 3; c < lastColumn; c++) {
        const roleName = text(headings[c]);
        if (!roleName) continue;
        const positionRef = `${area.id}|${normalized(roleName)}`;
        if (!result.positions.some((p) => p.ref === positionRef)) throw new Error(`${area.name}: el puesto “${roleName}” no está en la configuración.`);
        const assignedName = text(row[c]);
        const volunteerRef = assignedName ? byName.get(normalized(assignedName)) : null;
        if (assignedName && !volunteerRef) throw new Error(`${area.name}, fila ${r + 1}: “${assignedName}” no está en la lista de voluntarios.`);
        const volunteer = result.volunteers.find((p) => p.ref === volunteerRef);
        if (volunteer && !volunteer.areas.includes(area.id)) throw new Error(`${area.name}, fila ${r + 1}: ${volunteer.name} no pertenece al área.`);
        const key = `${occurrenceRef}|${volunteerRef}`;
        const location = `${area.name}, fila ${r + 1} (${roleName})`;
        if (volunteerRef && occupied.has(key)) throw new Error(`${dateValue}, ${startTime}: ${assignedName} ocupa dos puestos en el mismo servicio: ${occupied.get(key)} y ${location}. Corrige una copia del Excel antes de importar.`);
        if (volunteerRef) occupied.set(key, location);
        result.assignments.push({ occurrenceRef, areaId: area.id, positionRef, volunteerRef: volunteerRef ?? null, note: noteIndex >= 0 ? text(row[noteIndex]) : "" });
      }
    }
  }
  return workbookSchema.parse(result);
}
export async function readWorkbook(file: File) {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > 5_000_000) throw new Error("Selecciona un archivo .xlsx de hasta 5 MB.");
  const { default: readXlsx } = await import("read-excel-file/browser");
  return parseSheets(await readXlsx(file));
}
