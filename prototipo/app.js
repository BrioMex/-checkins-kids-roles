(function () {
  "use strict";
  const M = window.AreaModel;
  const KEY = "area.visual-prototype.v1";
  const app = document.querySelector("#app");
  const dialog = document.querySelector("#editor");
  let state;
  let storageWarning = "";
  let storageBlocked = false;
  let page = "schedule";
  let mode = "simple";
  let persona = "admin";
  let selectedDate = "2026-11-08";
  let serviceId = "first";
  let areaId = "all";
  let query = "";
  let pendingOnly = false;
  let editRevision = 0;
  let toastTimer;
  let lastFocus;
  const demoPersonId = "diego";
  const icons = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18m-12 5h.01M12 16h.01M16 16h.01"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3a4 4 0 0 1 0 8"/><circle cx="9" cy="7" r="4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="8" cy="7" r="3" fill="currentColor"/><circle cx="16" cy="17" r="3" fill="currentColor"/>',
    arrow: '<path d="m9 5 7 7-7 7"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    leaf: '<path d="M20 3C10 2 3 6 4 13c1 6 11 8 15 0 2-4 1-10 1-10ZM4 21l10-11"/>',
    sprout: '<path d="M12 21v-9M12 12C3 13 3 4 3 4s9-1 9 8Zm0 4c0-8 9-9 9-9s1 9-9 9Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM20 2v4m-2-2h4"/>',
    rocket: '<path d="M9 15 5 19m4-8-5 1-2 5 7-2m4-6 2 6 7-7c0-3-1-6-1-6s-3-1-6-1l-6 8Zm1 7-1 5 5-2 1-5"/><circle cx="16" cy="7" r="1"/>',
    hand: '<path d="M8 13V6a2 2 0 0 1 4 0v6-9a2 2 0 0 1 4 0v9-6a2 2 0 0 1 4 0v9c0 5-4 7-7 7-3 0-5-2-7-5l-3-4a2 2 0 0 1 3-2l2 2Z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
    print: '<path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6Z"/>'
  };
  const icon = (name, cls = "") => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const person = (id) => state.volunteers.find((v) => v.id === id);
  const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
  const formatDate = (date, options) => new Date(`${date}T12:00:00`).toLocaleDateString("es-MX", options);
  const dates = () => [...new Set(state.assignments.map((a) => a.date))].sort();
  const profileName = () => ({ admin: "Administrador", coordinator: "Coordinador · Kinder", volunteer: "Voluntario · Diego" })[persona];
  const normalized = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  function readStored() {
    const saved = localStorage.getItem(KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!M.isState(parsed)) throw new Error("Los datos guardados no tienen el formato esperado.");
    return parsed;
  }
  try {
    state = readStored() || M.seed();
  } catch (error) {
    state = M.seed();
    storageBlocked = true;
    storageWarning = `No se puede usar el almacenamiento local: ${error.message} Se muestra la demo sin sobrescribir tus datos; la edición está desactivada.`;
  }
  function toast(message) {
    const el = document.querySelector("#toast");
    el.textContent = message;
    el.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("visible"), 6000);
  }
  function persist(next) {
    localStorage.setItem(KEY, JSON.stringify(next));
    state = next;
  }
  function avatar(volunteer, color, small = false) {
    return `<span class="avatar ${esc(color)} ${small ? "small" : ""}" aria-hidden="true">${esc(initials(volunteer.name))}</span>`;
  }
  function navButton(id, label, name, extra = "") {
    return `<button class="nav-item ${page === id ? "active" : ""}" data-action="navigate" data-page="${id}" ${page === id ? 'aria-current="page"' : ""}>${icon(name)}<span>${label}</span>${extra}</button>`;
  }
  function render() {
    const dateSlots = state.assignments.filter((a) => a.date === selectedDate);
    const pending = dateSlots.filter((a) => !a.volunteerId).length;
    app.innerHTML = `
      <aside class="sidebar" aria-label="Navegación principal">
        <a class="brand" href="#main" data-action="navigate" data-page="schedule"><img src="icon.svg" width="39" height="39" alt=""><span>área<span class="brand-dot">.</span></span></a>
        <p class="brand-caption">UN EQUIPO, UN PROPÓSITO</p>
        <div class="workspace">${icon("leaf")}<div><strong>Comunidad Kids</strong><span>Espacio de demostración</span></div></div>
        <p class="nav-label">ORGANIZACIÓN</p>
        <nav>
          ${navButton("schedule", "Roles por área", "grid")}
          ${navButton("mine", "Mi participación", "calendar")}
          ${navButton("volunteers", "Voluntarios", "users", `<span class="nav-count">${state.volunteers.length}</span>`)}
          ${navButton("activity", "Actividad", "clock")}
          ${navButton("settings", "Configuración", "settings")}
        </nav>
        <div class="sidebar-bottom">
          <div class="sidebar-note">${icon("sprout")}<strong>Lo que hacemos juntos<br>deja huella.</strong><p>Menos hojas de cálculo.<br>Más tiempo para las personas.</p></div>
          <button class="profile" data-action="navigate" data-page="settings"><span class="avatar sage">DE</span><span><strong>Cuenta de ejemplo</strong><small>Permisos simulados ${icon("arrow")}</small></span></button>
        </div>
      </aside>
      <div class="main-shell">
        <header class="topbar">
          <span class="breadcrumb">Mi comunidad <span>/</span> <strong>${({ schedule: "Roles por área", mine: "Mi participación", volunteers: "Voluntarios", activity: "Actividad", settings: "Configuración" })[page]}</strong></span>
          <div class="topbar-actions"><span class="local-status"><span class="status-dot"></span>Demo local</span><label class="profile-picker"><span class="sr-only">Simular perfil</span>${icon("shield")}<select id="persona" aria-label="Simular perfil"><option value="admin" ${persona === "admin" ? "selected" : ""}>Administrador</option><option value="coordinator" ${persona === "coordinator" ? "selected" : ""}>Coordinador · Kinder</option><option value="volunteer" ${persona === "volunteer" ? "selected" : ""}>Voluntario · Diego</option></select></label></div>
        </header>
        <main id="main" tabindex="-1">
          <div class="prototype-note">${icon("info")}<span><strong>Prototipo interactivo.</strong> Datos ficticios; cambios guardados solo en este navegador. Sin inicio de sesión ni sincronización en la nube.</span><button data-action="navigate" data-page="settings">Ver propuesta ${icon("arrow")}</button></div>
          ${storageWarning ? `<div class="error-banner" role="alert">${esc(storageWarning)}</div>` : ""}
          ${page === "schedule" || page === "mine" ? schedule(dateSlots, pending) : page === "volunteers" ? volunteersView() : page === "activity" ? activityView() : settingsView()}
          <footer class="page-footer"><span>Hecho para servir mejor, juntos.</span><span>Área · Prototipo de diseño <span class="footer-dot">•</span> 2026</span></footer>
        </main>
      </div>`;
  }
  function heading(eyebrow, title, description, actions = "") {
    return `<div class="page-heading"><div><p class="eyebrow">${eyebrow}</p><h1>${title}</h1><p class="page-description">${description}</p></div>${actions ? `<div class="heading-actions">${actions}</div>` : ""}</div>`;
  }
  function schedule(dateSlots, pending) {
    const filled = dateSlots.length - pending;
    const percentage = dateSlots.length ? Math.round(filled / dateSlots.length * 100) : 0;
    const isMine = page === "mine";
    const selectedService = M.services.find((s) => s.id === serviceId);
    const shownAreas = M.areas.filter((area) => {
      if (areaId !== "all" && area.id !== areaId) return false;
      const slots = dateSlots.filter((a) => a.areaId === area.id && a.serviceId === serviceId);
      return slots.some((a) => (!pendingOnly || !a.volunteerId) && (!isMine || a.volunteerId === demoPersonId) &&
        (!query || normalized(person(a.volunteerId)?.name || "").includes(normalized(query))));
    });
    const anyFilters = query || pendingOnly || areaId !== "all";
    return `
      ${heading(isMine ? "TU TIEMPO TAMBIÉN TRANSFORMA" : "TODO LISTO PARA UN GRAN DOMINGO", isMine ? "Tu lugar en el equipo." : "Cada persona, en su lugar.", isMine ? "Participaciones de Diego Luna, el voluntario de ejemplo de esta demo." : "Organiza los roles, acompaña a tu equipo y enfócate en lo que importa.",
        `<button class="button secondary" data-action="print">${icon("print")}<span>Imprimir rol</span></button><button class="button primary" data-action="export">${icon("download")}<span>Exportar datos</span></button>`)}
      <section class="summary-grid" aria-label="Resumen de la fecha">
        <article class="summary-card"><span class="stat-icon sage">${icon("users")}</span><div><span class="stat-label">Voluntarios activos</span><strong>${state.volunteers.filter((v) => v.active).length}<small>personas que suman</small></strong></div></article>
        <article class="summary-card"><span class="stat-icon lavender">${icon("grid")}</span><div><span class="stat-label">Áreas de servicio</span><strong>5<small>un mismo propósito</small></strong></div></article>
        <article class="summary-card"><span class="stat-icon peach">${icon("check")}</span><div><span class="stat-label">Puestos cubiertos</span><strong>${filled}<span class="stat-denominator">/ ${dateSlots.length}</span><small>en los 3 servicios</small></strong></div></article>
        <button class="summary-card actionable ${pendingOnly ? "selected" : ""}" data-action="pending" aria-pressed="${pendingOnly}"><span class="stat-icon yellow">${icon("clock")}</span><div><span class="stat-label">Por asignar</span><strong>${pending}<small>Ver puestos disponibles ${icon("arrow")}</small></strong></div></button>
      </section>
      <section class="schedule-panel" aria-label="Programación de roles">
        <div class="section-top"><div><h2>${isMine ? "Mis participaciones" : "El equipo de este domingo"}<span class="subtle">Cada rol cuenta. Cada persona también.</span></h2></div>
          <div class="mode-switch" role="group" aria-label="Modo de visualización"><button data-action="mode" data-mode="simple" class="${mode === "simple" ? "active" : ""}" aria-pressed="${mode === "simple"}">${icon("grid")} Sencillo</button><button data-action="mode" data-mode="advanced" class="${mode === "advanced" ? "active" : ""}" aria-pressed="${mode === "advanced"}">${icon("settings")} Avanzado</button></div>
        </div>
        <div class="schedule-toolbar">
          <div class="date-navigation"><button class="icon-button" data-action="date" data-direction="-1" aria-label="Domingo anterior" ${dates().indexOf(selectedDate) === 0 ? "disabled" : ""}>${icon("left")}</button><label class="date-select">${icon("calendar")}<span class="sr-only">Fecha del servicio</span><select id="date" aria-label="Fecha del servicio">${dates().map((d) => `<option value="${d}" ${d === selectedDate ? "selected" : ""}>${esc(formatDate(d, { weekday: "long", day: "numeric", month: "long" }))}</option>`).join("")}</select></label><button class="icon-button" data-action="date" data-direction="1" aria-label="Domingo siguiente" ${dates().indexOf(selectedDate) === dates().length - 1 ? "disabled" : ""}>${icon("arrow")}</button></div>
          <div class="filter-group"><label><span class="sr-only">Filtrar por área</span><select id="area" aria-label="Filtrar por área"><option value="all">Todas las áreas</option>${M.areas.map((a) => `<option value="${a.id}" ${areaId === a.id ? "selected" : ""}>${a.name}</option>`).join("")}</select></label><label class="search-box">${icon("search")}<input type="search" id="search" placeholder="Buscar voluntario…" aria-label="Buscar voluntario" value="${esc(query)}" maxlength="80"></label></div>
        </div>
        <div class="service-bar"><div class="service-tabs" role="group" aria-label="Servicio">${M.services.map((s) => `<button data-action="service" data-service="${s.id}" class="${serviceId === s.id ? "active" : ""}" aria-pressed="${serviceId === s.id}">${s.name}<span>${s.time}</span></button>`).join("")}</div><span class="service-hint">${icon("clock")} Domingo · ${selectedService.time} h</span></div>
        ${persona !== "admin" ? `<div class="permission-note">${icon("shield")}${persona === "coordinator" ? "Vista de coordinación: puedes editar Kinder; las demás áreas son de consulta." : "Vista de voluntario: puedes consultar los roles, sin modificar asignaciones."}</div>` : ""}
        ${anyFilters ? `<div class="active-filters"><span>${pendingOnly ? "Mostrando puestos sin asignar" : "Filtros activos"}${query ? ` · “${esc(query)}”` : ""}</span><button data-action="clear-filters">Limpiar filtros ${icon("close")}</button></div>` : ""}
        ${shownAreas.length ? mode === "simple" ? `<div class="area-grid">${shownAreas.map((a) => areaCard(a, dateSlots, isMine)).join("")}${shownAreas.length === 5 && !isMine ? teamNote(percentage) : ""}</div>` : advancedTable(shownAreas, dateSlots, isMine) : `<div class="empty-state">${icon("search")}<h3>${isMine ? "No tienes participaciones en este servicio" : "No encontramos coincidencias"}</h3><p>${isMine ? "Prueba con otro servicio o domingo." : "Prueba con otra búsqueda o quita los filtros."}</p>${anyFilters ? '<button class="button secondary" data-action="clear-filters">Limpiar filtros</button>' : ""}</div>`}
        <div class="schedule-bottom"><span>${icon("info")} ${mode === "simple" ? "Selecciona un puesto para asignar o cambiar a una persona." : "Vista detallada con puestos, responsables y notas por área."}</span><span>${icon("check")} ${state.revision ? "Cambios guardados localmente" : "Datos de ejemplo"}</span></div>
      </section>
      <section class="bottom-banner"><span class="banner-art">${icon("heart")}</span><div><h3>Un pequeño rol. Una gran diferencia.</h3><p>Detrás de cada servicio hay personas que hacen que todo suceda.</p></div><button data-action="navigate" data-page="volunteers">Conoce al equipo ${icon("arrow")}</button></section>`;
  }
  function visibleSlots(area, dateSlots, mine) {
    return dateSlots.filter((a) => a.areaId === area.id && a.serviceId === serviceId &&
      (!pendingOnly || !a.volunteerId) && (!mine || a.volunteerId === demoPersonId) &&
      (!query || normalized(person(a.volunteerId)?.name || "").includes(normalized(query))));
  }
  function areaCard(area, dateSlots, mine) {
    const all = dateSlots.filter((a) => a.areaId === area.id && a.serviceId === serviceId);
    const missing = all.filter((a) => !a.volunteerId).length;
    return `<article class="area-card ${area.color}">
      <div class="area-card-head"><span class="area-icon ${area.color}">${icon(area.icon)}</span><div><h3>${area.name}</h3><p>${area.description}</p></div><span class="completion ${missing ? "incomplete" : ""}">${missing ? `${all.length - missing}/${all.length}` : icon("check")}<span class="sr-only">${missing ? "puestos cubiertos" : "Completo"}</span></span></div>
      <div class="slot-list">${visibleSlots(area, dateSlots, mine).map((a) => {
        const v = person(a.volunteerId);
        const editable = M.canEdit(persona, area.id) && !storageBlocked;
        const content = `${v ? avatar(v, area.color) : `<span class="avatar vacant">${icon("plus")}</span>`}<span class="slot-text"><span class="role-label">${esc(a.role)}</span><strong class="${v ? "" : "vacant-name"}">${v ? esc(v.name) : "Asignar voluntario"}</strong>${a.note ? `<span class="slot-note">${esc(a.note)}</span>` : ""}</span>${editable ? icon(v ? "arrow" : "plus", "slot-action") : ""}`;
        return editable ? `<button class="slot ${v ? "" : "empty-slot"}" data-action="edit" data-id="${a.id}" aria-label="${v ? "Cambiar" : "Asignar"} ${esc(a.role)} en ${area.name}${v ? `: ${esc(v.name)}` : ""}">${content}</button>` : `<div class="slot ${v ? "" : "empty-slot"}">${content}</div>`;
      }).join("")}</div>
      <div class="area-card-footer"><span class="tiny-dot ${missing ? "amber" : ""}"></span>${missing ? `${missing} ${missing === 1 ? "puesto por cubrir" : "puestos por cubrir"}` : "Equipo completo"}<span>${M.canEdit(persona, area.id) ? "Tu equipo cuenta contigo" : "Solo consulta"}</span></div>
    </article>`;
  }
  function teamNote(percentage) {
    return `<article class="team-note"><div class="note-top"><span class="eyebrow">JUNTOS LO HACEMOS POSIBLE</span>${icon("sprout")}</div><h3>El domingo empieza<br>con tu equipo.</h3><p>Una bienvenida, una historia, una mano que acompaña. Todo suma.</p><div class="coverage"><span>Cobertura del día<strong>${percentage}%</strong></span><div class="progress-track"><span style="width:${percentage}%"></span></div></div><span class="note-foot">5 áreas · 3 servicios · un propósito</span></article>`;
  }
  function advancedTable(shownAreas, dateSlots, mine) {
    return `<div class="table-wrap"><table class="assignments-table"><caption class="sr-only">Asignaciones detalladas del servicio seleccionado</caption><thead><tr><th>Área / puesto</th><th>Voluntario</th><th>Estado</th><th>Notas del servicio</th><th><span class="sr-only">Acciones</span></th></tr></thead><tbody>${shownAreas.map((area) => visibleSlots(area, dateSlots, mine).map((a) => {
      const v = person(a.volunteerId);
      return `<tr><td><span class="table-area ${area.color}">${icon(area.icon)} ${area.name}</span><strong>${esc(a.role)}</strong></td><td>${v ? `<span class="person-cell">${avatar(v, area.color, true)}${esc(v.name)}</span>` : '<span class="muted">Sin asignar</span>'}</td><td><span class="badge ${v ? "complete" : "pending"}">${v ? "Cubierto" : "Pendiente"}</span></td><td class="notes-cell">${a.note ? esc(a.note) : '<span class="muted">Sin notas</span>'}</td><td>${M.canEdit(persona, area.id) && !storageBlocked ? `<button class="text-button" data-action="edit" data-id="${a.id}" aria-label="Editar ${esc(a.role)} en ${area.name}">Editar ${icon("arrow")}</button>` : '<span class="muted">Consulta</span>'}</td></tr>`;
    }).join("")).join("")}</tbody></table></div>`;
  }
  function volunteersView() {
    const shown = state.volunteers.filter((v) => (!query || normalized(v.name).includes(normalized(query))) && (areaId === "all" || v.areas.includes(areaId)));
    return `${heading("LAS PERSONAS PRIMERO", "Un equipo que deja huella.", "Una sola lista de voluntarios, con sus áreas y disponibilidad.",
      persona === "admin" && !storageBlocked ? `<button class="button primary" data-action="add-volunteer">${icon("plus")} Añadir voluntario</button>` : "")}
      <section class="content-panel"><div class="section-top"><h2>Voluntarios <span class="count-pill">${state.volunteers.length}</span></h2><span class="subtle">Todos los nombres son ficticios</span></div>
      <div class="roster-toolbar"><label class="search-box">${icon("search")}<input type="search" id="search" value="${esc(query)}" placeholder="Buscar por nombre…" aria-label="Buscar voluntario" maxlength="80"></label><label><span class="sr-only">Filtrar por área</span><select id="area" aria-label="Filtrar por área"><option value="all">Todas las áreas</option>${M.areas.map((a) => `<option value="${a.id}" ${areaId === a.id ? "selected" : ""}>${a.name}</option>`).join("")}</select></label></div>
      <div class="volunteer-grid">${shown.length ? shown.map((v) => `<article class="volunteer-card">${avatar(v, M.areas.find((a) => a.id === v.areas[0]).color)}<div><h3>${esc(v.name)}</h3><p>${v.areas.map((id) => M.areas.find((a) => a.id === id).name).join(" · ")}</p></div><span class="badge complete">${v.active ? "Activo" : "Inactivo"}</span></article>`).join("") : '<div class="empty-state"><h3>No hay coincidencias</h3><p>Prueba con otro nombre o área.</p></div>'}</div>
      <div class="panel-note">${icon("shield")} En la app final, los datos de contacto serán privados y visibles solo según los permisos.</div></section>`;
  }
  function activityView() {
    return `${heading("CAMBIOS CLAROS, EQUIPOS TRANQUILOS", "Lo que ha cambiado.", "Historial de esta demostración local. No es una auditoría de usuarios reales.")}
      <section class="content-panel"><div class="section-top"><h2>Actividad reciente</h2><span class="badge neutral">Este navegador</span></div>${state.activity.length ? `<ol class="activity-list">${state.activity.map((a) => `<li><span class="activity-symbol">${icon("check")}</span><div><strong>${esc(a.text)}</strong><p>${esc(a.detail)}</p><time datetime="${esc(a.at)}">${esc(new Date(a.at).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" }))}</time></div></li>`).join("")}</ol>` : `<div class="empty-state">${icon("clock")}<h3>Aquí empieza la historia</h3><p>Asigna o cambia un voluntario para ver el primer movimiento.</p><button class="button secondary" data-action="navigate" data-page="schedule">Ver roles por área</button></div>`}</section>`;
  }
  function settingsView() {
    return `${heading("SIMPLE POR FUERA, BIEN PENSADO POR DENTRO", "Un espacio a tu medida.", "La propuesta para pasar del Excel a una app compartida, sin complicaciones.")}
      <div class="settings-grid"><section class="content-panel"><div class="section-top"><h2>${icon("shield")} Perfiles y permisos</h2><span class="badge neutral">Simulación</span></div><div class="settings-body">
      <p>Estás explorando como <strong>${profileName()}</strong>. El selector superior cambia la vista; no es un inicio de sesión ni protege datos reales.</p>
      <div class="permission-row"><span class="stat-icon sage">${icon("settings")}</span><div><h3>Administrador</h3><p>Gestiona todas las áreas, personas, servicios y permisos.</p></div></div>
      <div class="permission-row"><span class="stat-icon lavender">${icon("grid")}</span><div><h3>Coordinador de área</h3><p>Organiza su área; consulta el resto. La demo usa Kinder.</p></div></div>
      <div class="permission-row"><span class="stat-icon peach">${icon("heart")}</span><div><h3>Voluntario</h3><p>Consulta los roles y sus participaciones. Sin edición.</p></div></div></div></section>
      <section class="content-panel"><div class="section-top"><h2>${icon("leaf")} Un comienzo gratuito</h2><span class="badge complete">Propuesta</span></div><div class="settings-body"><h3>Supabase Free + una web instalable</h3><p>Para unas 10 personas, la cuota gratuita resulta holgada para una agenda de texto. Autenticación, base de datos y actualizaciones en tiempo real en un solo servicio.</p><div class="quota-grid"><div><strong>$0</strong><span>USD / mes en Free</span></div><div><strong>500 MB</strong><span>base de datos</span></div><div><strong>50.000</strong><span>usuarios activos / mes</span></div></div><p class="callout">${icon("info")} El proyecto gratuito se puede pausar después de una semana de inactividad. No incluye copias automáticas. Los límites y condiciones pueden cambiar.</p><p>No se contratará un plan de pago ni extras. Si se alcanza una cuota, se revisará el límite antes de considerar cualquier gasto; no se promete disponibilidad ilimitada.</p><a class="text-link" href="https://supabase.com/pricing" target="_blank" rel="noopener noreferrer">Consultar precios oficiales ↗</a></div></section>
      <section class="content-panel"><div class="section-top"><h2>${icon("calendar")} Lo que conserva del Excel</h2></div><div class="settings-body"><p>Babies, Kinder, Kids, Preteens y Check-in, con sus puestos específicos y voluntarios elegibles por área.</p><div class="service-list">${M.services.map((s) => `<div><span class="stat-icon neutral">${icon("clock")}</span><div><strong>${s.name}</strong><p>Domingo · ${s.time} h</p></div><span class="badge complete">Activo</span></div>`).join("")}</div><p class="subtle">En la app final: servicios y puestos configurables, generación trimestral sin borrar asignaciones e importación revisada del Excel. No se ejecuta el Office Script.</p></div></section>
      <section class="content-panel"><div class="section-top"><h2>${icon("sparkles")} De prototipo a app</h2></div><div class="settings-body"><div class="roadmap-step"><span>01</span><div><h3>Validar esta experiencia</h3><p>Probar en móvil, cambiar puestos y elegir la vista preferida.</p></div></div><div class="roadmap-step"><span>02</span><div><h3>Conectar cuentas y datos reales</h3><p>Inicio de sesión, políticas de permisos en la base de datos y sincronización entre dispositivos.</p></div></div><div class="roadmap-step"><span>03</span><div><h3>Publicar e instalar</h3><p>PWA bajo HTTPS en Android, iOS y computadoras. Sin pasar por tiendas de aplicaciones.</p></div></div><a class="button secondary design-link" href="DISENO.md" target="_blank" rel="noopener">Leer propuesta completa ${icon("arrow")}</a><p class="subtle">Este prototipo no es todavía una PWA: no incluye instalación ni modo sin conexión.</p></div></section></div>`;
  }
  function openEditor(id) {
    const slot = state.assignments.find((a) => a.id === id);
    if (!slot || !M.canEdit(persona, slot.areaId) || storageBlocked) return;
    editRevision = state.revision;
    const area = M.areas.find((a) => a.id === slot.areaId);
    const eligible = state.volunteers.filter((v) => v.active && v.areas.includes(slot.areaId));
    lastFocus = document.activeElement;
    dialog.innerHTML = `<form id="assignment-form" data-id="${slot.id}">
      <div class="dialog-heading"><span class="area-icon ${area.color}">${icon(area.icon)}</span><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></div>
      <p class="eyebrow">${area.name} · ${esc(slot.role)}</p>
      <h2 id="dialog-title">Un lugar para sumar.</h2>
      <p class="dialog-description">${esc(formatDate(slot.date, { weekday: "long", day: "numeric", month: "long" }))} · ${M.services.find((s) => s.id === slot.serviceId).name}</p>
      <div class="form-field"><label for="volunteer-select">Voluntario</label><select name="volunteerId" id="volunteer-select" aria-describedby="eligibility-help" autofocus><option value="">Dejar sin asignar</option>${eligible.map((v) => `<option value="${esc(v.id)}" ${v.id === slot.volunteerId ? "selected" : ""}>${esc(v.name)}</option>`).join("")}</select></div>
      <p class="field-help" id="eligibility-help">Solo personas activas de ${area.name}. Se validan los puestos duplicados en el mismo servicio.</p>
      <label class="form-field">Nota para el equipo <span class="optional">(opcional)</span><textarea name="note" rows="3" maxlength="300" placeholder="Algo que el equipo deba saber…">${esc(slot.note)}</textarea></label>
      <p class="form-error" id="form-error" role="alert"></p>
      <div class="dialog-footer"><button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">${icon("check")} Guardar cambio</button></div>
      <p class="dialog-local">${icon("info")} Se guarda únicamente en este navegador.</p></form>`;
    dialog.showModal();
  }
  function openVolunteer() {
    if (persona !== "admin" || storageBlocked) return;
    editRevision = state.revision;
    lastFocus = document.activeElement;
    dialog.innerHTML = `<form id="volunteer-form"><div class="dialog-heading"><span class="area-icon sage">${icon("users")}</span><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">${icon("close")}</button></div><p class="eyebrow">HAY UN LUGAR PARA TODOS</p><h2 id="dialog-title">Una persona que suma.</h2><p class="dialog-description">Usa un nombre ficticio para probar el prototipo.</p><label class="form-field">Nombre completo<input name="name" required maxlength="80" autocomplete="off" autofocus></label><fieldset class="area-checkboxes"><legend>Áreas de participación</legend>${M.areas.map((a) => `<label><input type="checkbox" name="areas" value="${a.id}"> ${a.name}</label>`).join("")}</fieldset><p class="form-error" id="form-error" role="alert"></p><div class="dialog-footer"><button type="button" class="button secondary" data-action="close-dialog">Cancelar</button><button type="submit" class="button primary">Añadir voluntario</button></div></form>`;
    dialog.showModal();
  }
  function closeDialog() {
    dialog.close();
    if (lastFocus?.isConnected) lastFocus.focus();
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ ...state, prototype: true, note: "Datos de demostración, no es un respaldo de una app en producción." }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `area-demo-${selectedDate}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Se exportó una copia JSON de los datos de demostración.");
  }
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "navigate") {
      event.preventDefault();
      page = button.dataset.page;
      query = "";
      areaId = "all";
      pendingOnly = false;
      render();
      document.querySelector("#main").focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    } else if (action === "mode") {
      mode = button.dataset.mode;
      render();
    } else if (action === "service") {
      serviceId = button.dataset.service;
      render();
    } else if (action === "date") {
      const available = dates();
      selectedDate = available[Math.max(0, Math.min(available.length - 1, available.indexOf(selectedDate) + Number(button.dataset.direction)))];
      render();
    } else if (action === "pending") {
      pendingOnly = !pendingOnly;
      render();
    } else if (action === "clear-filters") {
      pendingOnly = false; query = ""; areaId = "all";
      render();
    } else if (action === "edit") openEditor(button.dataset.id);
    else if (action === "add-volunteer") openVolunteer();
    else if (action === "close-dialog") closeDialog();
    else if (action === "export") exportData();
    else if (action === "print") window.print();
  });
  document.addEventListener("change", (event) => {
    const el = event.target;
    if (el.id === "persona") persona = el.value;
    else if (el.id === "date") selectedDate = el.value;
    else if (el.id === "area") areaId = el.value;
    else return;
    render();
  });
  document.addEventListener("input", (event) => {
    if (event.target.id !== "search") return;
    query = event.target.value;
    render();
    const search = document.querySelector("#search");
    search.focus();
    search.setSelectionRange(query.length, query.length);
  });
  dialog.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    const data = new FormData(form);
    try {
      if (storageBlocked) throw new Error("El almacenamiento local no está disponible. Recarga y revisa el aviso antes de editar.");
      const latest = readStored();
      if (latest && latest.revision !== editRevision) {
        state = latest;
        render();
        throw new Error("Los datos cambiaron en otra pestaña. Cierra y vuelve a abrir este formulario para revisar la versión actual.");
      }
      let next;
      if (form.id === "assignment-form") {
        next = M.saveAssignment(state, { id: form.dataset.id, volunteerId: String(data.get("volunteerId")), note: String(data.get("note")), persona, expectedRevision: editRevision });
      } else {
        if (persona !== "admin") throw new Error("Solo administración puede añadir voluntarios.");
        if (state.revision !== editRevision) throw new Error("Los datos cambiaron. Cierra y vuelve a abrir este formulario.");
        const name = String(data.get("name")).trim();
        const areas = data.getAll("areas").map(String);
        if (!name || !areas.length) throw new Error("Escribe un nombre y selecciona al menos un área.");
        if (state.volunteers.some((v) => normalized(v.name) === normalized(name))) throw new Error("Ya existe una persona con ese nombre en la demo.");
        next = structuredClone(state);
        next.volunteers.push({ id: `demo-${crypto.randomUUID()}`, name, areas, active: true });
        next.revision++;
        next.activity.unshift({ id: `person-${next.revision}`, at: new Date().toISOString(), text: `Administración añadió a ${name}.`, detail: "Voluntario activo · Demo local" });
        next.activity = next.activity.slice(0, 50);
      }
      persist(next);
      closeDialog();
      render();
      const restored = form.id === "assignment-form" ? document.querySelector(`[data-action="edit"][data-id="${form.dataset.id}"]`) : document.querySelector('[data-action="add-volunteer"]');
      restored?.focus({ preventScroll: true });
      toast("Cambio guardado en este navegador. No se ha enviado a la nube.");
    } catch (error) {
      document.querySelector("#form-error").textContent = `No se guardó el cambio: ${error.message}`;
    }
  });
  dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY && event.key !== null) return;
    try {
      const latest = readStored();
      if (!latest) throw new Error("Se eliminaron los datos en otra pestaña. Recarga para iniciar una demo nueva.");
      state = latest;
      render();
      toast("Se actualizaron los datos desde otra pestaña de este navegador.");
    } catch (error) {
      storageBlocked = true;
      storageWarning = error.message;
      render();
    }
  });
  render();
})();
