import "./styles.css";
import { ApiError, WorkspaceApi, configuration } from "./api";
import { canEdit, today, type Snapshot } from "./schema";
import { dialogView, type EditContext, type DialogKind } from "./dialogs";
import { readWorkbook, type WorkbookPayload } from "./importer";
import { gateView, workspaceView, type Page, type ViewState } from "./view";
import type { RealtimeChannel, Session } from "@supabase/supabase-js";

const app = document.querySelector<HTMLDivElement>("#app")!;
const dialog = document.querySelector<HTMLDialogElement>("#editor")!;
const toastElement = document.querySelector<HTMLDivElement>("#toast")!;
let api: WorkspaceApi | null = null;
let snapshot: Snapshot | null = null;
let gate: "setup" | "loading" | "login" | "blocked" = "loading";
let gateMessage = "";
let channel: RealtimeChannel | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let toastTimer: ReturnType<typeof setTimeout>;
let epoch = 0;
let entering = false;
let busy = false;
let currentUser = "";
let edit: EditContext | null = null;
let importPayload: WorkbookPayload | null = null;
let lastFocus: HTMLElement | null = null;
let waitingWorker: ServiceWorker | null = null;
let realtime = false;
let refreshTask: Promise<void> | null = null;
let refreshRequested = false;
let forceRequested = false;
const ui: ViewState = {
  page: "schedule", mode: "simple", date: "", occurrenceId: "", area: "all", query: "",
  pendingOnly: false, editable: false, status: "Comprobando conexión…", lastRead: "", update: false
};
const message = (error: unknown) => error instanceof Error ? error.message : "Error inesperado. Intenta actualizar y vuelve a comprobar la conexión.";
function render() {
  app.innerHTML = snapshot ? workspaceView(snapshot, ui) : gateView(gate, gateMessage);
}
function toast(value: string) {
  toastElement.textContent = value;
  toastElement.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastElement.classList.remove("visible"), 8000);
}
function reconcileSelection() {
  if (!snapshot) return;
  const dates = [...new Set(snapshot.occurrences.map((o) => o.date))].sort();
  if (!dates.includes(ui.date)) {
    const currentDate = today(snapshot.settings.timezone);
    ui.date = dates.find((d) => d >= currentDate) ?? dates.at(-1) ?? "";
  }
  const occurrences = snapshot.occurrences.filter((o) => o.date === ui.date);
  if (!occurrences.some((o) => o.id === ui.occurrenceId)) ui.occurrenceId = occurrences[0]?.id ?? "";
}
function stopWatching() {
  if (timer) clearInterval(timer);
  timer = null;
  if (channel && api) void api.client.removeChannel(channel);
  channel = null;
  realtime = false;
}
function clearWorkspace() {
  epoch++;
  stopWatching();
  snapshot = null;
  ui.editable = false;
  currentUser = "";
  refreshRequested = false;
  forceRequested = false;
  closeDialog();
}
function closeDialog() {
  if (busy) return;
  if (dialog.open) dialog.close();
  dialog.innerHTML = "";
  edit = null;
  importPayload = null;
  if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
}
function block(error: unknown) {
  busy = false;
  clearWorkspace();
  gate = "blocked";
  gateMessage = message(error);
  render();
}
async function refresh(force = false): Promise<void> {
  if (!api || !snapshot) return;
  refreshRequested = true;
  forceRequested ||= force;
  if (refreshTask) return refreshTask;
  const generation = epoch;
  refreshTask = (async () => {
    while (refreshRequested && api && snapshot && generation === epoch) {
      refreshRequested = false;
      const shouldForce = forceRequested;
      forceRequested = false;
      try {
        const revision = await api.rpc("get_revision", {});
        if (generation !== epoch || !snapshot) return;
        if (shouldForce || revision !== snapshot.revision) {
          const next = await api.load();
          if (generation !== epoch || !snapshot) return;
          const permissionsChanged = JSON.stringify(next.actor) !== JSON.stringify(snapshot.actor);
          snapshot = next;
          if (permissionsChanged && !busy) {
            closeDialog();
            toast("Tus permisos cambiaron. La vista se actualizó con el acceso actual.");
          }
          reconcileSelection();
        }
        ui.editable = navigator.onLine;
        ui.lastRead = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
        ui.status = realtime ? "Conectado · tiempo real" : "Conectado · comprobación cada 45 s";
        render();
      } catch (error) {
        if (generation !== epoch) return;
        if (error instanceof ApiError && ["42501", "PGRST301", "PGRST302"].includes(error.code)) {
          block(error);
          return;
        }
        ui.editable = false;
        ui.status = `No se pudo actualizar: ${message(error)}`;
        render();
      }
    }
  })().finally(() => { refreshTask = null; });
  return refreshTask;
}
function watch() {
  if (!api) return;
  stopWatching();
  channel = api.client.channel("workspace-changes").on("postgres_changes", {
    event: "UPDATE", schema: "public", table: "workspace_version"
  }, () => { void refresh(); }).subscribe((status) => {
    realtime = status === "SUBSCRIBED";
    if (!snapshot) return;
    if (realtime) void refresh();
    else {
      ui.status = ui.editable ? "Conectado · comprobación cada 45 s" : "Sin conexión verificada";
      render();
    }
  });
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, 45000);
}
async function enter(session: Session) {
  if (!api || entering || (currentUser === session.user.id && snapshot)) return;
  entering = true;
  const generation = ++epoch;
  stopWatching();
  snapshot = null;
  gate = "loading";
  gateMessage = "";
  render();
  try {
    await api.rpc("enter_workspace", {});
    const next = await api.load();
    if (generation !== epoch) return;
    snapshot = next;
    currentUser = session.user.id;
    ui.editable = navigator.onLine;
    ui.lastRead = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" });
    ui.status = "Conectado · comprobando tiempo real";
    reconcileSelection();
    render();
    watch();
  } catch (error) {
    if (generation === epoch) block(error);
  } finally { entering = false; }
}
function openEditor(kind: DialogKind, id: string | null = null) {
  if (!snapshot || !ui.editable || busy) return;
  let version = 0;
  if (kind === "assignment") {
    const slot = snapshot.assignments.find((a) => a.id === id);
    if (!slot || !canEdit(snapshot, slot.areaId)) return;
    version = slot.version;
  } else {
    if (snapshot.actor.role !== "admin") return;
    if (kind === "volunteer") version = snapshot.volunteers.find((a) => a.id === id)?.version ?? 0;
    if (kind === "service") version = snapshot.services.find((a) => a.id === id)?.version ?? 0;
    if (kind === "position") version = snapshot.positions.find((a) => a.id === id)?.version ?? 0;
    if (kind === "grant") version = snapshot.grants.find((a) => a.id === id)?.version ?? 0;
    if (kind === "settings") version = snapshot.settings.version;
    if (kind === "import" && (snapshot.volunteers.length || snapshot.occurrences.length)) {
      toast("La importación inicial requiere voluntarios y calendario vacíos.");
      return;
    }
  }
  edit = { kind, id, version };
  importPayload = null;
  lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  dialog.innerHTML = dialogView(snapshot, edit);
  dialog.showModal();
  const field = dialog.querySelector<HTMLElement>("input:not([type=checkbox]), select, textarea");
  field?.focus();
}
function exportData() {
  if (!snapshot) return;
  const blob = new Blob([JSON.stringify({ format: "area-export-v1", exportedAt: new Date().toISOString(), ...snapshot }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `area-${today(snapshot.settings.timezone)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Se descargó la agenda y configuración que puedes consultar. Guárdala en un lugar privado; no es un respaldo completo de Supabase.");
}
async function logout() {
  if (!api || busy) return;
  busy = true;
  try {
    await api.logout();
    busy = false;
    clearWorkspace();
    gate = "login";
    gateMessage = "";
    render();
  } catch (error) {
    busy = false;
    toast(`No se pudo cerrar la sesión: ${message(error)}`);
  }
}
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const target = event.target.closest<HTMLElement>("[data-action]");
  if (!target || target instanceof HTMLButtonElement && target.disabled) return;
  const action = target.dataset.action;
  if (action === "close-dialog") { closeDialog(); return; }
  if (busy) return;
  if (action === "login") {
    if (!api) return;
    busy = true;
    target.setAttribute("disabled", "");
    void api.login().catch((error: unknown) => {
      busy = false;
      gateMessage = message(error);
      render();
    });
  } else if (action === "logout") void logout();
  else if (action === "retry") {
    if (!api) return;
    void api.client.auth.getSession().then(({ data, error }) => {
      if (error) block(error);
      else if (data.session) void enter(data.session);
      else { gate = "login"; gateMessage = ""; render(); }
    });
  } else if (action === "update-app" && waitingWorker) {
    if (dialog.open && !window.confirm("Se cerrará el formulario y se descartarán los cambios sin guardar. ¿Actualizar la app?")) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  } else if (!snapshot) return;
  else if (action === "refresh") void refresh(true);
  else if (action === "navigate" || action === "navigate-settings") {
    event.preventDefault();
    ui.page = action === "navigate-settings" ? "settings" : target.dataset.page as Page;
    ui.query = ""; ui.area = "all"; ui.pendingOnly = false;
    render();
    document.querySelector<HTMLElement>("#main")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  } else if (action === "mode") {
    ui.mode = target.dataset.mode === "advanced" ? "advanced" : "simple";
    render();
  } else if (action === "service") { ui.occurrenceId = target.dataset.id ?? ""; render(); }
  else if (action === "pending") { ui.pendingOnly = !ui.pendingOnly; render(); }
  else if (action === "clear") { ui.query = ""; ui.area = "all"; ui.pendingOnly = false; render(); }
  else if (action === "previous" || action === "next") {
    const dates = [...new Set(snapshot.occurrences.map((o) => o.date))].sort();
    ui.date = dates[Math.max(0, Math.min(dates.length - 1, dates.indexOf(ui.date) + (action === "next" ? 1 : -1)))];
    reconcileSelection();
    render();
  } else if (action === "print") window.print();
  else if (action === "export") exportData();
  else if (action === "generate" || action === "import") openEditor(action);
  else {
    const [operation, kind] = (action ?? "").split("-");
    if ((operation === "edit" || operation === "add") && ["assignment", "volunteer", "service", "position", "grant", "settings"].includes(kind)) {
      openEditor(kind as DialogKind, target.dataset.id ?? null);
    }
  }
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.name === "role" && dialog.open) {
    const el = dialog.querySelector<HTMLElement>("#coordinator-areas");
    if (el) el.hidden = target.value !== "coordinator";
    return;
  }
  if (target.id === "date") { ui.date = target.value; reconcileSelection(); }
  else if (target.id === "area") ui.area = target.value;
  else return;
  render();
});
document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== "search") return;
  const start = target.selectionStart;
  const end = target.selectionEnd;
  ui.query = target.value;
  render();
  const search = document.querySelector<HTMLInputElement>("#search");
  search?.focus();
  search?.setSelectionRange(start, end);
});
dialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDialog();
});
dialog.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!(event.target instanceof HTMLFormElement) || !snapshot || !api || !edit || busy) return;
  const form = event.target;
  const context = { ...edit };
  const data = new FormData(form);
  const val = (name: string) => String(data.get(name) ?? "").trim();
  const selectedAreas = data.getAll("areas").map(String);
  const isActive = data.has("active");
  const errorElement = dialog.querySelector<HTMLElement>("#form-error")!;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const generation = epoch;
  busy = true;
  submit.disabled = true;
  errorElement.textContent = "";
  void (async () => {
    let committed = false;
    let success = "Cambio guardado en la base de datos compartida.";
    try {
      if (!ui.editable || !navigator.onLine) throw new Error("Verifica la conexión antes de guardar. No hay una cola de cambios sin conexión.");
      if (!api || !snapshot) return;
      if (context.kind === "assignment") {
        await api.rpc("write_assignment", { p_id: context.id!, p_volunteer_id: val("volunteerId") || null, p_note: val("note"), p_version: context.version });
      } else if (context.kind === "volunteer") {
        if (isActive && !selectedAreas.length) throw new Error("Selecciona al menos un área para una persona activa.");
        await api.rpc("save_volunteer", { p_id: context.id, p_name: val("name"), p_areas: selectedAreas, p_active: isActive, p_note: val("note"), p_version: context.version });
      } else if (context.kind === "service") {
        await api.rpc("save_service", { p_id: context.id, p_name: val("name"), p_day: Number(val("day")), p_time: val("time"), p_active: isActive, p_version: context.version });
      } else if (context.kind === "position") {
        const old = snapshot.positions.find((p) => p.id === context.id);
        await api.rpc("save_position", { p_id: context.id, p_name: val("name"), p_area: old?.areaId ?? val("areaId"), p_active: isActive, p_version: context.version });
      } else if (context.kind === "grant") {
        const role = val("role");
        if (role === "coordinator" && !selectedAreas.length) throw new Error("Selecciona al menos un área para la coordinación.");
        await api.rpc("save_grant", { p_id: context.id, p_email: val("email"), p_role: role, p_areas: role === "coordinator" ? selectedAreas : [], p_volunteer_id: val("volunteerId") || null, p_active: isActive, p_version: context.version });
      } else if (context.kind === "settings") {
        await api.rpc("save_settings", { p_name: val("name"), p_timezone: val("timezone"), p_version: context.version });
      } else if (context.kind === "generate") {
        const result = await api.rpc("generate_schedule", { p_start: val("start"), p_end: val("end") });
        success = `Periodo generado: ${result} puestos nuevos. Se conservaron las asignaciones existentes.`;
      } else if (!importPayload) {
        const file = data.get("file");
        if (!(file instanceof File) || !file.size) throw new Error("Selecciona el archivo Excel.");
        const payload = await readWorkbook(file);
        if (generation !== epoch || !snapshot) return;
        importPayload = payload;
        dialog.innerHTML = dialogView(snapshot, context, payload);
        return;
      } else {
        const result = await api.rpc("import_workbook", { p_payload: importPayload });
        success = `Excel importado: ${result} puestos. Todos los datos se guardaron en una sola transacción.`;
      }
      committed = true;
      if (generation !== epoch) return;
      busy = false;
      closeDialog();
      await refresh(true);
      toast(ui.editable ? success : `${success} No se pudo recargar la agenda; pulsa Actualizar.`);
    } catch (error) {
      if (generation !== epoch) return;
      if (committed) toast(`El servidor confirmó el cambio, pero no se pudo actualizar la vista: ${message(error)}`);
      else errorElement.textContent = `No se pudo confirmar el cambio: ${message(error)}`;
      if (error instanceof ApiError && ["40001", "42501"].includes(error.code)) void refresh(true);
    } finally {
      busy = false;
      if (submit.isConnected) submit.disabled = false;
    }
  })();
});
window.addEventListener("offline", () => {
  if (!snapshot) return;
  ui.editable = false;
  ui.status = "Sin conexión · última lectura";
  render();
});
window.addEventListener("online", () => { void refresh(true); });
window.addEventListener("focus", () => { void refresh(); });
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refresh(); });

async function start() {
  try {
    const config = configuration();
    if (!config) { gate = "setup"; render(); return; }
    api = new WorkspaceApi(config);
    const oauthError = new URLSearchParams(location.hash.slice(1)).get("error_description") ?? new URLSearchParams(location.search).get("error_description");
    if (oauthError) {
      gateMessage = oauthError;
      history.replaceState(null, "", "/");
    }
    api.client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        busy = false;
        clearWorkspace();
        gate = "login";
        gateMessage = "";
        render();
      } else if (event === "SIGNED_IN" && session) {
        setTimeout(() => { void enter(session); }, 0);
      }
    });
    const { data, error } = await api.client.auth.getSession();
    if (error) throw error;
    if (data.session) await enter(data.session);
    else { gate = "login"; render(); }
  } catch (error) {
    gate = api ? "blocked" : "setup";
    gateMessage = message(error);
    render();
  }
}
render();
void start();

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).then((registration) => {
    const showUpdate = () => {
      waitingWorker = registration.waiting;
      if (waitingWorker) { ui.update = true; render(); }
    };
    showUpdate();
    registration.addEventListener("updatefound", () => {
      registration.installing?.addEventListener("statechange", showUpdate);
    });
  }).catch((error: unknown) => {
    toast(`No se pudo activar la instalación sin conexión: ${message(error)}. La app web sigue disponible con internet.`);
  });
}
