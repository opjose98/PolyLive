import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/persistence/json_serializer.dart';
import 'package:levon/persistence/file_storage_service.dart';
import 'package:levon/persistence/levon_archive_service.dart';

/// Gateway de persistencia para entidades [Project].
///
/// Sigue el patrón Repository: los callers trabajan exclusivamente con objetos
/// de dominio; todos los detalles de I/O (formato .levon, compresión ZIP,
/// rutas de disco) quedan encapsulados aquí.
///
/// Ruta de almacenamiento:
///   <documentos>/LevON/projects/project_<id>.levon
///
/// Flujo de guardado:
///   Project → JsonSerializer.serializeProject() → LevonArchiveService.writeArchive()
///
/// Flujo de carga:
///   .levon → LevonArchiveService.readProjectJson() → JsonSerializer.deserializeProject()
class ProjectRepository {
  final JsonSerializer _serializer;
  final FileStorageService _storage;
  final LevonArchiveService _archive;

  ProjectRepository({
    JsonSerializer? serializer,
    FileStorageService? storage,
    LevonArchiveService? archiveService,
  })  : _serializer = serializer ?? JsonSerializer(),
        _storage = storage ?? FileStorageService(),
        _archive = archiveService ?? LevonArchiveService();

  // ── SAVE ───────────────────────────────────────────────────────────────────

  /// Persiste [project] como contenedor .levon, sobreescribiendo cualquier
  /// archivo existente para el mismo id.
  ///
  /// [previewBytes] es la miniatura PNG del canvas; si es null no se incluye
  /// `preview.png` en el contenedor (se puede añadir después vía [savePreview]).
  ///
  /// Lanza [ProjectSaveException] ante cualquier fallo de I/O o serialización.
  Future<void> saveProject(
    Project project, {
    Uint8List? previewBytes,
  }) async {
    try {
      final file = await _storage.levonFile(project.id);
      final projectJson = _serializer.serializeProject(project);
      final metadataJson = _serializer.serializeMetadata(project);

      // Construir lista de entradas de media desde las fotos embebidas.
      // Sólo se incluyen fotos con rutas relativas (ya copiadas al contenedor).
      final mediaEntries = await _buildMediaEntries(project);

      await _archive.writeArchive(
        levonFile: file,
        projectJson: projectJson,
        metadataJson: metadataJson,
        previewBytes: previewBytes,
        mediaFiles: mediaEntries,
      );
    } on LevonArchiveWriteException catch (e) {
      throw ProjectSaveException(project.id, e);
    } on IOException catch (e) {
      throw ProjectSaveException(project.id, e);
    }
  }

  /// Actualiza únicamente la miniatura preview de un proyecto ya guardado.
  ///
  /// Para no reescribir el modelo completo cuando sólo cambia la preview,
  /// se carga el JSON existente y se reescribe el archivo con los nuevos bytes.
  Future<void> savePreview(String projectId, Uint8List previewBytes) async {
    final project = await loadProject(projectId);
    await saveProject(project, previewBytes: previewBytes);
  }

  // ── LOAD ───────────────────────────────────────────────────────────────────

  /// Lee y deserializa el proyecto con el [id] dado.
  ///
  /// Detecta automáticamente la versión del schema (v1.0 o v2.0) y migra
  /// el modelo si es necesario.
  ///
  /// Lanza [ProjectNotFoundException] si el archivo .levon no existe.
  /// Lanza [ProjectLoadException] ante fallo de I/O o parsing.
  Future<Project> loadProject(String id) async {
    final file = await _storage.levonFile(id);
    if (!await file.exists()) throw ProjectNotFoundException(id);
    try {
      final jsonMap = await _archive.readProjectJson(file);
      // Reconvertir a string para reutilizar el deserializador existente.
      // Alternativa futura: deserializar directamente desde Map para evitar
      // el round-trip JSON; por ahora mantiene el deserializador centralizado.
      final jsonString = _mapToJsonString(jsonMap);
      return _serializer.deserializeProject(jsonString);
    } on LevonArchiveReadException catch (e) {
      throw ProjectLoadException(id, e);
    } on FormatException catch (e) {
      throw ProjectLoadException(id, e);
    } on IOException catch (e) {
      throw ProjectLoadException(id, e);
    }
  }

  // ── LIST ───────────────────────────────────────────────────────────────────

  /// Retorna descriptores ligeros de todos los proyectos guardados en disco.
  ///
  /// Lee sólo `metadata.json` de cada .levon, evitando deserializar el modelo
  /// BIM completo. Los archivos corruptos se omiten silenciosamente.
  Future<List<ProjectSummary>> listProjects() async {
    final files = await _storage.listLevonFiles();
    final summaries = <ProjectSummary>[];

    for (final file in files) {
      try {
        final meta = await _archive.readMetadata(file);
        final previewBytes = await _archive.readPreview(file);
        summaries.add(ProjectSummary(
          id: meta['id'] as String,
          title: meta['title'] as String,
          bimCode: meta['bimCode'] as String?,
          description: (meta['description'] as String?) ?? '',
          discipline: (meta['discipline'] as String?) ?? '',
          updatedAt: DateTime.parse(meta['updatedAt'] as String),
          filePath: file.path,
          elementCount: (meta['elementCount'] as num?)?.toInt() ?? 0,
          previewBytes: previewBytes,
        ));
      } catch (_) {
        // Archivo corrupto o formato desconocido — no crashear el listado.
      }
    }
    return summaries;
  }

  // ── DELETE ─────────────────────────────────────────────────────────────────

  /// Elimina permanentemente el archivo .levon del proyecto [id].
  ///
  /// No-op si el archivo no existe.
  Future<void> deleteProject(String id) async {
    final file = await _storage.levonFile(id);
    if (await file.exists()) await file.delete();
  }

  // ── EXPORT LEVON ────────────────────────────────────────────────────────────

  /// Exporta el archivo .levon nativo del proyecto al directorio [targetDirectory].
  ///
  /// El archivo resultante contiene el modelo BIM completo, metadata y media,
  /// listo para compartir entre dispositivos o continuar edición posteriormente.
  ///
  /// Si el proyecto aún no está guardado en disco, lo guarda primero.
  ///
  /// Retorna la ruta del archivo .levon copiado al destino.
  /// Lanza [ProjectSaveException] si no se puede guardar o copiar.
  Future<String> exportLevon(Project project,
      {required String targetDirectory}) async {
    // Asegurar que el proyecto está guardado antes de copiar
    await saveProject(project);

    final srcFile = await _storage.levonFile(project.id);
    if (!await srcFile.exists()) {
      throw ProjectSaveException(
          project.id, 'Archivo fuente .levon no encontrado tras guardar');
    }

    final sanitized =
        project.title.replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '_').trim();
    final destPath =
        '$targetDirectory${Platform.pathSeparator}$sanitized.levon';
    final destFile = File(destPath);

    try {
      await srcFile.copy(destFile.path);
      return destFile.path;
    } on IOException catch (e) {
      throw ProjectSaveException(project.id, e);
    }
  }

  // ── EXISTS ─────────────────────────────────────────────────────────────────

  Future<bool> projectExists(String id) async {
    final file = await _storage.levonFile(id);
    return file.exists();
  }

  // ── AUTOSAVE ───────────────────────────────────────────────────────────────

  /// Guardado silencioso sin preview ni feedback visual.
  ///
  /// Diseñado para ser llamado desde [AutosaveService] con debounce de 30s.
  /// No lanza excepciones hacia arriba — los fallos de autosave se registran
  /// silenciosamente para no interrumpir la sesión de trabajo del usuario.
  Future<void> autosaveProject(Project project) async {
    try {
      await saveProject(project);
    } catch (_) {
      // Fallo silencioso en autosave: el usuario puede guardar manualmente.
    }
  }

  // ── MEDIA ──────────────────────────────────────────────────────────────────

  /// Extrae un archivo de media del .levon a un directorio temporal.
  ///
  /// Retorna el [File] en el directorio temporal listo para visualización.
  /// El caller es responsable de eliminar el temporal cuando ya no lo necesite.
  Future<File> extractMediaToTemp(
    String projectId,
    String relativePath,
  ) async {
    final file = await _storage.levonFile(projectId);
    final tempDir = await Directory.systemTemp.createTemp('levon_media_');
    return _archive.extractMedia(file, relativePath, tempDir);
  }

  // ── PRIVADOS ───────────────────────────────────────────────────────────────

  /// Construye las entradas de media a embeber en el .levon.
  ///
  /// Incluye:
  /// - Fotos legacy (Photo.isEmbedded) con ruta relativa ya asignada.
  /// - Fotos SPDS (PhotoEntity) de todas las PhotoCollections del proyecto.
  ///   Cada foto se embebe en tres resoluciones: original, preview, thumbnail.
  Future<List<MediaEntry>> _buildMediaEntries(Project project) async {
    final entries = <MediaEntry>[];

    // ── Legacy photos ─────────────────────────────────────────────────────
    for (final photo in project.photos) {
      if (!photo.isEmbedded) continue;
      final tempFile = File(photo.filePath);
      if (await tempFile.exists()) {
        entries.add(MediaEntry(
          relativePath: photo.filePath,
          bytes: await tempFile.readAsBytes(),
        ));
      }
    }

    // ── SPDS PhotoEntity images ───────────────────────────────────────────
    for (final collection in project.photoCollections) {
      for (final photo in collection.photos) {
        await _embedFile(
          entries,
          photo.originalImagePath,
          'photos/${photo.id}/original.jpg',
        );
        if (photo.previewImagePath != null) {
          await _embedFile(
            entries,
            photo.previewImagePath!,
            'photos/${photo.id}/preview.jpg',
          );
        }
        if (photo.thumbnailPath != null) {
          await _embedFile(
            entries,
            photo.thumbnailPath!,
            'photos/${photo.id}/thumb.jpg',
          );
        }
      }
    }

    return entries;
  }

  Future<void> _embedFile(
    List<MediaEntry> entries,
    String absolutePath,
    String relativePath,
  ) async {
    final file = File(absolutePath);
    if (await file.exists()) {
      entries.add(MediaEntry(
        relativePath: relativePath,
        bytes: await file.readAsBytes(),
      ));
    }
  }

  String _mapToJsonString(Map<String, dynamic> map) => jsonEncode(map);
}

// ── VALUE OBJECTS ──────────────────────────────────────────────────────────────

/// Descriptor ligero de proyecto para la pantalla de listado.
///
/// Cargado desde `metadata.json` sin deserializar el modelo BIM completo.
class ProjectSummary {
  final String id;
  final String title;

  /// Código BIM del proyecto. Null en proyectos legacy sin código asignado.
  final String? bimCode;

  /// Descripción breve del proyecto.
  final String description;

  /// Disciplina BIM principal.
  final String discipline;

  final DateTime updatedAt;
  final String filePath;

  /// Número de elementos BIM (muros + columnas + puertas + ventanas).
  final int elementCount;

  /// Bytes de la miniatura PNG para mostrar en la grilla de proyectos.
  /// Null si el proyecto no tiene preview generada todavía.
  final Uint8List? previewBytes;

  const ProjectSummary({
    required this.id,
    required this.title,
    this.bimCode,
    this.description = '',
    this.discipline = '',
    required this.updatedAt,
    required this.filePath,
    this.elementCount = 0,
    this.previewBytes,
  });
}

// ── EXCEPCIONES ─────────────────────────────────────────────────────────────────

class ProjectNotFoundException implements Exception {
  final String id;
  const ProjectNotFoundException(this.id);
  @override
  String toString() =>
      'ProjectNotFoundException: no .levon encontrado para id=$id';
}

class ProjectSaveException implements Exception {
  final String id;
  final Object cause;
  const ProjectSaveException(this.id, this.cause);
  @override
  String toString() => 'ProjectSaveException(id=$id): $cause';
}

class ProjectLoadException implements Exception {
  final String id;
  final Object cause;
  const ProjectLoadException(this.id, this.cause);
  @override
  String toString() => 'ProjectLoadException(id=$id): $cause';
}
