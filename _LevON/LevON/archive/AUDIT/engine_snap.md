# Motor de Snap & Precisión
**Archivos:** `lib/ui/editor/editor_controller.dart` (snap), `lib/utils/precision_service.dart`, `lib/utils/unit_service.dart`, `lib/ui/state/project_settings.dart` (SnapSettings)

← [[INDEX]]  |  Conectado a: [[engine_editor]], [[engine_canvas]], [[engine_units]]

---

## Responsabilidad
Ajustar los puntos de input del usuario a ubicaciones significativas del plano (nodos existentes, ángulos estándar, cuadrícula), manteniendo coherencia entre la capa visual y la capa geométrica.

---

## Arquitectura del Snap

El snap tiene **dos capas con tolerancias distintas** que deben mantenerse sincronizadas:

| Capa | Variable | Unidad | Propósito |
|------|----------|--------|-----------|
| Visual (input) | `snapRadius` / `snapSensitivity` | px | Umbral de activación visual en pantalla |
| Geométrica | `geometricSnapTolerance` | m | Fusión de nodos en `TopologyGraph` |

La conversión entre capas ocurre en `EditorController.snap()`:
```dart
final thresholdMeters = _kSnapNodeThresholdPx / scale;  // 24px / scale → metros
```

---

## Pipeline de Snap (orden de prioridad)

```
1. Snap a nodo existente (snapToNodes)
   └── SelectionService.findNearestNode(worldPt, walls, thresholdMeters)
       └── itera Wall.startPoint / endPoint, retorna el más cercano < threshold
   
   Si hay snap: feedback háptico + return nodo

2. Snap angular desde _drawStart (angleSnapping)
   └── EditorController._snapAngle(worldPt, from, stepDegrees)
       └── atan2(dy,dx) → round al múltiplo de stepDeg → reconstruir punto
   
   Si también snapToGrid:
   └── redondear el punto angulado a la cuadrícula

3. Snap a cuadrícula (snapToGrid)
   └── round(x / gridSize) * gridSize  (mismo para y)

4. Sin snap → retorna worldPt original
```

---

## `PrecisionService`

Traduce `LengthPrecision` en valores concretos para la UI:

| Método | Descripción |
|--------|-------------|
| `stepMeters(p)` | Paso mínimo en metros (e.g., 0.001 para mm1) |
| `snapTolerance(p)` | 5× paso, clamp [0.001, 0.1] |
| `decimalsForUnit(p, unit)` | `⌈-log₁₀(paso_en_unidad)⌉` |
| `roundToStep(meters, p)` | Redondear al paso más cercano |

### Niveles de precisión
| Enum | Paso | Uso típico |
|------|------|-----------|
| `LengthPrecision.m1` | 1.000 m | Topografía urbana |
| `LengthPrecision.mm100` | 0.100 m | Anteproyecto |
| `LengthPrecision.mm10` | 0.010 m | Construcción estándar |
| `LengthPrecision.mm1` | 0.001 m | BIM detalle (DEFAULT) |

---

## Flujo de Conexiones

```
projectSettingsProvider (SnapSettings)
  ↓
EditorController.snap()        ← lee ref.read(projectSettingsProvider)
  ↓
retorna Vector2 snapped
  ↓
PreviewLayerPainter              ← dibuja preview en tiempo real
EditorController.commitDrawing() ← crea Wall con las coordenadas snapped
TopologyGraph.addWall()          ← usa geometricSnapTolerance separada
```

---

## Problemas Identificados

### CRÍTICO
- **Inconsistencia de tolerancias entre snap visual y geométrico:** 
  - Snap visual: `24px / scale` → a scale=60 es `0.4m`, a scale=200 es `0.12m`
  - `geometricSnapTolerance`: fijo en `0.005m` (5mm)
  - Si el usuario dibuja a escala baja (zoom out), el snap visual puede conectar puntos que el grafo no fusionará por estar a distancia > 5mm. El muro aparecerá conectado visualmente pero el Room Engine no lo detectará como ciclo cerrado.

- **`snap()` lee `wallsProvider` en cada llamada:** Durante el drag (onScaleUpdate a 60fps), `_ctrl.snap()` llama `_ref.read(wallsProvider)` en cada frame. Con 100 muros = 200 endpoints comparados por frame. No hay caché del snapshot de nodos.

### MODERADO
- **`snapToLines` y `snapToIntersections` en SnapSettings están definidos pero NO implementados** en `EditorController.snap()`. El código solo implementa `snapToNodes`, `angleSnapping` y `snapToGrid`. Las opciones de UI aparecen pero no tienen efecto.
- **Snap a cuadrícula sobre punto angulado:** La combinación `angleSnapping + snapToGrid` puede producir puntos que no estén en el ángulo exacto deseado porque el snap a grid modifica el vector después del snap angular.

### MENOR
- `_snapAngle` usa `atan2(dy, dx)` directamente sobre las coordenadas del usuario sin aplicar el snap de nodo previo. Si el usuario comienza desde un nodo snapped, el cálculo angular puede tener error acumulado.
- La longitud mínima del drag para activar el ángulo (`if (len < 0.001) return worldPt`) puede ser muy pequeña en zoom muy alto.
