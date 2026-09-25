# Motor de Persistencia
**Archivos:** `lib/persistence/project_repository.dart`, `levon_archive_service.dart`, `file_storage_service.dart`, `json_serializer.dart`, `autosave_service.dart`

← [[INDEX]]  |  Conectado a: [[engine_state]], [[engine_export]]

---

## Responsabilidad
Persistir proyectos BIM completos en disco de forma offline-first, con soporte de autosave, formato propietario comprimido `.levon` y flujo de exportación multiplataforma.

---

## Formato `.levon`

Archivo ZIP con la siguiente estructura interna:
```
project_<id>.levon (ZIP)
├── project.json      — modelo BIM completo serializado
├── metadata.json     — datos ligeros (id, title, updatedAt, elementCount)
├── preview.png       — miniatura del canvas (opcional)
└── media/            — fotos adjuntas (opcional)
    └── photo_<id>.jpg
```

**Ventaja:** El listado de proyectos (`listProjects`) solo descomprime `metadata.json` de cada archivo, evitando cargar el modelo BIM completo. Máximo rendimiento en la galería.

---

## `ProjectRepository` — Gateway Principal

### Ruta de almacenamiento
```
<documentos del dispositivo>/LevON/projects/project_<id>.levon
```

### API pública
| Método | Descripción |
|--------|-------------|
| `saveProject(project, previewBytes?)` | Serializa + comprime + escribe .levon |
| `loadProject(id)` | Lee .levon + descomprime + deserializa |
| `listProjects()` | Lista lightweight desde metadata.json |
| `deleteProject(id)` | Elimina archivo .levon del disco |
| `exportLevon(project, targetDir)` | Copia .levon a carpeta elegida por usuario |
| `autosaveProject(project)` | saveProject sin lanzar excepciones |

### Flujo de guardado
```
Project entity
  ↓ JsonSerializer.serializeProject() → Map<String,dynamic>
  ↓ JsonSerializer.serializeMetadata() → Map<String,dynamic>
  ↓ _buildMediaEntries() → List<MediaEntry>
  ↓ LevonArchiveService.writeArchive() → escribe .levon (ZIP)
```

### Flujo de carga
```
.levon file
  ↓ LevonArchiveService.readProjectJson() → Map<String,dynamic>
  ↓ jsonEncode(map) → String  ← ⚠️ round-trip innecesario
  ↓ JsonSerializer.deserializeProject(jsonString) → Project
```

---

## `AutosaveService`

Debounce de 30 segundos: cada llamada a `schedule()` cancela el timer anterior y programa uno nuevo. Garantiza que las ediciones rápidas no generen múltiples writes.

```dart
void schedule(project, repository) {
  _debounceTimer?.cancel();
  _debounceTimer = Timer(30s, () => repository.autosaveProject(project));
}
```

**Problema:** El autosave se activa vía `ref.listen<Project?>` en `EditorScreen.initState`. Si el usuario sale del editor sin guardar manualmente y el timer no ha disparado, los cambios de los últimos 30s se pierden. No hay `flush()` en `dispose()` del editor.

**Corrección necesaria:** Llamar `autosaveService.flush(...)` en el dispose de `EditorScreen`.

---

## `JsonSerializer`

Serializa/deserializa todas las entidades del dominio:
- `Wall` → `{id, geometry: {type, ...}, thickness, height, material, isStructural}`
- `ArchitecturalColumn` → `{id, position, shape, dimensionX, dimensionY, height, material}`
- `Door`, `Window`, `Photo` → campos básicos
- `WallElevation` → `{wallId, levels: {coronacion}, chainModeEnabled, openings: [{id, type, xOffset, width, sillHeight, height}]}` ← **nuevo 0.8.0**

**Schema v2.0 (0.8.0):** La sección `elevations[]` fue añadida al schema. El serializador emite `schemaVersion: "2.0"` implícitamente al incluir `elevations`. La deserialización es backwards-compatible: proyectos sin `elevations[]` cargan con `wallElevations: []`. Elevaciones huérfanas (wallId no encontrado entre los muros actuales) son descartadas silenciosamente al deserializar.

**Nota:** El campo `schemaVersion` explícito sigue pendiente como mejora futura (issue C-04 del audit_report). El nuevo `elevations[]` se añadió con tolerancia a ausencia pero sin versioning formal del schema completo.

---

## Problemas Identificados

### CRÍTICO
- **Sin versioning de schema:** Si se añade un campo obligatorio a `Wall` o `Project`, todos los proyectos guardados anteriormente fallarán al cargar. Es el riesgo de pérdida de datos más serio de la aplicación.
- **Pérdida de datos en cierre sin flush:** Si el usuario trabaja 25 segundos y cierra la app, los últimos cambios se pierden. `EditorScreen.dispose()` no llama `autosaveService.flush()`.
- **`autosaveProject` falla silenciosamente:** Los errores de disco (sin espacio, permisos) no se reportan al usuario. El usuario puede pensar que su trabajo está guardado cuando no lo está.

### MODERADO
- **Round-trip JSON innecesario en `loadProject`:** `readProjectJson()` retorna `Map<String,dynamic>`, pero luego se hace `jsonEncode(map)` para pasarlo a `deserializeProject(String)`. El deserializador debería aceptar `Map` directamente.
- **`savePreview` carga el proyecto completo y lo guarda de nuevo** solo para actualizar la miniatura. Sería más eficiente actualizar solo el entry `preview.png` dentro del ZIP sin reescribir `project.json`.
- **Sin checksum/hash del archivo:** No hay verificación de integridad del .levon al cargarlo. Un archivo parcialmente corrompido puede deserializarse con datos incorrectos.

### MENOR
- `_buildMediaEntries` verifica `photo.isEmbedded` pero el campo `Photo.isEmbedded` no es visible en el código de dominio compartido. Dependencia frágil de la convención de nombres de rutas.
- `exportLevon` primero guarda el proyecto y luego lo copia. Si el directorio de destino está en el mismo volumen que el origen, sería más eficiente una copia de archivo sin reescribir el ZIP.
