"""Valida los IFC y DXF de muestra con herramientas externas (CI).

Uso: python scripts/validate_exports.py <carpeta con sample.ifc, sample.dxf, sample-project.ifc y sample-memoria.xlsx>

Falla (código 1) si:
  · ezdxf encuentra errores en el DXF (R2000) o un texto queda ilegible;
  · ifcopenshell encuentra problemas de esquema IFC4;
  · no se puede construir la geometría de un elemento (muros, columnas,
    puertas, ventanas, losas, espacios, vigas y barras).
"""

import os
import sys

import ezdxf
import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.validate
from ezdxf import recover


def check_dxf(path: str) -> list[str]:
    problems: list[str] = []
    doc, auditor = recover.readfile(path)
    if doc.dxfversion != "AC1015":
        problems.append(f"DXF: versión {doc.dxfversion}, se esperaba AC1015 (R2000)")
    for e in auditor.errors:
        problems.append(f"DXF: {e.message}")
    msp = doc.modelspace()
    for t in msp.query("TEXT"):
        if "Ã" in t.plain_text() or "Â" in t.plain_text():
            problems.append(f"DXF: texto mal codificado: {t.plain_text()!r}")
    layers = {e.dxf.layer for e in msp}
    print(f"DXF ok: {len(msp)} entidades en {len(layers)} capas")
    return problems


def check_ifc(path: str) -> list[str]:
    problems: list[str] = []
    f = ifcopenshell.open(path)
    if f.schema != "IFC4":
        problems.append(f"IFC: esquema {f.schema}, se esperaba IFC4")
    log = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(f, log)
    for s in log.statements:
        problems.append(f"IFC esquema: {s.get('message', s) if isinstance(s, dict) else s}")
    settings = ifcopenshell.geom.settings()
    # Solo el cuerpo 3D (los muros también llevan su eje 2D como 'Axis').
    try:
        settings.set("context-identifiers", ["Body"])
    except Exception:  # noqa: BLE001  (versiones sin esa opción)
        pass
    built = 0
    for t in ["IfcWall", "IfcColumn", "IfcDoor", "IfcWindow", "IfcSlab", "IfcSpace", "IfcBeam", "IfcMember", "IfcOpeningElement"]:
        for el in f.by_type(t, include_subtypes=False):
            if not el.Representation:
                continue
            try:
                ifcopenshell.geom.create_shape(settings, el)
                built += 1
            except Exception as ex:  # noqa: BLE001
                problems.append(f"IFC geometría: {el.is_a()} {el.Name}: {ex}")
    print(f"IFC ok: {len(list(f))} entidades, {built} geometrías construidas")
    return problems


def check_xlsx(path: str) -> list[str]:
    """Memoria de cantidades (Excel): se abre sin reparar, con su encabezado, fórmulas e imágenes."""
    try:
        import openpyxl  # noqa: PLC0415  (opcional: la CI la instala si valida la memoria)
    except ImportError:
        print("XLSX: openpyxl no está instalado; se omite la validación de la memoria")
        return []
    problems: list[str] = []
    wb = openpyxl.load_workbook(path)
    ws = wb.active
    if ws["E2"].value != "MEMORIA DE CÁLCULO DE CANTIDADES DE OBRA":
        problems.append("XLSX: falta el título de la memoria en E2")
    formulas = [c for row in ws.iter_rows() for c in row if isinstance(c.value, str) and c.value.startswith("=")]
    if not formulas:
        problems.append("XLSX: la memoria no tiene fórmulas")
    print(f"XLSX ok: {ws.max_row} filas, {len(ws.merged_cells.ranges)} rangos combinados, {len(formulas)} fórmulas, {len(ws._images)} imágenes")
    return problems


def main() -> int:
    folder = sys.argv[1] if len(sys.argv) > 1 else "artifacts"
    problems = check_dxf(os.path.join(folder, "sample.dxf")) + check_ifc(os.path.join(folder, "sample.ifc"))
    # IFC del proyecto completo (varios espacios en un modelo), si se generó.
    project = os.path.join(folder, "sample-project.ifc")
    if os.path.exists(project):
        problems += check_ifc(project)
    memoria = os.path.join(folder, "sample-memoria.xlsx")
    if os.path.exists(memoria):
        problems += check_xlsx(memoria)
    for p in problems:
        print("ERROR", p)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
