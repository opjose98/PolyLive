# Motor de Historial (Undo/Redo)
**Archivos:** `lib/ui/state/history_notifier.dart`, `lib/domain/entities/workspace_snapshot.dart`

← [[INDEX]]  |  Conectado a: [[engine_editor]], [[engine_state]]

---

## Responsabilidad
Mantener el historial de cambios del editor para permitir deshacer y rehacer operaciones. Gestiona dos pilas de snapshots (past/future) con límite de memoria.

---

## Arquitectura

```
HistoryState
  past:   [Snapshot₁, Snapshot₂, ..., SnapshotN]   ← stack de estados anteriores
  future: [SnapshotN+1, ...]                         ← stack para redo

Presente: vive en wallsProvider, columnsProvider, doorsProvider, windowsProvider
```

El estado "presente" NO vive en el historial — vive en los providers de datos. `HistoryNotifier` solo gestiona los stacks de pasado y futuro.

---

## `WorkspaceSnapshot`

```dart
class WorkspaceSnapshot {
  final List<Wall> walls;
  final List<Door> doors;
  final List<Window> windows;
  final List<ArchitecturalColumn> columns;
}
```

Snapshot inmutable capturado ANTES de cada mutación. No incluye `rooms` (derivadas) ni `settings` (no forman parte del historial de geometría).

---

## Protocolo de uso (correcto)

```dart
// ANTES de mutar:
ref.read(historyProvider.notifier).record(ref.read(workspaceSnapshotProvider));

// MUTACIÓN:
ref.read(wallsProvider.notifier).addWall(wall);

// UNDO:
final prev = ref.read(historyProvider.notifier).undo(ref.read(workspaceSnapshotProvider));
if (prev != null) {
  ref.read(wallsProvider.notifier).setWalls(prev.walls);
  // ... setDoors, setWindows, setColumns
}
```

---

## Límite de memoria

```
_maxHistory = 50 snapshots
```

Cada snapshot es una lista de objetos inmutables. Con 100 muros = ~100 instancias de Wall × 50 snapshots = 5000 objetos Wall en memoria. Con Dart's garbage collector esto es manejable, pero cada Wall contiene un `Vector2` (16 bytes), un `String` UUID (36 bytes), más campos doubles. Estimado: ~200 bytes por Wall × 5000 = ~1MB. Aceptable.

---

## Problemas Identificados

### MODERADO
- **`record()` no verifica si el snapshot actual es igual al anterior.** Si se llama `record()` dos veces seguidas sin mutación (bug en el caller), se duplican entradas en el historial consumiendo memoria.
- **`undo/redo` no restaura `projectSettingsProvider`.** Si el usuario cambia el grosor por defecto de muros en settings, luego dibuja un muro, luego hace undo, el muro desaparece pero las settings se mantienen en el nuevo valor. Esto es correcto para settings globales, pero inconsistente para settings que afectan solo la geometría del proyecto.
- **No hay `clear()` llamado al cargar un nuevo proyecto en `_loadProject`.** El historial de un proyecto anterior puede persistir al abrir otro proyecto. Necesita `ref.read(historyProvider.notifier).clear()` en `_loadProject`.

### MENOR
- `HistoryState.past` y `future` son `List<WorkspaceSnapshot>` — listas de Dart. Cada `record()` hace `[...state.past, snapshot]` creando una nueva lista. Para 50 operaciones rápidas esto crea 50 listas. Sería más eficiente usar una estructura de datos mutable con límite (DoubleLinkedQueue).
- `_maxHistory = 50` hardcodeado. Para power users en desktop, 50 pasos puede ser poco. Debería ser configurable en `EditorBehaviorSettings`.
