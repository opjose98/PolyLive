import 'package:image_picker/image_picker.dart';

import 'package:levon/features/photos/domain/photo_entity.dart';
import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/bim/services/photo_bim_code_generator.dart';
import 'package:levon/features/photos/application/photo_permission_service.dart';
import 'package:levon/features/photos/application/photo_metadata_service.dart';
import 'package:levon/features/photos/application/photo_storage_service.dart';
import 'package:levon/features/viewport/preview_cache_service.dart';

/// Resultado de una operación de captura fotográfica.
sealed class PhotoCaptureResult {}

class PhotoCaptureSuccess extends PhotoCaptureResult {
  final PhotoEntity photo;
  PhotoCaptureSuccess(this.photo);
}

class PhotoCaptureCancelled extends PhotoCaptureResult {
  PhotoCaptureCancelled();
}

class PhotoCaptureError extends PhotoCaptureResult {
  final String message;
  PhotoCaptureError(this.message);
}

class PhotoCapturePermissionDenied extends PhotoCaptureResult {
  final PhotoPermissionCategory category;
  PhotoCapturePermissionDenied(this.category);
}

/// Motor de captura fotográfica del SPDS.
///
/// Orquesta: permisos → captura → persistencia → metadata → cache.
///
/// REGLA: La imagen original NUNCA se modifica.
/// Se copia al directorio original del proyecto y el XFile original se descarta.
class PhotoCaptureService {
  final ImagePicker _picker;
  final PhotoPermissionService _permissions;
  final PhotoMetadataService _metadata;
  final PhotoStorageService _storage;
  final PreviewCacheService _cache;
  final PhotoBimCodeGenerator _codeGen;

  PhotoCaptureService({
    ImagePicker? picker,
    PhotoPermissionService? permissions,
    PhotoMetadataService? metadata,
    PhotoStorageService? storage,
    PreviewCacheService? cache,
    PhotoBimCodeGenerator? codeGen,
  })  : _picker = picker ?? ImagePicker(),
        _permissions = permissions ?? const PhotoPermissionService(),
        _metadata = metadata ?? const PhotoMetadataService(),
        _storage = storage ?? const PhotoStorageService(),
        _cache = cache ?? const PreviewCacheService(),
        _codeGen = codeGen ?? const PhotoBimCodeGenerator();

  // ── CÁMARA ────────────────────────────────────────────────────────────────

  /// Captura una foto con la cámara del dispositivo.
  ///
  /// Solicita permisos contextualmente antes de abrir la cámara.
  Future<PhotoCaptureResult> captureFromCamera({
    required String projectId,
    required PhotoCollection collection,
  }) async {
    // 1. Verificar y solicitar permiso de cámara
    final camResult = await _permissions.requestCameraPermission();
    if (camResult == PermissionResult.permanentlyDenied ||
        camResult == PermissionResult.denied) {
      return PhotoCapturePermissionDenied(PhotoPermissionCategory.camera);
    }

    // 2. Capturar imagen
    XFile? file;
    try {
      file = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 95, // Alta calidad — preservar detalle para BIM
        preferredCameraDevice: CameraDevice.rear,
      );
    } catch (e) {
      return PhotoCaptureError('Error al abrir la cámara: $e');
    }

    if (file == null) return PhotoCaptureCancelled();

    return _processPickedFile(
      file: file,
      projectId: projectId,
      collection: collection,
    );
  }

  // ── GALERÍA ───────────────────────────────────────────────────────────────

  /// Selecciona una o más fotos desde la galería del dispositivo.
  Future<PhotoCaptureResult> pickFromGallery({
    required String projectId,
    required PhotoCollection collection,
  }) async {
    // 1. Verificar y solicitar permiso de media
    final mediaResult = await _permissions.requestMediaPermission();
    if (mediaResult == PermissionResult.permanentlyDenied ||
        mediaResult == PermissionResult.denied) {
      return PhotoCapturePermissionDenied(PhotoPermissionCategory.media);
    }

    // 2. Abrir selector de galería
    XFile? file;
    try {
      file = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 100, // Sin compresión adicional desde galería
      );
    } catch (e) {
      return PhotoCaptureError('Error al abrir la galería: $e');
    }

    if (file == null) return PhotoCaptureCancelled();

    return _processPickedFile(
      file: file,
      projectId: projectId,
      collection: collection,
    );
  }

  /// Selecciona múltiples fotos desde la galería.
  Future<List<PhotoCaptureResult>> pickMultipleFromGallery({
    required String projectId,
    required PhotoCollection collection,
  }) async {
    final mediaResult = await _permissions.requestMediaPermission();
    if (mediaResult == PermissionResult.permanentlyDenied ||
        mediaResult == PermissionResult.denied) {
      return [PhotoCapturePermissionDenied(PhotoPermissionCategory.media)];
    }

    List<XFile> files = [];
    try {
      files = await _picker.pickMultiImage(imageQuality: 100);
    } catch (e) {
      return [PhotoCaptureError('Error al abrir la galería: $e')];
    }

    if (files.isEmpty) return [PhotoCaptureCancelled()];

    // Procesar en secuencia para no saturar el sistema de archivos
    final results = <PhotoCaptureResult>[];
    var workingCollection = collection;
    for (final file in files) {
      final result = await _processPickedFile(
        file: file,
        projectId: projectId,
        collection: workingCollection,
      );
      results.add(result);
      if (result is PhotoCaptureSuccess) {
        workingCollection = workingCollection.addPhoto(result.photo);
      }
    }
    return results;
  }

  // ── PROCESAMIENTO INTERNO ─────────────────────────────────────────────────

  Future<PhotoCaptureResult> _processPickedFile({
    required XFile file,
    required String projectId,
    required PhotoCollection collection,
  }) async {
    try {
      // Generar ID y código BIM únicos
      final photoId = 'photo-${DateTime.now().millisecondsSinceEpoch}';
      final bimCode = _codeGen.generatePhotoCodeGlobal([collection]);
      final photoName =
          file.name.isNotEmpty ? _sanitizeName(file.name) : 'Foto $bimCode';

      // Copiar imagen original al directorio del proyecto (INMUTABLE)
      final copied = await _storage.copyToOriginal(
        sourcePath: file.path,
        projectId: projectId,
        photoId: photoId,
      );

      // Generar preview y thumbnail en background
      final cachePaths = await _cache.generateCacheLevels(
        originalPath: copied.path,
        projectId: projectId,
        photoId: photoId,
      );

      // Capturar metadata (GPS + orientación + EXIF)
      final capturedMetadata = await _metadata.captureMetadata(
        imagePath: copied.path,
        includeLocation: true,
        includeOrientation: true,
      );

      // Construir entidad BIM
      // overlayConfiguration se inicializa desde el template para que cada
      // foto tenga su propia copia editable de forma no-destructiva.
      final template = OverlayTemplate.defaultInspection();
      final photo = PhotoEntity(
        id: photoId,
        bimCode: bimCode,
        name: photoName,
        originalImagePath: copied.path,
        previewImagePath: cachePaths.previewPath,
        thumbnailPath: cachePaths.thumbnailPath,
        captureMetadata: capturedMetadata,
        orientationData: capturedMetadata.orientation,
        collectionId: collection.id,
        templateData: template,
        overlayConfiguration: template.overlays,
      );

      return PhotoCaptureSuccess(photo);
    } catch (e) {
      return PhotoCaptureError('Error procesando imagen: $e');
    }
  }

  String _sanitizeName(String filename) {
    // Eliminar extensión y caracteres no imprimibles
    final noExt = filename.contains('.')
        ? filename.substring(0, filename.lastIndexOf('.'))
        : filename;
    return noExt.replaceAll(RegExp(r'[^\w\s\-áéíóúÁÉÍÓÚñÑ]'), ' ').trim();
  }
}
