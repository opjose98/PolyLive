import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';

import 'package:levon/features/photos/application/photo_storage_service.dart';

/// Motor de caché de previsualizaciones del SPDS.
///
/// REGLA:
///   Original → resolución completa (copia exacta, NUNCA modificada)
///   Preview  → resolución media (800px max), para vista detalle
///   Thumbnail → resolución ligera (150px max), para grillas/listas
///
/// NO renderizar imágenes originales en grillas para optimizar RAM/GPU.
/// Usar siempre thumbnail en listas y preview en vistas de detalle.
class PreviewCacheService {
  final PhotoStorageService _storage;

  const PreviewCacheService({PhotoStorageService? storage})
      : _storage = storage ?? const PhotoStorageService();

  // ── GENERACIÓN ────────────────────────────────────────────────────────────

  /// Genera preview y thumbnail a partir de la imagen original.
  ///
  /// Retorna las rutas absolutas generadas.
  /// Si la generación falla, retorna null para ese nivel.
  Future<({String? previewPath, String? thumbnailPath})> generateCacheLevels({
    required String originalPath,
    required String projectId,
    required String photoId,
  }) async {
    final [previewPath, thumbnailPath] = await Future.wait([
      _generatePreview(originalPath, projectId, photoId),
      _generateThumbnail(originalPath, projectId, photoId),
    ]);

    return (previewPath: previewPath, thumbnailPath: thumbnailPath);
  }

  /// Genera preview (800px max). Calidad 85.
  Future<String?> _generatePreview(
    String originalPath,
    String projectId,
    String photoId,
  ) async {
    try {
      final destPath = await _storage.previewPath(projectId, photoId);
      final result = await FlutterImageCompress.compressAndGetFile(
        originalPath,
        destPath,
        minWidth: 800,
        minHeight: 600,
        quality: 85,
        format: CompressFormat.jpeg,
      );
      return result?.path;
    } catch (_) {
      // Fallback: copiar original si compress falla
      try {
        final destPath = await _storage.previewPath(projectId, photoId);
        await File(originalPath).copy(destPath);
        return destPath;
      } catch (_) {
        return null;
      }
    }
  }

  /// Genera thumbnail (150px max). Calidad 70.
  Future<String?> _generateThumbnail(
    String originalPath,
    String projectId,
    String photoId,
  ) async {
    try {
      final destPath = await _storage.thumbnailPath(projectId, photoId);
      final result = await FlutterImageCompress.compressAndGetFile(
        originalPath,
        destPath,
        minWidth: 150,
        minHeight: 150,
        quality: 70,
        format: CompressFormat.jpeg,
      );
      return result?.path;
    } catch (_) {
      return null;
    }
  }

  // ── INVALIDACIÓN ──────────────────────────────────────────────────────────

  /// Regenera las miniaturas de una foto existente.
  ///
  /// Útil cuando se actualizan los overlays o se cambia la plantilla.
  Future<({String? previewPath, String? thumbnailPath})> regenerate({
    required String projectId,
    required String photoId,
  }) async {
    final origPath = await _storage.originalPath(projectId, photoId);
    final origFile = File(origPath);
    if (!await origFile.exists()) {
      return (previewPath: null, thumbnailPath: null);
    }

    // Eliminar miniaturas existentes
    await _deleteIfExists(await _storage.previewPath(projectId, photoId));
    await _deleteIfExists(await _storage.thumbnailPath(projectId, photoId));

    return generateCacheLevels(
      originalPath: origPath,
      projectId: projectId,
      photoId: photoId,
    );
  }

  // ── VALIDACIÓN ────────────────────────────────────────────────────────────

  /// Verifica si las miniaturas de caché están disponibles.
  Future<bool> hasCacheLevels(String projectId, String photoId) async {
    final previewPath = await _storage.previewPath(projectId, photoId);
    final thumbnailPath = await _storage.thumbnailPath(projectId, photoId);
    return await File(previewPath).exists() &&
        await File(thumbnailPath).exists();
  }

  Future<void> _deleteIfExists(String path) async {
    final f = File(path);
    if (await f.exists()) await f.delete();
  }
}
