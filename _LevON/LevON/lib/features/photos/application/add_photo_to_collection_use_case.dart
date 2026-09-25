import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/photos/domain/photo_entity.dart';
import 'package:levon/features/projects/domain/project.dart';

/// Resultado de la operación de añadir foto a una colección.
class AddPhotoResult {
  final Project updatedProject;
  final PhotoCollection updatedCollection;
  final PhotoEntity photo;

  const AddPhotoResult({
    required this.updatedProject,
    required this.updatedCollection,
    required this.photo,
  });
}

/// Caso de uso: añade una [PhotoEntity] a una [PhotoCollection] de un proyecto.
///
/// Operación pura e inmutable. El caller (provider) aplica el resultado.
class AddPhotoToCollectionUseCase {
  const AddPhotoToCollectionUseCase();

  /// Añade [photo] a la colección [collectionId] del [project].
  ///
  /// Si la colección no existe, crea una nueva con código 'PCT000' como fallback.
  AddPhotoResult execute(
    Project project, {
    required String collectionId,
    required PhotoEntity photo,
  }) {
    final existing = project.photoCollections
        .where((c) => c.id == collectionId)
        .firstOrNull;

    final updatedCollection = existing == null
        ? PhotoCollection(
            id: collectionId,
            bimCode: 'PCT000',
            name: 'Registro Fotográfico',
          ).addPhoto(photo)
        : existing.addPhoto(photo);

    final updatedCollections = [
      for (final c in project.photoCollections)
        if (c.id == collectionId) updatedCollection else c,
      if (existing == null) updatedCollection,
    ];

    final updatedProject = project.copyWith(
      photoCollections: updatedCollections,
    );

    return AddPhotoResult(
      updatedProject: updatedProject,
      updatedCollection: updatedCollection,
      photo: photo,
    );
  }
}
