"""Generate small, fictitious XLSX files for browser import tests."""
from pathlib import Path
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1] / "tests" / "fixtures"
ROOT.mkdir(parents=True, exist_ok=True)
MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def column(index):
    result = ""
    while index:
        index, rest = divmod(index - 1, 26)
        result = chr(65 + rest) + result
    return result


def worksheet(rows):
    output = []
    for r, row in enumerate(rows, 1):
        cells = []
        for c, value in enumerate(row, 1):
            if value is None:
                continue
            address = f"{column(c)}{r}"
            if isinstance(value, (int, float)):
                cells.append(f'<c r="{address}"><v>{value}</v></c>')
            else:
                cells.append(f'<c r="{address}" t="inlineStr"><is><t>{escape(value)}</t></is></c>')
        output.append(f'<row r="{r}">{"".join(cells)}</row>')
    return f'<worksheet xmlns="{MAIN}"><sheetData>{"".join(output)}</sheetData></worksheet>'


def make(conflict):
    volunteers = [[] for _ in range(35)]
    volunteers[4] = ["Sí", "Persona Ejemplo", None, None, "Domingos", "Sí", "Sí", "No", "No", "No", None, "Domingo", 0.375, "Sí", "Primero"]
    volunteers[5] = ["No", "Persona Inactiva", None, None, "", "No", "No", "No", "No", "No"]
    for row, name in [(13, "Maestro/a"), (14, "Ayuda"), (15, "Asistente 1"), (25, "Check-in 1"), (26, "Check-in 2")]:
        volunteers[row] = [None] * 11 + [name, "Sí"]
    sheets = [("Voluntarios", volunteers)]
    for name in ["Babies", "Kinder", "Kids", "Preteens", "Checkin"]:
        checkin = name == "Checkin"
        roles = ["Check-in 1", "Check-in 2"] if checkin else ["Maestro/a", "Ayuda", "Asistente 1"]
        assigned = "Persona Ejemplo" if name == "Babies" or (conflict and name == "Kinder") else None
        data = ["2026 - noviembre - 08 * domingo", 0.375, "Primero", assigned] + [None] * (len(roles) - 1) + ["Nota importada"]
        sheets.append((f"Asignaciones {name}", [[], [], [], ["Fecha", "Hora", "Servicio"] + roles + ["Notas"], data]))
    sheets.append(("Office Script", [["No ejecutar", "function main(){throw new Error('No ejecutar');}"]]))
    filename = ROOT / ("conflict.xlsx" if conflict else "clean.xlsx")
    with ZipFile(filename, "w", ZIP_DEFLATED) as z:
        parts = "".join(f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' for i in range(1, len(sheets) + 1))
        z.writestr("[Content_Types].xml", f'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>{parts}</Types>')
        z.writestr("_rels/.rels", f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="{REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        names = "".join(f'<sheet name="{name}" sheetId="{i}" r:id="rId{i}"/>' for i, (name, _) in enumerate(sheets, 1))
        z.writestr("xl/workbook.xml", f'<workbook xmlns="{MAIN}" xmlns:r="{REL}"><sheets>{names}</sheets></workbook>')
        links = "".join(f'<Relationship Id="rId{i}" Type="{REL}/worksheet" Target="worksheets/sheet{i}.xml"/>' for i in range(1, len(sheets) + 1))
        z.writestr("xl/_rels/workbook.xml.rels", f'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{links}</Relationships>')
        for i, (_, rows) in enumerate(sheets, 1):
            z.writestr(f"xl/worksheets/sheet{i}.xml", worksheet(rows))


make(False)
make(True)
