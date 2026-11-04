(function (root) {
  "use strict";
  const areas = [
    { id: "babies", name: "Babies", description: "Los primeros pasos", icon: "sprout", color: "peach" },
    { id: "kinder", name: "Kinder", description: "Descubrir y crecer", icon: "sun", color: "yellow" },
    { id: "kids", name: "Kids", description: "Grandes aventuras", icon: "sparkles", color: "sage" },
    { id: "preteens", name: "Preteens", description: "Una nueva etapa", icon: "rocket", color: "lavender" },
    { id: "checkin", name: "Check-in", description: "La primera bienvenida", icon: "hand", color: "blue" }
  ];
  const services = [
    { id: "first", name: "Primero", time: "09:00" },
    { id: "second", name: "Segundo", time: "10:40" },
    { id: "third", name: "Tercero", time: "12:25" }
  ];
  const rolesFor = (area) => area === "checkin" ? ["Check-in 1", "Check-in 2"] : ["Maestro/a", "Ayuda", "Asistente 1"];
  const people = [
    ["ana", "Ana López", "babies"], ["pablo", "Pablo Ríos", "babies"], ["maria", "María Sol", "babies"],
    ["diego", "Diego Luna", "kinder"], ["lucia", "Lucía Pérez", "kinder"], ["tomas", "Tomás Vega", "kinder"],
    ["sofia", "Sofía Cruz", "kids"], ["daniel", "Daniel Gil", "kids"], ["emma", "Emma León", "kids"],
    ["leo", "Leo Martín", "preteens"], ["elena", "Elena Paz", "preteens"], ["mateo", "Mateo Díaz", "preteens"],
    ["sara", "Sara Vidal", "checkin"], ["bruno", "Bruno Rey", "checkin"],
    ["clara", "Clara Mora", "babies"], ["ivan", "Iván Soto", "kinder"],
    ["nora", "Nora Cano", "kids"], ["hugo", "Hugo Ruiz", "preteens"],
    ["alma", "Alma Valle", "checkin"], ["ines", "Inés Mar", "kids"]
  ];
  function dateString(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function addDays(value, days) {
    const date = new Date(`${value}T12:00:00`);
    date.setDate(date.getDate() + days);
    return dateString(date);
  }
  function seed() {
    const volunteers = people.map(([id, name, area]) => ({ id, name, areas: [area], active: true }));
    const assignments = [];
    for (let week = 0; week < 9; week++) {
      for (let si = 0; si < services.length; si++) {
        for (let ai = 0; ai < areas.length; ai++) {
          const area = areas[ai];
          const pool = volunteers.filter((v) => v.areas.includes(area.id));
          rolesFor(area.id).forEach((role, ri) => {
            const empty = (week + si + ai + ri) % 6 === 0;
            assignments.push({
              id: `${week}-${services[si].id}-${area.id}-${ri}`,
              date: addDays("2026-11-01", week * 7),
              serviceId: services[si].id,
              areaId: area.id,
              role,
              volunteerId: empty ? "" : pool[(week + si + ri) % pool.length].id,
              note: ""
            });
          });
        }
      }
    }
    return { version: 1, revision: 0, volunteers, assignments, activity: [] };
  }
  function canEdit(persona, areaId) {
    return persona === "admin" || (persona === "coordinator" && areaId === "kinder");
  }
  function validateAssignment(state, id, volunteerId, persona) {
    const slot = state.assignments.find((a) => a.id === id);
    if (!slot) return "La asignación ya no existe.";
    if (!canEdit(persona, slot.areaId)) return "Tu perfil no puede editar esta área.";
    if (!volunteerId) return "";
    const volunteer = state.volunteers.find((v) => v.id === volunteerId);
    if (!volunteer || !volunteer.active || !volunteer.areas.includes(slot.areaId)) {
      return "Selecciona un voluntario activo que pertenezca a esta área.";
    }
    if (state.assignments.some((a) => a.id !== id && a.date === slot.date && a.serviceId === slot.serviceId && a.volunteerId === volunteerId)) {
      return "Esta persona ya tiene un puesto en el mismo servicio. Elige otra persona o libera su puesto anterior.";
    }
    return "";
  }
  function saveAssignment(state, { id, volunteerId, note, persona, expectedRevision }) {
    if (state.revision !== expectedRevision) throw new Error("Los datos cambiaron en otra pestaña. Revisa la versión actual y vuelve a abrir la asignación.");
    const error = validateAssignment(state, id, volunteerId, persona);
    if (error) throw new Error(error);
    const slot = state.assignments.find((a) => a.id === id);
    const next = structuredClone(state);
    const target = next.assignments.find((a) => a.id === id);
    target.volunteerId = volunteerId;
    target.note = note.trim().slice(0, 300);
    next.revision++;
    next.activity.unshift({
      id: `${next.revision}-${Date.now()}`, at: new Date().toISOString(),
      text: `${persona === "admin" ? "Administración" : "Coordinación Kinder"} actualizó ${slot.role} en ${areas.find((a) => a.id === slot.areaId).name}.`,
      detail: `${slot.date} · ${services.find((s) => s.id === slot.serviceId).name}`
    });
    next.activity = next.activity.slice(0, 50);
    return next;
  }
  function isState(value) {
    if (!value || value.version !== 1 || !Number.isInteger(value.revision) || value.revision < 0 ||
      !Array.isArray(value.volunteers) || !Array.isArray(value.assignments) || !Array.isArray(value.activity)) return false;
    const ids = new Set();
    for (const v of value.volunteers) {
      if (!v || typeof v.id !== "string" || ids.has(v.id) || typeof v.name !== "string" || !v.name.trim() ||
        typeof v.active !== "boolean" || !Array.isArray(v.areas) || !v.areas.length || !v.areas.every((a) => areas.some((area) => area.id === a))) return false;
      ids.add(v.id);
    }
    const slotIds = new Set();
    for (const a of value.assignments) {
      if (!a || typeof a.id !== "string" || slotIds.has(a.id) || !/^\d{4}-\d{2}-\d{2}$/.test(a.date) ||
        !services.some((s) => s.id === a.serviceId) || !areas.some((area) => area.id === a.areaId) ||
        !rolesFor(a.areaId).includes(a.role) || typeof a.note !== "string" ||
        typeof a.volunteerId !== "string" || (a.volunteerId && !ids.has(a.volunteerId))) return false;
      slotIds.add(a.id);
    }
    return value.activity.every((a) => a && typeof a.id === "string" && typeof a.at === "string" &&
      !Number.isNaN(Date.parse(a.at)) && typeof a.text === "string" && typeof a.detail === "string");
  }
  const api = { areas, services, rolesFor, seed, canEdit, validateAssignment, saveAssignment, isState, addDays };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AreaModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
