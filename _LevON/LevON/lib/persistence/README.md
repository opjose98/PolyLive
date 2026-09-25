# Capa Persistence — LevON

Encapsula toda la lógica de **I/O de proyectos**: serialización, formato de archivo, rutas en disco y guardado automático.

La UI y los use cases trabajan exclusivamente con objetos de dominio (`Project`, `Wall`, etc.) y nunca con JSON, ZIP ni rutas de disco directamente.

---

## Responsabilidad

- Convertir el modelo de dominio BIM ↔ JSON (serialización/deserialización).
- Gestionar el contenedor de archivo `.levon` (formato ZIP).
- Abstraer las rutas del sistema de archivos para todas las plataformas.
- Proveer un guardado automático no intrusivo con debounce.

---

## Archivos

| Archivo | Clase | Descripción |
|---|---|---|
| `project_repository.dart` | `ProjectRepository` | **Gateway principal**. `saveProject`, `loadProject`, `listProjects`, `deleteProject`, `exportLevon` |
| `json_serializer.dart` | `JsonSerializer` | Serialización/deserialización BIM. Soporta schema v1.0 y v2.0 |
| `levon_archive_service.dart` | `LevonArchiveService` | Lectura y escritura del contenedor ZIP `.levon` con escritura atómica |
| `file_storage_service.dart` | `FileStorageService` | Resolución de rutas: `<Documentos>/LevON/projects/project_<id>.levon` |
| `autosave_service.dart` | `AutosaveService` | Guardado automático con debounce de 30 segundos |

---

## Formato `.levon`

Un archivo `.levon` es un ZIP con la siguiente estructura interna:

```
proyecto.levon (ZIP)
├── project.json    ← Modelo BIM completo (muros, columnas, puertas, ventanas, fotos)
├── metadata.json   ← Descriptor ligero: id, title, updatedAt, elementCount
├── preview.png     ← Miniatura PNG del canvas (opcional)
└── media/
    └── <photo_id>.<ext>   ← Fotografías embebidas con rutas relativas
```

**Escritura atómica:** se escribe primero a `<archivo>.levon.tmp` y luego se renombra al destino final. Esto evita que una interrupción (cierre forzado, batería agotada) genere un archivo corrupto.

---

## Schema JSON — versión 2.0

```json
{
  "version": "2.0",
  "project": { "id": "...", "title": "...", "units": "meters", ... },
  "storeys": [{ "id": "ground", "name": "Planta Baja", "elevation": 0.0 }],
  "elements": [
    { "id": "...", "type": "Wall|Partition|Column|Door|Window", "geometry": {...}, "properties": {...} }
  ],
  "relations": [
    { "type": "HostedBy", "elementId": "...", "hostId": "...", "positionFromStart": 1.5 }
  ],
  "media": [
    { "id": "...", "relativePath": "media/foto.jpg", ... }
  ]
}
```

**Migración v1.0 → v2.0:** si `"version": "1.0"`, el deserializador detecta el schema antiguo y migra automáticamente sin pérdida de datos.

---

## Excepciones

| Clase | Cuándo se lanza |
|---|---|
| `ProjectNotFoundException` | Archivo `.levon` no encontrado para el ID dado |
| `ProjectSaveException` | Fallo de I/O o serialización al guardar |
| `ProjectLoadException` | Fallo de I/O o parsing al cargar |
| `LevonArchiveWriteException` | Fallo al escribir el ZIP |
| `LevonArchiveReadException` | ZIP corrupto o entry no encontrado |

---

## AutosaveService — debounce

```
EditorScreen escucha currentProjectSnapshotProvider
    → cada cambio → autosaveService.schedule(project, repository)
    → cancela el timer anterior e inicia uno nuevo de 30 s
    → si el usuario sigue editando: el timer se reinicia
    → si el usuario para 30 s: se ejecuta saveProject()
    → fallo silencioso: no interrumpe la sesión de trabajo
```

Al cerrar el editor se debe llamar `autosaveService.flush()` para guardar inmediatamente sin esperar el debounce.
