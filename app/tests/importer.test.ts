import { describe, it, expect } from "vitest";
import { parseSheets, excelDate, excelTime } from "../src/importer";

function workbook() {
  const volunteers: unknown[][] = Array.from({ length: 35 }, () => []);
  volunteers[4] = ["Sí", "Persona Ejemplo", null, null, "Domingos", "Sí", "Sí", "No", "No", "No", null, "Domingo", 0.375, "Sí", "Primero"];
  volunteers[13][11] = "Maestro/a"; volunteers[13][12] = "Sí";
  volunteers[14][11] = "Ayuda"; volunteers[14][12] = "Sí";
  volunteers[15][11] = "Asistente 1"; volunteers[15][12] = "Sí";
  volunteers[25][11] = "Check-in 1"; volunteers[25][12] = "Sí";
  volunteers[26][11] = "Check-in 2"; volunteers[26][12] = "Sí";
  const sheets = [{ sheet: "Voluntarios", data: volunteers }];
  for (const name of ["Babies", "Kinder", "Kids", "Preteens", "Checkin"]) {
    sheets.push({ sheet: `Asignaciones ${name}`, data: [
      [], [], [],
      name === "Checkin" ? ["Fecha", "Hora", "Servicio", "Check-in 1", "Check-in 2", "Notas"] :
        ["Fecha", "Hora", "Servicio", "Maestro/a", "Ayuda", "Asistente 1", "Notas"],
      name === "Checkin" ? ["2026 - noviembre - 08 * domingo", 0.375, "Primero", null, null, "Nota"] :
        ["2026 - noviembre - 08 * domingo", 0.375, "Primero", name === "Babies" ? "Persona Ejemplo" : null, null, null, "Nota"]
    ] });
  }
  sheets.push({ sheet: "Office Script", data: [[null, "function main(){throw new Error('No debe ejecutarse');}"]] });
  return sheets;
}
describe("importación local", () => {
  it("conserva áreas, puestos vacíos, notas y fecha sin ejecutar el Office Script", () => {
    const result = parseSheets(workbook());
    expect(result.volunteers[0].areas).toEqual(["babies", "kinder"]);
    expect(result.positions.filter((p) => p.active)).toHaveLength(14);
    expect(result.occurrences).toHaveLength(1);
    expect(result.assignments).toHaveLength(14);
    expect(result.assignments.filter((a) => a.volunteerRef)).toHaveLength(1);
    expect(result.assignments.every((a) => a.note === "Nota")).toBe(true);
  });
  it("rechaza personas desconocidas y duplicadas entre áreas", () => {
    const unknown = workbook();
    unknown.find((s) => s.sheet === "Asignaciones Babies")!.data[4][3] = "No registrada";
    expect(() => parseSheets(unknown)).toThrow("no está en la lista");
    const duplicate = workbook();
    duplicate.find((s) => s.sheet === "Asignaciones Kinder")!.data[4][3] = "Persona Ejemplo";
    expect(() => parseSheets(duplicate)).toThrow(/dos puestos.*Babies, fila 5.*Kinder, fila 5/);
  });
  it("conserva personas inactivas sin área sin hacerlas elegibles", () => {
    const sheets = workbook();
    sheets[0].data[5] = ["No", "Persona Inactiva", null, null, "", "No", "No", "No", "No", "No"];
    expect(parseSheets(sheets).volunteers[1]).toMatchObject({ name: "Persona Inactiva", active: false, areas: [] });
    sheets[0].data[5][0] = "Sí";
    expect(() => parseSheets(sheets)).toThrow("al menos un área");
  });
  it("rechaza horas, fechas y pertenencias inválidas", () => {
    expect(() => excelDate("2026 - febrero - 31")).toThrow();
    expect(() => excelTime("25:10")).toThrow();
    const notEligible = workbook();
    notEligible[0].data[4][5] = "No";
    expect(() => parseSheets(notEligible)).toThrow("no pertenece");
  });
  it("convierte decimales de Excel sin deriva de minutos y fechas sin depender de la zona local", () => {
    expect(excelTime(0.44444444444444398)).toBe("10:40");
    expect(excelTime(0.51736111111111105)).toBe("12:25");
    expect(excelTime("12:25 PM")).toBe("12:25");
    expect(excelTime(new Date("1899-12-30T09:00:00Z"))).toBe("09:00");
    expect(excelDate(46327)).toBe("2026-11-01");
  });
  it("rechaza una hoja faltante en lugar de importar una agenda parcial", () => {
    expect(() => parseSheets(workbook().filter((s) => s.sheet !== "Asignaciones Kinder"))).toThrow("Falta la hoja");
  });
});
