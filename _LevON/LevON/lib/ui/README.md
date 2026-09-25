# Capa UI — LevON

Contiene todos los componentes de la interfaz de usuario: pantallas, painters del canvas, widgets y la gestión de estado reactivo con Riverpod.

Esta capa puede depender de todas las demás capas, pero **el flujo de datos siempre va hacia arriba**: la UI lee de los providers y llama a use cases; nunca al revés.

---

## Responsabilidad

- Renderizar el canvas BIM y responder a gestos del usuario.
- Gestionar el estado reactivo a través de providers de Riverpod.
- Delegar toda la lógica de negocio a la capa Application (use cases, servicios).

---

## Estructura

### `screens/` — Pantallas principales

| Archivo | Ruta | Descripción |
|---|---|---|
| `projects_screen.dart` | `/projects` | Galería de proyectos guardados en disco |
| `project_workspace_screen.dart` | `/projects/:id/workspaces` | Selector de espacio (planta del edificio) |
| `editor_screen.dart` | `/projects/:id/workspaces/:wid` | Editor BIM principal con canvas interactivo |

---

### `editor/` — Motor de renderizado del canvas

| Archivo | Clase | Descripción |
|---|---|---|
| `editor_controller.dart` | `EditorController` | Lógica de gestos: pan, zoom, dibujo de muros, selección, eliminación |
| `static_layer_painter.dart` | `StaticLayerPainter` | `CustomPainter` para grid, habitaciones, muros y columnas (capa estática) |
| `preview_layer_painter.dart` | `PreviewLayerPainter` | `CustomPainter` para previsualización en tiempo real durante el dibujo |
| `preview_generator.dart` | `PreviewGenerator` | Genera la miniatura PNG del canvas para guardar en el .levon |

**Arquitectura de layers:** el canvas usa dos `RepaintBoundary` para separar la capa estática (que solo se repinta cuando cambia el modelo) de la capa de previsualización (que se repinta a 60 fps durante el dibujo). Esto evita repaints innecesarios del modelo completo mientras el usuario mueve el dedo.

**Sistema de coordenadas:**
- Canvas: píxeles, origen en el centro del widget, Y creciente hacia abajo.
- World: metros, origen en (0,0), Y creciente hacia abajo.
- Transformación: `worldPoint = (screenPoint - center - pan) / scale`.

---

### `state/` — Gestión de estado (Riverpod)

| Archivo | Descripción |
|---|---|
| `providers.dart` | **Todos los providers** del proyecto: muros, columnas, puertas, ventanas, habitaciones, modo editor, selección, persistencia, autosave, export |
| `history_notifier.dart` | `HistoryNotifier`: gestiona el historial de undo/redo con pilas de `WorkspaceSnapshot` |
| `project_settings.dart` | `ProjectSettingsNotifier`: configuración del editor (snap, grid, parámetros por defecto, visualización) |

**Providers clave:**

| Provider | Tipo | Descripción |
|---|---|---|
| `wallsProvider` | `StateNotifierProvider<WallsNotifier, List<Wall>>` | Muros activos en el editor |
| `roomsProvider` | `Provider<List<Room>>` | Habitaciones derivadas (reactivo a `wallsProvider`) |
| `selectedObjectProvider` | `StateProvider<Object?>` | Elemento seleccionado actualmente |
| `editorModeProvider` | `StateProvider<EditorMode>` | Modo activo: view, draw, select, delete |
| `currentProjectSnapshotProvider` | `Provider<Project?>` | Proyecto completo ensamblado en tiempo real |
| `historyProvider` | `StateNotifierProvider<HistoryNotifier, HistoryState>` | Estado del undo/redo |

---

### `widgets/` — Widgets reutilizables

| Archivo | Descripción |
|---|---|
| `properties_panel.dart` | Panel lateral que muestra y permite editar las propiedades del elemento seleccionado |
| `contextual_ribbon.dart` | Barra de herramientas contextual que cambia según el elemento seleccionado |
| `settings/` | Overlay y contenido del panel de ajustes del proyecto |

---

### `theme/` — Sistema de diseño

| Archivo | Clase | Descripción |
|---|---|---|
| `levon_tokens.dart` | `LevonColors` | Paleta de colores (navy, yellow, canvas, feedback) |
| | `LevonRadius` | Radios de borde: xs (4), sm (8), md (12), lg (16), xl (24) |
| | `LevonShadow` | Sombras para cards, floating panels y paneles laterales |
| | `LevonDuration` | Duraciones de animación: fast (150ms), normal (250ms), slow (350ms) |
| | `LevonTheme` | `ThemeData` Material3 completo (appBar, cards, inputs, buttons, tooltips...) |

---

## Flujo de interacción típico

```
Usuario dibuja un muro
    │
    ├─ EditorController._onPanEnd()
    │      ↓ llama a:
    ├─ HistoryNotifier.record(snapshot)      ← guarda para undo
    ├─ CreateWallUseCase.executeStraightWall()
    ├─ WallsNotifier.addWall(wall)           ← actualiza estado
    │
    ↓ Riverpod propaga el cambio
    ├─ roomsProvider recalcula              ← detección automática de habitaciones
    ├─ StaticLayerPainter.paint()           ← repinta canvas
    └─ AutosaveService.schedule()           ← agenda guardado en 30 s
```
