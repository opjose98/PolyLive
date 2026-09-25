# Motor de Elevación de Muros (MEM)
**Versión de arquitectura:** 1.0  
**Target:** LevON v0.8.0-alpha  
**Fecha:** 2026-05-04  
**Estado:** Source of Truth — NO modificar sin actualizar este documento

---

## 1. Principio Fundamental

```
Planta   → fuente geométrica principal (longitud siempre heredada)
Elevación → vista semántica local del muro (altura, openings, cuantificación)
```

El MEM **nunca recalcula** la longitud de un muro. La longitud es siempre derivada de `Wall.geometry` (la geometría de planta). La elevación añade significado vertical sin contradecir la geometría horizontal.

---

## 2. Visión General del Sistema

El MEM es un sistema BIM ligero semántico para detallado frontal 2D de muros. Permite al usuario:

- Definir altura de muro por elemento (independiente o propagada via Chain Mode)
- Insertar openings (Door, Window, Opening genérico) posicionados en coordenadas locales del muro
- Ver cuantificación bruta/neta en tiempo real
- Editar la elevación en un mini-canvas aislado (WEP) sin afectar el canvas principal

El sistema **no implementa** renderizado 3D, geometría volumétrica, ni materiales avanzados.

---

## 3. Arquitectura Base — Estructura Lógica

```
WallObject (Wall + WallElevation)
├── PlanGeometry         → Wall.geometry (LineShape/ArcShape) — SOLO LECTURA en MEM
├── LocalElevation       → WallElevation (entidad nueva)
│   ├── VerticalLevels   → base (0.0), coronación (= Wall.height)
│   ├── Openings         → List<WallOpening> en coordenadas CSL
│   └── ChainMode        → bool — propagación a muros conectados
└── Quantification       → WallQuantification (derivado, no persistido)
```

`Wall` y `WallElevation` son entidades separadas vinculadas por `wallId`. Esta separación mantiene la capa de dominio de planta intacta y permite cargar proyectos existentes sin pérdida de datos (backwards compatible: proyectos sin `elevations[]` en JSON tienen elevaciones vacías).

---

## 4. Subsistemas

### 4.1 CSL — Sistema de Coordenadas Local (Local Coordinate System)

**Propósito:** transformar entre espacio de planta (world-space) y espacio local del muro (wall-local-space).

**Definición:**
```
Origen CSL = Wall.geometry.startPoint
Eje X CSL  = direction = normalize(endPoint - startPoint)   [longitud del muro]
Eje Y CSL  = vertical ascendente [altura del muro]

Rango válido:
  X ∈ [0, wall.length]
  Y ∈ [0, wall.height]
```

**Transformaciones (solo LineShape; ArcShape: solo longitudinal aproximado):**
```
worldToLocal(p):
  delta = p - startPoint
  x = dot(delta, direction)       → longitud desde inicio
  y = delta.z (o altura explícita) → altura (siempre 0 en planta)

localToWorld(x, y):
  return startPoint + x * direction    [planta]
  y solo existe en elevación (2D frontal)
```

**Implementación:** `WallCslService` en `lib/application/services/wall_csl_service.dart`. Funciones puras estáticas — sin estado. La capa UI no debe calcular CSL directamente.

**No usar screen-space.** El WEP convierte CSL → canvas-pixels internamente con factores de escala propios del viewport del panel.

---

### 4.2 NMS — Niveles de Muro Simplificados (Niveles / Vertical Levels)

**Propósito:** 4 niveles semánticos verticales para simplificar openings, snapping y cuantificación.

```
coronación  ┄┄┄┄┄┄┄┄┄┄┄┄  = Wall.height  (heredado de planta, editable)
dintel      ─────────────  = max(opening.sillHeight + opening.height)  [derivado]
umbral      ─────────────  = min(opening.sillHeight)                   [derivado]
base        ══════════════  = 0.0  (suelo, siempre fijo)
```

- `base` y `coronación` son los únicos niveles almacenados (`VerticalLevels`).
- `umbral` y `dintel` son derivados de los openings — no se persisten.
- El snap vertical en el WEP ancla a estos 4 niveles semánticos.

**IMPORTANTE:** `coronación` en `VerticalLevels` puede diferir de `Wall.height` si el usuario ajusta la altura en el panel de elevación. La reconciliación se hace en `EditWallElevationUseCase` que actualiza ambos (Wall + WallElevation) atómicamente.

---

### 4.3 HAP — Huecos y Aperturas (Openings)

**Propósito:** entidades reales de apertura posicionadas en espacio local del muro.

**Entidad `WallOpening`:**
```
WallOpening
├── id          → UUID
├── type        → OpeningType (door | window | opening)
├── xOffset     → CSL X, metros desde inicio del muro
├── width       → CSL X, metros
├── sillHeight  → CSL Y, metros desde el suelo (0.0 para puertas)
└── height      → CSL Y, metros (dintel = sillHeight + height)
```

**OpeningType:**
```
door    → IfcDoor + IfcOpeningElement (exportación futura)
window  → IfcWindow + IfcOpeningElement
opening → IfcOpeningElement solo (hueco genérico)
```

Los openings NO son los mismos que las entidades `Door` y `Window` existentes en `Project`. Las entidades del dominio de planta (`Door`, `Window`) representan relaciones BIM de hospedaje en planta. `WallOpening` es la representación de elevación — actualmente viven en paralelo; en futuras versiones se sincronizarán.

**Invariantes validados por `WallCslService.validateOpening`:**
```
xOffset >= 0
xOffset + width <= wall.length
sillHeight >= 0
sillHeight + height <= wall.height
width > 0
height > 0
```
Geometría temporalmente inválida está permitida (warning visual en WEP, no bloqueo de edición).

---

### 4.4 CM — Chain Mode (Propagación de Constraints)

**Propósito:** propagación opcional de cambios de altura (`coronación`) a muros vecinos que comparten nodo topológico.

**Reglas:**
- CM se activa per-`WallElevation` (`chainModeEnabled: bool`)
- Si CM activo Y dos muros comparten nodo en `TopologyGraph` → cambio de `coronación` en muro A propaga a muro B
- Si CM desactivado → cada muro mantiene su altura independiente
- CM solo propaga `coronación` — nunca openings, material, ni otros atributos

**Implementación:** `ChainModeService` en `WallCslService`. Consulta `TopologyGraph.getConnectedWallIds(wallId)` para obtener muros vecinos, luego aplica el cambio a cada `WallElevation` vecina cuyo `chainModeEnabled == true`.

---

### 4.5 QE — Quantification Engine

**Propósito:** cálculo de área bruta, área de openings y área neta en tiempo real.

```
grossArea   = wall.length × levels.coronacion
openingArea = Σ (opening.width × opening.height) para cada opening
netArea     = grossArea - openingArea
```

**Implementación:** `WallQuantification.compute(WallElevation elevation, double wallLength)` — función pura de dominio. No requiere recalcular geometría del grafo. Actualización instantánea al cambiar cualquier opening o la altura.

**Exposición:**
- Label overlay en WEP
- Panel de propiedades (cuando el muro está seleccionado)
- `ContextualRibbon` → sección Elevación (toggle futura)

---

### 4.6 WEP — Wall Elevation Panel

**Propósito:** editor local lightweight para el detallado de elevación de muros.

**Apertura:** double-tap sobre un muro en el canvas principal → `showDialog(WallElevationPanel(wallId))`.

**Arquitectura interna:**
```
WallElevationPanel (StatefulWidget + ConsumerWidget)
├── WallElevationPainter (CustomPainter)
│   ├── Dibuja fondo de muro (rectángulo)
│   ├── Dibuja WallOpening × tipo (rectángulos con color semántico)
│   ├── Dibuja NMS level lines (base, umbral, dintel, coronación)
│   └── Dibuja dimensiones en CSL
├── GestureDetector
│   ├── tap → seleccionar opening
│   ├── long press → eliminar opening seleccionado
│   └── onTapUp vacío → deseleccionar
├── Toolbar (fila de botones)
│   ├── + Door / + Window / + Opening
│   ├── Chain Mode toggle
│   └── Cerrar
└── Quantification bar (gross / opening / net)
```

**El WEP NO crea escena propia**. Reutiliza:
- `UnitService` / `UnitFormatter` para display de dimensiones
- `PrecisionService` para snap vertical/horizontal en CSL
- `LevonTokens` para colores y tipografía
- El `GestureDetector` nativo de Flutter para gestos básicos

El canvas principal **no se reconstruye** mientras el WEP está abierto (Dialog aislado en route stack de Flutter).

---

## 5. Flujo Arquitectónico

```
[Canvas Principal]
  double-tap en Wall
        │
        ▼
  showDialog(WallElevationPanel(wallId))
        │
        ▼
  [WallElevationPanel]
    ref.watch(wallElevationsProvider)
    → buscar WallElevation para wallId
    → si no existe: crear WallElevation vacía con defaults
        │
        ▼
  [WallElevationPainter]
    escalar CSL → canvas pixels
    dibujar muro + openings + niveles
        │
        ▼
  Usuario añade/edita opening
        │
        ▼
  ref.read(wallElevationsProvider.notifier)
    .editElevation(wallId, fn)
        │
        ▼
  WallElevationsNotifier.state = [...]  (nuevo estado inmutable)
        │
        ▼
  WallElevationPainter.shouldRepaint → true → redibuja
        │
        ▼
  [Si Chain Mode activo]
  ChainModeService.propagate(wallId, newCoronacion, topology, notifier)
        │
        ▼
  currentProjectSnapshotProvider reconstruye Project
        │
        ▼
  AutosaveService debounce → persiste .levon con elevations[]
```

---

## 6. Relaciones entre Entidades

```
Project
├── walls: List<Wall>
│     Wall { id, geometry, thickness, height, material, isStructural }
│
├── wallElevations: List<WallElevation>
│     WallElevation { wallId, levels, openings, chainModeEnabled }
│         VerticalLevels { base=0.0, coronacion }
│         WallOpening { id, type, xOffset, width, sillHeight, height }
│
├── doors: List<Door>    ← plan-level (existente, sin cambios)
└── windows: List<Window> ← plan-level (existente, sin cambios)
```

**Invariante de consistencia:** `WallElevation.wallId` debe referenciar un `Wall.id` existente en el mismo `Project`. Orphaned elevations son ignoradas en serialización (limpieza en `serializeProject`).

---

## 7. Herencia desde Planta

| Atributo          | Fuente            | Editable en MEM | Notas                              |
|-------------------|-------------------|-----------------|------------------------------------|
| `length`          | `Wall.geometry`   | No              | Solo-lectura absoluta en elevación |
| `thickness`       | `Wall.thickness`  | No              | No relevante en elevación 2D       |
| `material`        | `Wall.material`   | No              | Ver PropertiesPanel en planta      |
| `isStructural`    | `Wall.isStructural`| No             | Afecta TopologyGraph               |
| `coronacion`      | `Wall.height`     | Sí (MEM)        | Sincronizado vía EditWallElevation |
| `openings`        | —                 | Sí (MEM)        | Solo existen en WallElevation      |
| `chainModeEnabled`| —                 | Sí (MEM)        | Default: false                     |

---

## 8. Persistencia

**Formato JSON v2.0 extendido** — nueva sección `elevations[]`:

```json
{
  "version": "2.0",
  "project": { ... },
  "storeys": [ ... ],
  "elements": [ ... ],
  "relations": [ ... ],
  "media": [ ... ],
  "elevations": [
    {
      "wallId": "uuid-del-muro",
      "levels": {
        "coronacion": 2.80
      },
      "openings": [
        {
          "id": "uuid-del-opening",
          "type": "door",
          "xOffset": 1.00,
          "width": 0.90,
          "sillHeight": 0.00,
          "height": 2.10
        },
        {
          "id": "uuid-ventana",
          "type": "window",
          "xOffset": 2.50,
          "width": 1.20,
          "sillHeight": 0.90,
          "height": 1.20
        }
      ],
      "chainModeEnabled": false
    }
  ]
}
```

**Backwards compatibility:**
- Proyectos sin clave `elevations` → `wallElevations: []` (lista vacía)
- La sección `elevations` es completamente opcional en el schema
- Orphaned elevations (wallId no encontrado en `elements`) son descartadas silenciosamente

**`WallQuantification` NO se persiste** — siempre se recomputa desde `WallElevation` + `Wall.length`.

---

## 9. Preparación para Exportación BIM (IFC)

No se exporta en v0.8.0-alpha. Se prepara el mapping semántico:

| Entidad MEM         | Entidad IFC            | Atributos mapeados                                 |
|---------------------|------------------------|----------------------------------------------------|
| `Wall`              | `IfcWall`              | `OverallLength`, `OverallHeight` (= coronacion)    |
| `WallOpening(door)` | `IfcDoor`              | `OverallWidth`, `OverallHeight`                    |
| `WallOpening(win)`  | `IfcWindow`            | `OverallWidth`, `OverallHeight`, `Sill`            |
| `WallOpening(*)`    | `IfcOpeningElement`    | posición en muro vía `IfcLocalPlacement`           |
| `VerticalLevels`    | `IfcBuildingStorey`    | `Elevation` = base                                 |

**Preparación de arquitectura:** `WallOpening` tiene el campo `type` como enum limpio que mapea 1:1 a tipos IFC. Cuando se implemente el exportador, solo se necesita agregar la lógica de serialización IFC en `IfcExporter` — el modelo de dominio ya contiene toda la semántica necesaria.

---

## 10. Sistema de Constraints

Validación en `WallCslService.validateOpening(WallOpening, WallElevation, Wall)`:

```
REGLA 1: longitud heredada — xOffset + width <= wall.length
REGLA 2: height válida   — sillHeight + height <= levels.coronacion  
REGLA 3: bounds positivos — xOffset >= 0.0, sillHeight >= 0.0
REGLA 4: dimensiones > 0  — width > 0.0, height > 0.0
REGLA 5: sin solapamiento — openings no se solapan entre sí (en CSL X)
```

`ValidationResult`:
- `valid`: todo correcto
- `warning`: violación suave (muestra indicador visual en WEP, pero permite guardar)
- `error`: violación severa (bloquea el commit del editing)

---

## 11. Reutilización de Código Existente

| Componente existente       | Cómo lo reutiliza MEM                               |
|----------------------------|-----------------------------------------------------|
| `TopologyGraph`            | `ChainModeService` consulta nodos compartidos       |
| `UnitService/Formatter`    | WEP muestra dimensiones en la unidad activa         |
| `PrecisionService`         | Snap en CSL al paso de precisión configurado        |
| `LevonTokens`              | Colores de opening, tipografía de labels             |
| `SnapSettings`             | `geometricSnapTolerance` para snap en WEP           |
| `JsonSerializer` (schema)  | Se extiende con `_serializeElevations`              |
| `ProjectRepository`        | Sin cambios — WallElevation viaja dentro de Project |
| `AutosaveService`          | Sin cambios — detecta cambio en Project automático  |
| `GestureDetector` (Flutter)| WEP usa gestos nativos Flutter (tap, long press)    |
| `ValidationPipeline`       | Se puede extender con `WallElevationValidator` (v2) |

---

## 12. Estrategia de Testing

| Suite                                    | Cobertura objetivo                               |
|------------------------------------------|--------------------------------------------------|
| `test/domain/entities/wall_elevation_test.dart` | Entidades inmutables, copyWith, quantification |
| `test/application/wall_elevation/quantification_test.dart` | QE: gross, net, openings múltiples |
| `test/application/wall_elevation/chain_propagation_test.dart` | CM: propagación a vecinos |
| `test/application/wall_elevation/csl_service_test.dart` | Transforms CSL↔world, validateOpening |
| `test/persistence/wall_elevation_serialization_test.dart` | Round-trip JSON: serialize→deserialize |

---

## 13. Módulos y Ubicación de Archivos

```
lib/
├── domain/entities/
│   └── wall_elevation.dart          ← WallElevation, VerticalLevels, WallOpening,
│                                       OpeningType, WallQuantification
│
├── application/
│   ├── services/
│   │   └── wall_csl_service.dart    ← CSL transforms, validateOpening, ChainMode
│   └── use_cases/wall_elevation/
│       └── edit_wall_elevation_use_case.dart  ← add/remove/update opening + sync height
│
├── ui/
│   ├── editor/
│   │   └── wall_elevation_painter.dart  ← CustomPainter para vista de elevación
│   └── widgets/wall_elevation/
│       └── wall_elevation_panel.dart    ← WEP: dialog/panel completo
│
└── persistence/
    └── json_serializer.dart         ← extendido con _serializeElevations

docs/architecture/
└── MEM_Wall_Elevation_Engine.md     ← este archivo (source of truth)

test/
├── domain/entities/
│   └── wall_elevation_test.dart
└── application/wall_elevation/
    └── quantification_test.dart
```

---

## 14. No Scope (Explícitamente Fuera del MEM v0.8.0)

- Motor 3D o rendering volumétrico
- Vistas de sección transversal
- Materiales, texturas, acabados
- Sincronización automática Door/Window planta → WallOpening elevación
- Multi-storey propagation (MEM solo trabaja con height relativo a base 0)
- Exportación IFC con openings (preparado semánticamente, no implementado)
- Undo/redo del WEP (historial global de planta no trackea cambios de elevación en v0.8)
