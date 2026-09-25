# Motor de Topología (Room Engine)
**Archivos:** `lib/geometry/topology/topology_graph.dart`, `topology_node.dart`, `topology_edge.dart`, `lib/geometry/rooms/room_generator.dart`, `lib/application/use_cases/detect_rooms_use_case.dart`

← [[INDEX]]  |  Conectado a: [[engine_geometry]], [[engine_state]], [[engine_validation]]

---

## Responsabilidad
Construir un grafo planar de conectividad de muros y detectar automáticamente los polígonos cerrados que forman habitaciones. Es el núcleo algorítmico más complejo de LevON.

---

## Pipeline Completo

```
List<Wall> (solo isStructural=true)
  ↓
DetectRoomsUseCase.execute()
  ↓
TopologyGraph.addWall() × N      ← construye grafo con snap de nodos
  ↓
TopologyGraph.findMinimalCycles() ← DCEL / rotation system
  ↓
RoomGenerator.generate()          ← filtra polígonos inválidos
  ↓
List<Room>
```

Este pipeline se ejecuta en `roomsProvider` (Provider reactivo de Riverpod), lo que significa que **se recalcula cada vez que cambia `wallsProvider` o `projectSettingsProvider`**. No hay caché.

---

## `TopologyGraph`

### Estructura de datos
```dart
Map<String, TopologyNode> _nodes     // nodeId → nodo
Map<String, TopologyEdge> _edges     // edgeId → arista
SpatialHash<String> _spatialHash     // posición → nodeId (para snap O(1))
```

### Inserción de muro (`addWall`)
1. `_getOrCreateNode(startPoint)` — busca nodo existente dentro de `snapTolerance`, sino crea uno nuevo
2. `_splitEdgesAt(startNode)` — si el startNode cae en el interior de una arista existente, divide esa arista en dos
3. Repite para `endPoint`
4. Crea `TopologyEdge` entre los dos nodos
5. Guarda referencia cruzada en ambos nodos

### Edge Splitting
Cuando el endpoint de un muro nuevo cae sobre el cuerpo de un muro existente (unión en T), el muro existente se divide en dos aristas que comparten el punto de unión como nodo. Esto garantiza conectividad topológica correcta.

**Limitación:** Solo funciona para `GeometryType.line`. Los arcos no se dividen (comentado en el código).

### Detección de ciclos (`findMinimalCycles`)
Algoritmo de traversía de caras planares (DCEL half-edge rotation system):

```
Para cada half-edge (edge_id, from_node):
  1. Llegar a toNode atravesando edge
  2. En el rotation system de toNode (aristas ordenadas por ángulo de salida):
     - Encontrar incomingEdge (la que llegó)
     - Tomar el predecesor en CW = leftmost turn
  3. Repetir hasta cerrar ciclo o exceder _kMaxCycleLength = 200

Outer face: ciclo con mayor área → descartado
```

El rotation system se construye ordenando los ángulos de salida por nodo en `_buildRotationSystem`. Esta es la clave del algoritmo: garantiza que cada cara minimal se traverse exactamente una vez.

---

## `RoomGenerator`

Recibe los ciclos del grafo y los convierte en `Room`:
1. `_extractVertices`: reconstruye los vértices en el orden correcto de traversía, usando `forward` = si se atraviesa en la dirección start→end o inversa
2. `PolygonValidator.validate`: filtra polígonos degenerados (< 3 vértices, área ≈ 0, auto-intersectantes)
3. Normaliza a CW, calcula área (Shoelace) y centroide

---

## `TopologyNode` y `TopologyEdge`

```dart
TopologyNode:
  id: String (UUID)
  position: Vector2
  connectedEdgeIds: List<String>   // ⚠️ Lista mutable — no es inmutable

TopologyEdge:
  id: String
  startNodeId, endNodeId: String
  geometryType: GeometryType (line | arc)
  objectType: EdgeObjectType (wall | door | window)
  sourceWall: Wall    // referencia al Wall original
```

---

## Problemas Identificados

### CRÍTICO
- **Sin caché en el pipeline:** `roomsProvider` reconstruye el grafo completo en cada cambio de muros. Para 50+ muros esto es O(n²) por el edge splitting. Afecta directamente la fluidez del canvas a 60fps.
- **`TopologyNode.connectedEdgeIds` es mutable (`List<String>`):** Viola el principio de inmutabilidad del dominio. Un nodo modificado externamente puede corromper el grafo sin que haya error.
- **Outer face heurística frágil:** Descartar el ciclo de mayor área solo funciona en planos convexos/simples. Un proyecto con patios interiores o formas cóncavas producirá rooms incorrectas.
- **`_kMaxCycleLength = 200`:** En grafos degenerados (muros muy cortos, nodos casi coincidentes) el límite puede cortar ciclos válidos. El valor debería ser dinámico o al menos configurable.

### MODERADO
- **`snapTolerance` hardcodeado en `DetectRoomsUseCase`:** El default es `0.05m` pero en el provider se usa `settings.snap.geometricSnapTolerance = 0.005m`. Hay inconsistencia entre el valor del use case y el del topology graph.
- **Wall splitting crea copias del Wall con `copyWith(geometry: ...)` manteniendo el mismo `id`:** Si el mismo ID de muro aparece en dos aristas del grafo, el lookup `boundaryWallIds` de una Room puede devolver resultados ambiguos.
- **No hay limpieza de nodos huérfanos:** Si un muro se elimina y sus nodos quedan con 0 aristas, no se limpian. El grafo reconstruido desde cero en cada llamada evita acumulación, pero es ineficiente.

### MENOR
- El algoritmo de rotation system solo ordena por ángulo, sin handle de ángulos iguales (aristas colineales). En esquinas exactamente a 0°, 90°, 180° puede haber indeterminismo.
