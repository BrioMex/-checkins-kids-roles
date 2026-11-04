import { areas, dayNames, escapeHtml as e, quarterEnd, roleNames, today, type Snapshot } from "./schema";
import { prettyDate, icon } from "./view";
import type { WorkbookPayload } from "./importer";

export type DialogKind = "assignment" | "volunteer" | "service" | "position" | "grant" | "settings" | "generate" | "import";
export type EditContext = { kind: DialogKind; id: string | null; version: number };
function field(label: string, name: string, value: string, options = "") {
  return `<label class="form-field" for="field-${name}">${label}</label><input class="form-control" id="field-${name}" name="${name}" value="${e(value)}" ${options}>`;
}
function select(label: string, name: string, options: string, extra = "") {
  return `<label class="form-field" for="field-${name}">${label}</label><select class="form-control" id="field-${name}" name="${name}" ${extra}>${options}</select>`;
}
function checks(selected: string[]) {
  return `<fieldset class="area-checkboxes"><legend>Áreas</legend>${areas.map((a) => `<label><input type="checkbox" name="areas" value="${a.id}" ${selected.includes(a.id) ? "checked" : ""}>${a.name}</label>`).join("")}</fieldset>`;
}
const active = (value: boolean) => `<label class="active-checkbox"><input type="checkbox" name="active" ${value ? "checked" : ""}> Activo</label>`;
const note = (value: string, label = "Nota para el equipo (opcional)") => `<label class="form-field" for="field-note">${label}</label><textarea class="form-control" id="field-note" name="note" rows="3" maxlength="300">${e(value)}</textarea>`;
const option = (value: string, label: string, selected: boolean) => `<option value="${e(value)}" ${selected ? "selected" : ""}>${e(label)}</option>`;
export function dialogView(s: Snapshot, edit: EditContext, payload: WorkbookPayload | null = null) {
  let title = "", description = "", fields = "", submit = "Guardar cambios";
  if (edit.kind === "assignment") {
    const a = s.assignments.find((v) => v.id === edit.id);
    if (!a) throw new Error("La asignación ya no existe.");
    const occurrence = s.occurrences.find((o) => o.id === a.occurrenceId)!;
    title = "Un lugar para sumar.";
    description = `${areas.find((v) => v.id === a.areaId)?.name} · ${s.positions.find((p) => p.id === a.positionId)?.name} · ${prettyDate(occurrence.date)} · ${occurrence.name} ${occurrence.time}`;
    fields = select("Voluntario", "volunteerId", option("", "Dejar sin asignar", !a.volunteerId) +
      s.volunteers.filter((v) => v.id === a.volunteerId || (v.active && v.areas.includes(a.areaId))).map((v) => {
        const busy = s.assignments.some((other) => other.id !== a.id && other.occurrenceId === a.occurrenceId && other.volunteerId === v.id);
        return `<option value="${v.id}" ${a.volunteerId === v.id ? "selected" : ""} ${busy ? "disabled" : ""}>${e(v.name)}${!v.active ? " (inactivo; asignación histórica)" : ""}${busy ? " (ya tiene puesto)" : ""}</option>`;
      }).join("")) + '<p class="field-help">Solo personas elegibles del área. El servidor impide puestos duplicados.</p>' + note(a.note);
  } else if (edit.kind === "volunteer") {
    const v = s.volunteers.find((p) => p.id === edit.id);
    title = v ? "Una persona del equipo." : "Una persona que suma.";
    description = "Las notas son visibles para los miembros autorizados. No registres datos sensibles.";
    fields = field("Nombre completo", "name", v?.name ?? "", 'required maxlength="80" autocomplete="off"') + checks(v?.areas ?? []) + active(v?.active ?? true) + note(v?.note ?? "", "Disponibilidad o nota del equipo");
  } else if (edit.kind === "service") {
    const v = s.services.find((p) => p.id === edit.id);
    title = "Un momento para servir.";
    description = "Los cambios afectan a las fechas nuevas; no modifican las que ya se generaron.";
    fields = field("Nombre", "name", v?.name ?? "", 'required maxlength="60"') +
      select("Día de la semana", "day", dayNames.map((day, i) => option(String(i), day, (v?.day ?? 0) === i)).join("")) +
      field("Hora local", "time", v?.time ?? "09:00", 'type="time" required') + active(v?.active ?? true);
  } else if (edit.kind === "position") {
    const v = s.positions.find((p) => p.id === edit.id);
    title = "Cada puesto cuenta.";
    description = "Desactivarlo no elimina puestos o personas ya asignados. Regenera el periodo para añadir los nuevos.";
    fields = select("Área", "areaId", areas.map((a) => option(a.id, a.name, (v?.areaId ?? "babies") === a.id)).join(""), v ? "disabled" : "") +
      field("Nombre del puesto", "name", v?.name ?? "", 'required maxlength="60"') + active(v?.active ?? true);
  } else if (edit.kind === "grant") {
    const v = s.grants.find((p) => p.id === edit.id);
    title = "Un acceso, su responsabilidad.";
    description = "Escribe el correo exacto de Google. Autorizar no envía correos: comparte después la dirección de la app.";
    fields = field("Correo de Google", "email", v?.email ?? "", `type="email" required maxlength="254" ${v ? "readonly" : ""}`) +
      select("Perfil", "role", (Object.keys(roleNames) as (keyof typeof roleNames)[]).map((role) => option(role, roleNames[role], (v?.role ?? "volunteer") === role)).join("")) +
      `<div id="coordinator-areas" ${v?.role === "coordinator" ? "" : "hidden"}>${checks(v?.areas ?? [])}</div>` +
      select("Vincular con un voluntario (para Mi participación)", "volunteerId", option("", "Sin vínculo", !v?.volunteerId) + s.volunteers.map((p) => option(p.id, p.name, v?.volunteerId === p.id)).join("")) +
      active(v?.active ?? true) + '<p class="field-help">Desmarcar Activo revoca la lectura y edición en el servidor. La pantalla de una sesión abierta se limpia en la siguiente comprobación, al volver a la app o como máximo tras 45 segundos con la pestaña visible.</p>';
  } else if (edit.kind === "settings") {
    title = "Tu comunidad, bien ubicada.";
    description = "Verifica la zona horaria antes de generar fechas. Se usa para la fecha actual y el historial.";
    fields = field("Nombre de la comunidad", "name", s.settings.name, 'required maxlength="80"') +
      field("Zona horaria IANA", "timezone", s.settings.timezone, 'required placeholder="America/Mexico_City"') +
      '<p class="field-help">Ejemplos: America/Mexico_City, America/Tijuana, America/Monterrey. Usa la que corresponda a tu comunidad.</p>';
  } else if (edit.kind === "generate") {
    title = "Preparemos el siguiente periodo.";
    description = "Solo añade fechas y puestos faltantes de las plantillas activas. No borra asignaciones ni reparte personas automáticamente.";
    const start = today(s.settings.timezone);
    fields = field("Desde", "start", start, 'type="date" required') + field("Hasta (incluido)", "end", quarterEnd(start), 'type="date" required') +
      '<p class="field-help">Máximo 121 días. Si vas a importar tu Excel, hazlo antes de generar el primer periodo.</p>';
    submit = "Generar sin borrar";
  } else {
    title = payload ? "Revisa antes de importar." : "Tu Excel, un nuevo comienzo.";
    description = "Importación inicial, completa y transaccional. No ejecuta el Office Script. No mezcla ni sobrescribe una agenda existente.";
    if (payload) {
      fields = `<div class="import-summary"><div><strong>${payload.volunteers.length}</strong><span>voluntarios</span></div><div><strong>${payload.occurrences.length}</strong><span>servicios con fecha</span></div><div><strong>${payload.assignments.filter((a) => a.volunteerRef).length}</strong><span>puestos cubiertos</span></div></div>
        <p class="field-help">${payload.assignments.length} puestos en total; ${payload.assignments.filter((a) => !a.volunteerRef).length} sin asignar. Se reemplazarán las plantillas iniciales vacías por las del libro.</p>
        <h3 class="preview-title">Muestra del directorio</h3><div class="import-sample">${payload.volunteers.slice(0, 10).map((v) => `<p>${e(v.name)} · ${v.areas.map((id) => areas.find((a) => a.id === id)?.name).join(", ")} · ${v.active ? "Activo" : "Inactivo"}</p>`).join("")}</div>
        <h3 class="preview-title">Servicios del libro</h3><div class="import-sample">${payload.services.map((v) => `<p>${e(v.name)} · ${dayNames[v.day]} ${v.time} · ${v.active ? "Activo" : "Inactivo"}</p>`).join("")}</div>
        <p class="field-help">Hasta confirmar, los datos permanecen solo en memoria de este dispositivo. Confirma únicamente si cuentas y horarios son correctos.</p>`;
      submit = "Confirmar importación";
    } else {
      fields = '<label class="form-field" for="field-file">Archivo Rol_x_area (.xlsx, hasta 5 MB)</label><input class="form-control" id="field-file" name="file" type="file" accept=".xlsx" required><p class="field-help">Se valida que las personas existan, pertenezcan al área y no ocupen dos puestos del mismo servicio. Corrige cualquier conflicto en el Excel antes de importarlo.</p>';
      submit = "Previsualizar archivo";
    }
  }
  return `<form id="edit-form"><div class="dialog-heading"><span class="area-icon sage">${icon(edit.kind === "assignment" ? "users" : "settings")}</span><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></div><p class="eyebrow">JUNTOS LO HACEMOS POSIBLE</p><h2 id="dialog-title">${title}</h2><p class="dialog-description">${e(description)}</p>${fields}<p id="form-error" class="form-error" role="alert"></p><div class="dialog-footer"><button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">${submit}</button></div><p class="dialog-local">${icon("shield")} ${edit.kind === "import" && !payload ? "El archivo se analiza localmente." : "El servidor valida tus permisos antes de guardar."}</p></form>`;
}
