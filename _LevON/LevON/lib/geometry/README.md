# Capa Geometry — LevON

Contiene el **motor geométrico puro** de LevON: algoritmos de intersección, topología planar, hash espacial y validación de polígonos.

Esta capa no depende de Flutter ni del modelo de dominio BIM (solo recibe `Wall` como dato de entrada, pero no lo modifica).

---

## Responsabilidad

- Implementar los algoritmos matemáticos 2D necesarios para el editor BIM.
- Detectar las habitaciones que forman los muros mediante análisis topológico.
- Proveer utilidades de geometría reutilizables (área, centroide, distancias, intersecciones).

---

## Archivos raíz

| Archivo | Descripción |
|---|---|
| `constants.dart` | `epsilon = 0.001` m (1 mm de precisión métrica) e `isCloseEnough()` |
| `math_utils.dart` | Extensión `Vector2Precision.isAlmostEqual()` con tolerancia BIM |
| `intersections.dart` | `GeometryEngine`: intersección Línea×Línea, Línea×Arco, Arco×Arco |
| `polygons.dart` | Re-export de compatibilidad → `PolygonUtils`. Migrar a Beta. |

---

## Submódulos

### `topology/` — Grafo planar DCEL

El submódulo más complejo. Modela la conectividad de muros como un grafo planar.

| Archivo | Clase | Descripción |
|---|---|---|
| `topology_graph.dart` | `TopologyGraph` | Grafo principal: fusión de nodos, edge splitting, detección de ciclos |
| `topology_edge.dart` | `TopologyEdge` | Arista: referencia a nodos por ID, tipo geométrico y semántico |
| `topology_node.dart` | `TopologyNode` | Nodo: posición, IDs de aristas conectadas |

**Algoritmo de detección de habitaciones:**

1. Cada `Wall` se convierte en una arista; los endpoints con distancia < `snapTolerance` se fusionan en un nodo.
2. Si un endpoint cae sobre el interior de una arista existente, esa arista se divide en dos (**edge splitting**).
3. Se construye el *rotation system*: por cada nodo, lista CCW de ángulos de salida.
4. Traversía por giro a la izquierda: cada semiarista se visita una vez → los ciclos resultantes son las caras mínimas del plano.
5. El ciclo de mayor área es el *outer face* (cara exterior) y se descarta.

**Complejidad:** O(V + E) por cara, O(V·E) en el peor caso.

---

### `polygons/` — Geometría de polígonos

| Archivo | Clase | Descripción |
|---|---|---|
| `polygon_utils.dart` | `PolygonUtils` | Área (Shoelace), centroide, orientación CW/CCW, point-in-polygon (ray-casting), aproximación de arcos |
| `polygon_validator.dart` | `PolygonValidator` | Pipeline de 5 pasos: vértices mínimos → cierre → área → auto-intersección → normalización CW |

**Pipeline de validación de polígonos:**

```
Paso 1: vertices.length >= 3
Paso 2: eliminar vértice de cierre duplicado (si existe)
Paso 3: área > minArea (0.01 m² por defecto)
Paso 4: sin auto-intersección O(n²)
Paso 5: ensureClockwise() — normalizar a CW en sistema Y-down de Flutter
```

---

### `rooms/` — Generador de habitaciones

| Archivo | Clase | Descripción |
|---|---|---|
| `room_generator.dart` | `RoomGenerator` | Convierte ciclos del grafo en entidades `Room` con polígono validado |

El generador extrae los vértices de cada ciclo en el orden correcto de traversía (usando `fromNodeIds` para determinar la dirección de cada arista) y los pasa por `PolygonValidator`. Los ciclos inválidos se descartan silenciosamente.

---

### `spatial/` — Hash espacial

| Archivo | Clase | Descripción |
|---|---|---|
| `spatial_hash.dart` | `SpatialHash<T>` | Grid de celdas fijas para búsqueda de vecinos en O(1) amortizado |

Usado por `TopologyGraph` para fusionar nodos: en lugar de comparar cada nuevo nodo con todos los existentes O(n), la búsqueda consulta solo las 9 celdas vecinas. `cellSize = snapTolerance × 2` garantiza que no se pierden vecinos dentro del radio de snap.

---

## Invariantes importantes

- **Sistema de coordenadas Y-down**: Flutter usa Y creciente hacia abajo. El área positiva (Shoelace) corresponde a orientación horaria (CW). `PolygonUtils.signedArea > 0` → CW.
- **Unidades**: todas las coordenadas son metros en world-space. El canvas aplica una escala en píxeles/metro solo para el renderizado.
- **Sin dependencia de Flutter**: esta capa puede ejecutarse en tests Dart puros sin contexto de widget.
