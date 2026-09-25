# Arquitectura del Sistema (LevON)

LevON sigue de manera estricta los principios de **Clean Architecture**, asegurando que la lógica central matemática y de BIM (Domain) sea completamente agnóstica de frameworks, persistencia o UI.

## Capas Arquitectónicas

1.  **Domain (`lib/domain/`)**
    *   **Entities:** `Project`, `Wall`, `Room`, `Door`, `Window`. Modelos inmutables de datos puros.
    *   **Graph/Topology:** Lógica para nodos y grafos geométricos.
    *   **Regla de Oro:** NUNCA importar `package:flutter` (excepto quizá `dart:ui` `Offset` por eficiencia, pero se prefiere `vector_math` `Vector2`). NUNCA importar dependencias de infraestructura.

2.  **Application (`lib/application/`)**
    *   **Use Cases:** Contienen la lógica de negocio coordinada. Ejemplo: `DetectRoomsUseCase`, `WallIntersectionService`.
    *   **Services:** Lógica operativa abstracta.

3.  **Persistence / Infrastructure (`lib/persistence/` y `lib/export/`)**
    *   **FileStorageService:** I/O directo del sistema operativo.
    *   **LevonArchiveService:** Compresión ZIP para manejar archivos `.levon`.
    *   **ProjectRepository:** Adapta y serializa/deserializa (JSON) las entidades del Domain para ser almacenadas.
    *   **Exporters:** `DxfExporter`, `IfcExportAdapter`.

4.  **UI (`lib/ui/`)**
    *   **Widgets & Screens:** Flutter UI components.
    *   **State (`lib/ui/state/`):** Riverpod Providers. Conectan la UI con Application y Persistence. La UI *escucha* el estado, pero *nunca* calcula intersecciones ni lógica de negocio compleja.
    *   **Canvas (`lib/ui/widgets/canvas/`):** Capa intensiva de renderizado 2D `CustomPainter`.

## Flujo de Datos

1.  El usuario interactúa con el Canvas (ej. Drag para dibujar un muro).
2.  El evento actualiza un Provider temporal en `lib/ui/state/`.
3.  Al finalizar el gesto, se llama a un UseCase en la capa Application.
4.  El UseCase calcula intersecciones usando el motor geométrico.
5.  Se genera un nuevo estado inmutable de `Project` o lista de `Walls`.
6.  El StateNotifier (Riverpod) actualiza su estado.
7.  El Canvas reacciona reactivamente al nuevo estado y redibuja.
8.  En background, el `AutosaveService` detecta el cambio en el estado del proyecto y persiste un nuevo archivo `.levon` en disco de forma asíncrona.
