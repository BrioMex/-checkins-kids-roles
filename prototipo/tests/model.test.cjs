"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("../model.js");

const firstSlot = (state) => state.assignments.find((a) => a.date === "2026-11-08" && a.areaId === "babies" && a.serviceId === "first");
const change = (state, args = {}) => M.saveAssignment(state, {
  id: firstSlot(state).id, volunteerId: "ana", note: "  Llegar 15 minutos antes  ",
  persona: "admin", expectedRevision: state.revision, ...args
});

test("la demo contiene servicios y asignaciones válidos, sin personas duplicadas", () => {
  const state = M.seed();
  assert.ok(M.isState(state));
  assert.equal(new Set(state.assignments.map((a) => a.date)).size, 9);
  const occupied = new Set();
  for (const a of state.assignments) {
    if (!a.volunteerId) continue;
    const key = `${a.date}/${a.serviceId}/${a.volunteerId}`;
    assert.ok(!occupied.has(key), `Puesto duplicado: ${key}`);
    occupied.add(key);
    assert.ok(state.volunteers.find((v) => v.id === a.volunteerId).areas.includes(a.areaId));
  }
});

test("guardar conserva el resto del calendario y añade una nota y actividad", () => {
  const state = M.seed();
  const next = change(state);
  const target = next.assignments.find((a) => a.id === firstSlot(state).id);
  assert.equal(target.volunteerId, "ana");
  assert.equal(target.note, "Llegar 15 minutos antes");
  assert.equal(next.revision, 1);
  assert.equal(next.activity.length, 1);
  assert.equal(firstSlot(state).volunteerId, "pablo");
  assert.deepEqual(next.assignments.filter((a) => a.id !== target.id), state.assignments.filter((a) => a.id !== target.id));
});

test("no permite asignar una persona ocupada en el mismo servicio", () => {
  assert.throws(() => change(M.seed(), { volunteerId: "maria" }), /ya tiene un puesto/);
});

test("la validación incluye otras áreas, no solo el área de la asignación", () => {
  const state = M.seed();
  state.volunteers.find((v) => v.id === "ana").areas.push("kinder");
  const other = state.assignments.find((a) => a.date === firstSlot(state).date && a.serviceId === "first" && a.areaId === "kinder");
  other.volunteerId = "ana";
  assert.throws(() => change(state), /ya tiene un puesto/);
});

test("la misma persona puede participar en servicios distintos", () => {
  const state = M.seed();
  const other = state.assignments.find((a) => a.date === firstSlot(state).date && a.serviceId === "third" && a.areaId === "babies");
  other.volunteerId = "ana";
  assert.doesNotThrow(() => change(state));
});

test("un coordinador solo puede editar su área y un voluntario no puede editar", () => {
  assert.throws(() => change(M.seed(), { persona: "coordinator" }), /no puede editar/);
  assert.throws(() => change(M.seed(), { persona: "volunteer" }), /no puede editar/);
  const state = M.seed();
  const slot = state.assignments.find((a) => a.date === "2026-11-08" && a.areaId === "kinder" && a.serviceId === "first");
  assert.doesNotThrow(() => change(state, { id: slot.id, persona: "coordinator", volunteerId: "diego" }));
});

test("rechaza personas inactivas, desconocidas o de otra área", () => {
  const state = M.seed();
  state.volunteers.find((v) => v.id === "ana").active = false;
  for (const id of ["ana", "no-existe", "diego"]) {
    assert.throws(() => change(state, { volunteerId: id }), /voluntario activo/);
  }
});

test("libera un puesto sin borrar la nota ni otras asignaciones", () => {
  const next = change(M.seed(), { volunteerId: "", note: "Falta cubrir" });
  assert.equal(firstSlot(next).volunteerId, "");
  assert.equal(firstSlot(next).note, "Falta cubrir");
});

test("rechaza una edición sobre una revisión antigua", () => {
  const next = change(M.seed());
  assert.throws(() => change(next, { expectedRevision: 0 }), /otra pestaña/);
});

test("el lector detecta almacenamiento incompatible o corrupto", () => {
  assert.equal(M.isState(null), false);
  assert.equal(M.isState({ version: 1 }), false);
  const state = M.seed();
  state.assignments[0].volunteerId = "desconocido";
  assert.equal(M.isState(state), false);
  const duplicate = M.seed();
  duplicate.volunteers.push(duplicate.volunteers[0]);
  assert.equal(M.isState(duplicate), false);
  const malformed = M.seed();
  malformed.activity.push({ id: "1", text: "Sin fecha" });
  assert.equal(M.isState(malformed), false);
});

test("los domingos se recorren correctamente al cambiar de mes y año", () => {
  assert.equal(M.addDays("2026-11-29", 7), "2026-12-06");
  assert.equal(M.addDays("2026-12-27", 7), "2027-01-03");
  assert.equal(M.addDays("2027-01-03", -7), "2026-12-27");
});
