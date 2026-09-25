import 'package:levon/features/photos/domain/photo.dart';
import 'package:levon/features/projects/domain/project.dart';

/// Caso de uso: adjunta una fotografía de campo a un proyecto BIM.
///
/// Crea la entidad [Photo] y retorna el proyecto actualizado.
/// El caller (EditorScreen) es responsable de aplicar el resultado
/// al provider correspondiente y registrar el snapshot de historial.
///
/// DISEÑO: El caso de uso es puro y sin estado. NO muta [Project] directamente
/// porque [Project.photos] es una lista inmutable (List.unmodifiable).
/// En su lugar, retorna el proyecto con la foto ya incorporada vía [copyWith].
class AttachPhotoUseCase {
  const AttachPhotoUseCase();

  /// Crea una [Photo] y retorna el [Project] con la foto adjunta.
  ///
  /// [filePath]: ruta al archivo de imagen en disco (absoluta) o relativa con
  ///   prefijo "media/" para fotos embebidas en el contenedor .levon.
  /// [associatedElementId]: ID del elemento BIM al que se asocia la foto,
  ///   o null si es una foto de contexto general del proyecto.
  /// [description]: texto descriptivo libre de la foto.
  ({Photo photo, Project updatedProject}) execute(
    Project project, {
    required String filePath,
    String? associatedElementId,
    String description = '',
  }) {
    final photo = Photo(
      filePath: filePath,
      associatedElementId: associatedElementId,
      description: description,
    );

    final updatedProject = project.copyWith(
      photos: [...project.photos, photo],
    );

    return (photo: photo, updatedProject: updatedProject);
  }
}
