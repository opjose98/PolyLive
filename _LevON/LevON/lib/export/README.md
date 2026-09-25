# Capa Export — LevON

Contiene los **exportadores** que convierten el modelo BIM de LevON a formatos estándar del sector.

Cada exportador recibe un `Project` de dominio y produce un archivo en el formato de destino.

---

## Responsabilidad

- Serializar el modelo BIM a formatos estándar de la industria (DXF, IFC).
- No depender de la UI: los exportadores son clases de servicio puro.
- Delegar la escritura de archivos a `FileStorageService` para mantener la portabilidad multiplataforma.

---

## Exportadores

### `dxf_exporter.dart` — DXF R2000

Genera archivos DXF compatibles con AutoCAD, LibreCAD y FreeCAD.

**Capas DXF (nomenclatura AIA):**

| Capa | Color | Tipo | Contenido |
|---|---|---|---|
| `S-WALL-FULL` | Blanco/negro | Continuo | Muros estructurales (2 aristas + eje) |
| `S-WALL-PRTN` | Gris | Discontinuo | Particiones |
| `S-COLS` | Verde | Continuo | Columnas (círculo o polilínea cerrada) |
| `S-ROOM-BNDY` | Cian | Discontinuo | Contornos de habitaciones (informativo) |

**Secciones DXF generadas:** HEADER, TABLES (LTYPE + LAYER), BLOCKS, ENTITIES, OBJECTS.

**Unidades:** metros (`INSUNITS = 6`). Los lectores DXF muestran correctamente las medidas sin escalar.

**Uso:**
```dart
final path = await DxfExporter().exportToDxf(project, targetDirectory: '/ruta/usuario');
```

---

### `ifc_exporter.dart` — IFC 2×3

Exporta al formato IFC (Industry Foundation Classes), el estándar abierto de interoperabilidad BIM definido por buildingSMART.

Los elementos BIM de LevON mapean a entidades IFC:

| LevON | IFC |
|---|---|
| `Wall` (isStructural) | `IfcWallStandardCase` |
| `Wall` (!isStructural) | `IfcSlab` (partición) |
| `ArchitecturalColumn` | `IfcColumn` |
| `Door` | `IfcDoor` |
| `Window` | `IfcWindow` |
| `Room` | `IfcSpace` |

---

### `ifc_export_adapter.dart` — Adaptador IFC

Adaptador que convierte la representación interna del `IfcExporter` a un archivo de texto/JSON compatible con herramientas BIM externas.

---

### `pdf_exporter.dart` — PDF *(en desarrollo)*

Exporta la planta del proyecto como documento PDF para impresión o revisión.

---

## Convenciones

- **Validación previa**: cada exportador valida el proyecto antes de escribir (título no vacío, geometría no degenerada).
- **Sanitización de nombre de archivo**: los caracteres inválidos en nombres de archivo se reemplazan por `_`.
- **Excepciones tipadas**: `DxfExportException` con mensaje descriptivo. No se usan excepciones genéricas.
- **Directorio de destino**: si el caller no provee `targetDirectory`, se usa `FileStorageService.exportDirectory` (`<Documentos>/LevON/exports/`).
