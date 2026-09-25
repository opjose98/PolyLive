# Capa Domain — LevON

Contiene las **entidades de negocio BIM** y las **reglas de validación** del modelo.

Esta capa es completamente independiente de Flutter, Riverpod y cualquier framework externo. Solo depende de `vector_math` y `uuid` (utilidades de bajo nivel sin estado).

---

## Responsabilidad

- Definir qué es un **Muro**, una **Columna**, una **Habitación**, un **Proyecto**, etc.
- Aplicar reglas de negocio que deben cumplirse siempre (longitud mínima de muro, sin solapamientos interiores).
- Garantizar inmutabilidad: todas las entidades tienen `copyWith` y nunca se mutan directamente.

---

## Entidades (`entities/`)

| Archivo | Clase | Descripción |
|---|---|---|
| `wall.dart` | `Wall` | Muro BIM. Geometría polimórfica (Line/Arc/Polygon), espesor, altura, material |
| `column.dart` | `ArchitecturalColumn` | Columna circular o rectangular con posición y rotación |
| `door.dart` | `Door` | Puerta hosteada en un muro, posición paramétrica |
| `window.dart` | `Window` | Ventana con altura de antepecho, hosteada en un muro |
| `room.dart` | `Room` | Habitación detectada. Polígono CW precalculado con área y centroide |
| `project.dart` | `Project` | Agregado raíz. Contiene todas las colecciones BIM |
| `photo.dart` | `Photo` | Fotografía de campo embebida o externa |
| `shapes.dart` | `Shape`, `LineShape`, `ArcShape`, `PolygonShape` | Jerarquía de geometrías |
| `workspace_snapshot.dart` | `WorkspaceSnapshot` | Snapshot inmutable para undo/redo |

---

## Validadores (`validators/`)

| Archivo | Clase | Descripción |
|---|---|---|
| `validation_pipeline.dart` | `ValidationPipeline` | Orquestador. Ejecuta todas las reglas registradas |
| | `LongitudMinimaValidator` | Detecta muros más cortos de 0.1 m |
| | `SolapamientoValidator` | Detecta cruces interiores entre muros (O(n²)) |
| | `ValidationIssue` | Resultado de una regla: severidad, ubicación, entidades afectadas |

---

## Reglas de diseño

- **Inmutabilidad**: usar `copyWith` — nunca mutar campos de una entidad.
- **IDs persistentes**: cada entidad genera su UUID en el constructor. El ID no cambia al hacer `copyWith`.
- **Rooms son derivadas**: `Room` no se persiste directamente — se recalcula desde `walls` en cada sesión.
- **`isStructural`**: solo los muros con `isStructural = true` cierran habitaciones en el `TopologyGraph`.

---

## Relaciones entre entidades

```
Project
 ├── walls:   List<Wall>
 ├── columns: List<ArchitecturalColumn>
 ├── doors:   List<Door>    (cada Door referencia su Wall anfitrión)
 ├── windows: List<Window>  (cada Window referencia su Wall anfitrión)
 ├── rooms:   List<Room>    (derivado — no persistir)
 └── photos:  List<Photo>
```
