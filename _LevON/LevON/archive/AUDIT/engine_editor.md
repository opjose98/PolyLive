# Motor del Editor (Interaction Engine)
**Archivos:** `lib/ui/editor/editor_controller.dart`, `lib/application/services/selection_service.dart`

← [[INDEX]]  |  Conectado a: [[engine_canvas]], [[engine_state]], [[engine_snap]], [[engine_history]]

---

## Responsabilidad
Orquestar todas las operaciones interactivas del usuario: dibujar, seleccionar, manipular handles, eliminar y navegar entre modos. Actúa como controlador entre la UI (gestos) y los providers de datos.

---

## `EditorController`

Constructor recibe `WidgetRef`. Instanciado en `EditorScreen.initState` como `late final`.

### Modos del editor
```
EditorMode.view    → pan/zoom libre
EditorMode.draw    → drag o point-to-point crea Wall/Column
EditorMode.select  → tap selecciona, long-press abre propiedades, drag mueve handles
EditorMode.delete  → tap elimina con confirmación opcional
```

### `commitDrawing(start, end)`
```
1. Registra snapshot en historyProvider (para undo)
2. Si subMode == wall | partition:
   - Verifica distancia mínima (0.1m)
   - Crea Wall(geometry: LineShape(start, end), settings.defaults...)
   - wallsProvider.notifier.addWall(wall)
3. Si subMode == column:
   - Lee isCircular de creationMethodProvider
   - Crea ArchitecturalColumn en posición = end (no start)  ← ⚠️ usa 'end' no 'start'
   - columnsProvider.notifier.addColumn(col)
```

### `handleTap(worldPt, scale)`
Llama `SelectionService.hitTest()` con prioridad Wall > Column > Room.
NO abre el panel de propiedades — solo actualiza `selectedObjectProvider`.
El panel se abre con long press en `_onLongPressStart`.

### `startManipulation / updateManipulation / commitManipulation`
Sistema de manipulación directa de handles:
- `startManipulation`: hit-test sobre los 3 handles del Wall seleccionado (0=start, 1=end, 2=mid). Si hay hit → guarda `_manipulationOriginal` + `_activeHandleIndex`.
- `updateManipulation`: modifica `_manipulationOriginal` con el nuevo punto snapped y actualiza `wallsProvider` + `selectedObjectProvider` en tiempo real.
- `commitManipulation`: limpia el estado de manipulación.

**Problema de diseño:** `_manipulationOriginal` guarda el objeto INICIAL del drag. Durante `updateManipulation`, se aplica el delta sobre el original, no sobre el estado actual. Esto es correcto para muros (la transformación es absoluta) pero si hay dos llamadas concurrentes (imposible hoy, posible con gestos complejos), puede haber inconsistencia.

### `undo() / redo()`
```
undo:
  1. Toma snapshot actual (workspaceSnapshotProvider)
  2. Pide al historyProvider el snapshot previo
  3. Aplica: setWalls, setDoors, setWindows, setColumns
  4. clearSelection()
```

---

## `SelectionService`

Servicio puro de aplicación (sin Flutter, sin estado). Responsable de hit-testing.

### Prioridad de selección
```
1. Wall — distancia al segmento < thresholdMeters
2. ArchitecturalColumn — dentro del bounding box/círculo
3. Room — point-in-polygon (ray-casting sobre el polígono)
```

### `hitTestHandle`
```
Wall:  handle 0 = startPoint, handle 1 = endPoint, handle 2 = midPoint
Column: handle 0 = position (centro)
Room: sin handles de manipulación
```

---

## Problemas Identificados

### CRÍTICO
- **Columna creada en `end` no en `start`:** En `commitDrawing`, las columnas se crean con `position: end`. Para el método `drag` (inicio en scaleStart, fin en scaleEnd) esto es correcto, pero para `pointToPoint` puede ser confuso: el usuario marca el primer punto (start) y la columna aparece al levantar el dedo en el segundo punto (end).
- **No hay validación de `_drawStart != null` antes de llamar `commitDrawing`:** Si se llama `commitDrawing(null, ...)` o `commitDrawing(..., null)` desde un estado de gesto incorrecto, Dart lanzará un error de tipo en runtime (start y end son `Vector2` no nullable, pero la llamada desde EditorScreen los verifica con `if`).

### MODERADO
- **`EditorController` accede a 8+ providers distintos:** `drawSubModeProvider`, `creationMethodProvider`, `projectSettingsProvider`, `wallsProvider`, `columnsProvider`, `roomsProvider`, `selectedObjectProvider`, `historyProvider`, `workspaceSnapshotProvider`, `draggedNodeIndexProvider`. Es una clase de bajo cohesión que sabe demasiado del estado global.
- **`SelectionService` es instanciado en el constructor de `EditorController`:** No hay inyección de dependencias real. Para tests del controller se necesita instanciar un SelectionService real.
- **Long press en mobile no funciona si el modo es `view`:** `_onLongPressStart` ignora el long press en modo view. Si el usuario hace long press sobre un elemento en modo view (sin saber que debe cambiar a select primero), no pasa nada y no hay feedback. Confuso para usuarios nuevos.
- **El modo `delete` usa el mismo hit-test que `select` pero con `heavyImpact` háptico.** Si `deleteConfirmation = false`, el elemento se elimina inmediatamente al primer tap. No hay distinción visual clara entre "estoy en modo eliminar" y "estoy en modo seleccionar" más allá del color del botón en la toolbar.

### MENOR
- `_kMinWallLength = 0.1m` (10cm) es razonable pero no configurable. Un detalle de instalaciones puede requerir muros de 5cm.
- `clearSelection()` desactiva `propertiesPanelVisibleProvider` automáticamente, lo que cierra el panel cada vez que se cambia de modo. En desktop, el usuario puede querer mantener el panel abierto al cambiar de herramienta.
