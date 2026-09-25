import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// Gestiona la estructura de carpetas de almacenamiento de fotos por proyecto.
///
/// Estructura en disco:
///   {appDocuments}/levon_projects/{projectId}/
///     photos/
///       original/     ← imagen original inmutable (resolución completa)
///       preview/      ← resolución media (800px max, para vista detalle)
///       thumbnail/    ← resolución ligera (150px max, para grillas)
///       overlay/      ← overlays rasterizados bajo demanda (caché)
///       annotation/   ← anotaciones exportadas (caché)
///     cache/          ← datos temporales del proyecto
///
/// IMPORTANTE: Las rutas almacenadas en PhotoEntity son RELATIVAS al directorio
/// del proyecto para garantizar portabilidad. La resolución a ruta absoluta
/// se hace siempre a través de este servicio.
class PhotoStorageService {
  const PhotoStorageService();

  // ── DIRECTORIOS ───────────────────────────────────────────────────────────

  Future<Directory> projectDir(String projectId) async {
    final base = await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/levon_projects/$projectId');
    await dir.create(recursive: true);
    return dir;
  }

  Future<Directory> _subDir(String projectId, String sub) async {
    final proj = await projectDir(projectId);
    final dir = Directory('${proj.path}/$sub');
    await dir.create(recursive: true);
    return dir;
  }

  Future<Directory> originalDir(String projectId) => _subDir(projectId, 'photos/original');
  Future<Directory> previewDir(String projectId) => _subDir(projectId, 'photos/preview');
  Future<Directory> thumbnailDir(String projectId) => _subDir(projectId, 'photos/thumbnail');
  Future<Directory> overlayDir(String projectId) => _subDir(projectId, 'photos/overlay');
  Future<Directory> cacheDir(String projectId) => _subDir(projectId, 'cache');

  // ── RUTAS DE ARCHIVO ──────────────────────────────────────────────────────

  Future<String> originalPath(String projectId, String photoId) async {
    final dir = await originalDir(projectId);
    return '${dir.path}/$photoId.jpg';
  }

  Future<String> previewPath(String projectId, String photoId) async {
    final dir = await previewDir(projectId);
    return '${dir.path}/${photoId}_preview.jpg';
  }

  Future<String> thumbnailPath(String projectId, String photoId) async {
    final dir = await thumbnailDir(projectId);
    return '${dir.path}/${photoId}_thumb.jpg';
  }

  // ── RUTAS RELATIVAS (persistidas en PhotoEntity) ──────────────────────────

  /// Convierte una ruta absoluta a ruta relativa respecto al directorio del proyecto.
  Future<String> toRelativePath(String projectId, String absolutePath) async {
    final proj = await projectDir(projectId);
    if (absolutePath.startsWith(proj.path)) {
      return absolutePath.substring(proj.path.length + 1);
    }
    return absolutePath;
  }

  /// Resuelve una ruta relativa a su ruta absoluta en disco.
  Future<String> toAbsolutePath(String projectId, String relativePath) async {
    if (relativePath.startsWith('/') || relativePath.contains(':\\')) {
      return relativePath; // ya es absoluta
    }
    final proj = await projectDir(projectId);
    return '${proj.path}/$relativePath';
  }

  // ── OPERACIONES DE ARCHIVO ────────────────────────────────────────────────

  /// Copia la imagen fuente al directorio original del proyecto.
  ///
  /// La imagen ORIGINAL nunca se modifica — siempre se copia, nunca se mueve.
  Future<File> copyToOriginal({
    required String sourcePath,
    required String projectId,
    required String photoId,
  }) async {
    final dest = await originalPath(projectId, photoId);
    final source = File(sourcePath);
    return source.copy(dest);
  }

  /// Elimina todos los archivos de una foto (original, preview, thumbnail).
  Future<void> deletePhotoFiles({
    required String projectId,
    required String photoId,
  }) async {
    await _deleteIfExists(await originalPath(projectId, photoId));
    await _deleteIfExists(await previewPath(projectId, photoId));
    await _deleteIfExists(await thumbnailPath(projectId, photoId));
  }

  /// Verifica si existe el archivo original de una foto.
  Future<bool> originalExists(String projectId, String photoId) async {
    final path = await originalPath(projectId, photoId);
    return File(path).exists();
  }

  Future<void> _deleteIfExists(String path) async {
    final f = File(path);
    if (await f.exists()) await f.delete();
  }

  // ── LIMPIEZA ──────────────────────────────────────────────────────────────

  /// Elimina el directorio de caché del proyecto.
  Future<void> clearCache(String projectId) async {
    final dir = await cacheDir(projectId);
    if (await dir.exists()) {
      await dir.delete(recursive: true);
    }
  }
}
