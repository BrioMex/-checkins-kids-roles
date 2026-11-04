import { areas, escapeHtml as e, type Snapshot } from "./schema";
import { matchesAssignment, prettyDate, type ViewState } from "./view";

export function printView(s: Snapshot, ui: ViewState, range: "selected" | "all") {
  const slots = s.assignments.filter((a) => (ui.area === "all" || a.areaId === ui.area) && matchesAssignment(s, a, ui));
  const byPosition = new Map(slots.map((a) => [`${a.occurrenceId}:${a.positionId}`, a]));
  const included = new Set(slots.map((a) => a.occurrenceId));
  const dates = [...new Set(s.occurrences.filter((o) => included.has(o.id) && (range === "all" || o.date === ui.date)).map((o) => o.date))].sort();
  if (!dates.length) throw new Error("No hay puestos que coincidan con los filtros para las fechas elegidas.");
  const people = new Map(s.volunteers.map((v) => [v.id, v.name]));
  const filters = [
    ui.area !== "all" ? areas.find((a) => a.id === ui.area)?.name : "",
    ui.query ? `Nombre: ${ui.query}` : "",
    ui.pendingOnly ? "Solo pendientes" : "",
    ui.page === "mine" ? "Mi participación" : ""
  ].filter(Boolean).join(" · ") || "Todas las áreas y puestos";
  return dates.map((date) => {
    const services = s.occurrences.filter((o) => o.date === date).sort((a, b) => a.time.localeCompare(b.time));
    return `<article class="print-sheet" data-date="${date}"><div class="print-day-content">
      <header class="print-day-header"><p>${e(s.settings.name)}</p><h1>Rol por área · ${e(prettyDate(date))}</h1><p>${e(filters)} · Todos los servicios</p><p>Última lectura: ${e(ui.lastRead)}${ui.editable ? "" : " · Sin conexión verificada"}</p></header>
      ${areas.map((area) => {
        const positions = s.positions.filter((p) => p.areaId === area.id && services.some((o) => byPosition.has(`${o.id}:${p.id}`)));
        if (!positions.length) return "";
        return `<table class="print-area"><caption>${area.name}</caption><thead><tr><th scope="col">Puesto</th>${services.map((o) => `<th scope="col">${e(o.time)}<small>${e(o.name)}</small></th>`).join("")}</tr></thead><tbody>${positions.map((p) => `<tr><th scope="row">${e(p.name)}</th>${services.map((o) => {
          const a = byPosition.get(`${o.id}:${p.id}`);
          return a ? `<td>${a.volunteerId ? e(people.get(a.volunteerId)) : '<span class="print-vacant">Sin asignar</span>'}${a.note ? `<small class="print-note">${e(a.note)}</small>` : ""}</td>` : '<td class="print-excluded">—</td>';
        }).join("")}</tr>`).join("")}</tbody></table>`;
      }).join("")}
      <p class="print-legend">Sin asignar: puesto pendiente. —: no corresponde o no coincide con los filtros.</p>
    </div></article>`;
  }).join("");
}

export function fitPrintPages(root: HTMLElement) {
  for (const sheet of root.querySelectorAll<HTMLElement>(".print-sheet")) {
    const content = sheet.querySelector<HTMLElement>(".print-day-content")!;
    const width = sheet.clientWidth - 2;
    const height = sheet.clientHeight - 2;
    const fits = (scale: number) => {
      content.style.zoom = String(scale);
      content.style.width = `${width / scale}px`;
      return content.getBoundingClientRect().height <= height;
    };
    if (fits(1)) continue;
    let low = 0, high = 1;
    for (let attempt = 0; attempt < 10; attempt++) {
      const scale = (low + high) / 2;
      if (fits(scale)) low = scale;
      else high = scale;
    }
    if (!low) throw new Error("El contenido de un día es demasiado extenso para una sola hoja. Acota la impresión con los filtros o reduce las notas.");
    fits(low);
  }
}
