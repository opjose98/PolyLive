# Capa Application — LevON

Contiene los **casos de uso** y **servicios de aplicación** que orquestan la lógica entre la capa de dominio y la UI.

Esta capa puede depender de `domain/` y `geometry/`, pero **no debe importar nada de `ui/`** (sin referencias a widgets, BuildContext, Riverpod providers, etc.).

---

## Responsabilidad

- Orquestar operaciones de negocio que involucran múltiples entidades o capas.
- Mantener los use cases **sin estado** (clases `const`) para que sean fácilmente testeables.
- Proveer servicios reutilizables sin acoplamiento a la UI.

---

## Casos de uso (`use_cases/`)

| Archivo | Clase | Descripción |
|---|---|---|
| `detect_rooms_use_case.dart` | `DetectRoomsUseCase` | Orquesta muros → grafo → ciclos → habitaciones. Llamado por `roomsProvider`. |
| `create_wall_use_case.dart` | `CreateWallUseCase` | Crea un `Wall` recto validando longitud mínima. Retorna `null` si es degenerado. |
| `create_room_use_case.dart` | `CreateRoomUseCase` | Crea una `Room` desde muros seleccionados manualmente. |
| `attach_photo_use_case.dart` | `AttachPhotoUseCase` | Crea una `Photo` y retorna el `Project` actualizado (inmutable). |
| `validate_geometry_use_case.dart` | `ValidateGeometryUseCase` | Verifica si una secuencia de muros forma un polígono cerrado. |

---

## Servicios (`services/`)

| Archivo | Clase | Descripción |
|---|---|---|
| `selection_service.dart` | `SelectionService` | Hit-testing de muros, columnas y habitaciones en coordenadas mundo. Prioridad: Wall > Column > Room. |
| `global_prefs_service.dart` | `GlobalPrefsService` | Lee y escribe preferencias globales (rutas por defecto) vía `SharedPreferences`. |

---

## Reglas de diseño

- **Sin estado**: los use cases son `const` — un único instancia compartida funciona correctamente.
- **Retorno inmutable**: los use cases devuelven nuevas instancias o `null`, nunca mutan el estado recibido.
- **Sin Riverpod**: los use cases no leen ni escriben providers. El caller (EditorController o un provider derivado) es responsable de propagar el resultado al estado global.
- **Sin Flutter**: todos los archivos de esta capa son Dart puro, testeables sin `flutter_test`.

---

## Patrón de uso (EditorController)

```dart
// 1. Guardar snapshot antes de mutar
ref.read(historyProvider.notifier).record(currentSnapshot);

// 2. Ejecutar el use case
final wall = const CreateWallUseCase().executeStraightWall(
  start: drawStart,
  end: worldPoint,
);
if (wall == null) return;

// 3. Actualizar el estado global
ref.read(wallsProvider.notifier).addWall(wall);

// 4. El autosave se agenda automáticamente vía ref.listen en EditorScreen
```
