import 'package:levon/features/projects/domain/project.dart';

/// Caso de uso: elimina una [PhotoEntity] de una [PhotoCollection].
///
/// Operación pura e inmutable. El caller también debe eliminar los archivos
/// físicos mediante [PhotoStorageService.deletePhotoFiles].
class RemovePhotoUseCase {
  const RemovePhotoUseCase();

  /// Elimina la foto [photoId] de la colección [collectionId] del [project].
  /// Siempre elimina en cascada los [PhotoMarkerEntity] vinculados a [photoId].
  Project execute(
    Project project, {
    required String collectionId,
    required String photoId,
  }) {
    final updatedCollections = [
      for (final c in project.photoCollections)
        if (c.id == collectionId) c.removePhoto(photoId) else c,
    ];
    final updatedMarkers = project.photoMarkers
        .where((m) => m.linkedPhotoId != photoId)
        .toList();
    return project.copyWith(
      photoCollections: updatedCollections,
      photoMarkers: updatedMarkers,
    );
  }

  /// Elimina la colección completa [collectionId] del proyecto.
  Project removeCollection(Project project, {required String collectionId}) {
    return project.copyWith(
      photoCollections: project.photoCollections
          .where((c) => c.id != collectionId)
          .toList(),
    );
  }
}
