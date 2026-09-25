# Motor de Geometría
**Archivos:** `lib/geometry/intersections.dart`, `lib/geometry/constants.dart`, `lib/geometry/math_utils.dart`, `lib/domain/entities/shapes.dart`, `lib/geometry/polygons/`, `lib/geometry/spatial/spatial_hash.dart`

← [[INDEX]]  |  Conectado a: [[engine_topology]], [[engine_validation]], [[engine_export]]

---

## Responsabilidad
Proporciona todas las operaciones matemáticas 2D puras: intersecciones entre formas, verificación de polígonos, cálculos de área/centroide, snap geométrico y hash espacial.

---

## Jerarquía de Clases

```
Shape (abstracto)
├── LineShape        — muro recto: start, end → length = distanceTo
├── ArcShape         — muro curvo: center, radius, startAngle, sweepAngle
└── PolygonShape     — forma libre: lista de vértices
```

---

## Clase Principal: `GeometryEngine`
**Ubicación:** `lib/geometry/intersections.dart`  
Clase estática pura — todos los métodos son `static`.

### Métodos expuestos

| Método | Entrada | Salida | Complejidad |
|--------|---------|--------|-------------|
| `getLineIntersection` | 4 Vector2 | Vector2? | O(1) |
| `getLineArcIntersection` | LineShape, ArcShape | List<Vector2> (0-2) | O(1) |
| `getArcArcIntersection` | ArcShape, ArcShape | List<Vector2> (0-2) | O(1) |
| `doShapesIntersect` | Shape, Shape | List<Vector2> | O(1) dispatcher |
| `wallIntersection` | Wall, Wall | Vector2? | O(1) alias deprecated |

### Algoritmo `getLineIntersection`
Usa la formulación algebraica 2D con determinantes (Cramer's rule):
```
D = (p1.x-p2.x)(p3.y-p4.y) - (p1.y-p2.y)(p3.x-p4.x)
Si D ≈ 0: paralelas → null
t, u paramétricos → verificar t,u ∈ [0,1]
```
La verificación de si el punto cae en el segmento usa `_isPointOnSegment` con bbox + epsilon.

### Algoritmo `getLineArcIntersection`
Sustitución paramétrica: `p = start + t*(end-start)` en `(x-cx)²+(y-cy)² = r²` → ecuación cuadrática en t. Discriminante < 0 = no hay intersección.

### Algoritmo `getArcArcIntersection`
Geometría de círculos: `a = (r1²-r2²+d²)/(2d)`, `h = √(r1²-a²)`. Los dos candidatos se validan verificando si el ángulo pertenece al barrido de ambos arcos.

---

## `SpatialHash<T>`
**Ubicación:** `lib/geometry/spatial/spatial_hash.dart`

Hash espacial de celda fija para búsqueda de vecinos en O(1) amortizado.

```
Estructura: Map<"cx_cy", List<T>>
cellSize = snapTolerance * 2
Consulta: 9 celdas vecinas (3×3 grid)
```

**Uso:** `TopologyGraph` lo usa para fusionar nodos próximos en `_getOrCreateNode`.

---

## `PolygonUtils` y `PolygonValidator`

| Función | Descripción |
|---------|-------------|
| `area(verts)` | Shoelace formula |
| `signedArea(verts)` | Área con signo (detecta CW/CCW) |
| `centroid(verts)` | Centroide real (no promedio de vértices) |
| `isPointInPolygon(p, verts)` | Ray-casting algorithm |
| `distanceToSegment(p, a, b)` | Distancia punto-segmento clásica |
| `approximateArc(arc, segments)` | Discretiza arco en polyline |

`PolygonValidator.validate(vertices)` retorna `PolygonValid | PolygonInvalid`.

---

## Constantes
**`lib/geometry/constants.dart`**
```dart
const double epsilon = 0.001; // 1mm — tolerancia para comparaciones
bool isCloseEnough(a, b) => (a-b).abs() < epsilon
```

---

## Flujo de Datos
```
EditorController.snap() 
  → SelectionService.findNearestNode() 
    → itera Wall.geometry.startPoint / endPoint

ValidationPipeline.SolapamientoValidator 
  → GeometryEngine.doShapesIntersect(w1.geometry, w2.geometry)

TopologyGraph._splitEdgesAt 
  → _distanceToSegment (implementación propia, no delega a PolygonUtils)  ← ⚠️ DUPLICACIÓN
```

---

## Problemas Identificados

### CRÍTICO
- **`PolygonShape` en `doShapesIntersect` no soportado:** Si hay dos `PolygonShape` la función retorna lista vacía sin advertencia. Esto hace que muros de forma libre sean invisibles para el grafo topológico.
- **`_isPointOnSegment` usa solo bbox:** No verifica que el punto sea colineal con el segmento. Para segmentos casi verticales/horizontales esto puede dar falsos positivos en esquinas de bbox.

### MODERADO
- **Duplicación de `_distanceToSegment`:** Existe en `TopologyGraph` (líneas 246-252) Y en `SelectionService` que delega a `PolygonUtils.distanceToSegment`. Son implementaciones equivalentes. Debería haber una sola en `GeometryEngine` o `PolygonUtils`.
- **`wallIntersection` marcado para deprecar** pero sin deadline ni migración planificada. Confunde a los lectores del código.
- **`epsilon` global de 1mm** puede ser insuficiente para planos grandes (>100m). Sin parametrización por contexto.

### MENOR
- `ArcShape.sweepAngle` positivo = CCW, negativo = CW. Esta convención no es estándar en CAD (AutoCAD usa CCW siempre). Puede causar confusión al integrar con DXF.
- `_isPointOnArc` normaliza ángulos de forma frágil: si `startAngle` ya es >= 2π el cálculo puede fallar.
