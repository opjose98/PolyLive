import 'package:uuid/uuid.dart';

/// Entidad que representa una fotografía de campo adjunta al levantamiento.
///
/// Las fotos sirven como evidencia fotográfica del estado real del edificio
/// y se pueden asociar a elementos BIM específicos (muros, columnas, etc.)
/// o ser de contexto general (sin asociación a ningún elemento).
///
/// ALMACENAMIENTO:
///   - Fotos embebidas: ruta relativa con prefijo "media/" → guardadas dentro
///     del contenedor .levon. Identificadas por [isEmbedded] = true.
///   - Fotos externas: ruta absoluta del sistema de archivos → no se incluyen
///     en el .levon al exportar. [isEmbedded] = false.
class Photo {
  /// Identificador único inmutable de la foto (UUID v4).
  final String id;

  /// Ruta al archivo de imagen.
  ///
  /// - Si comienza con "media/": ruta relativa dentro del contenedor .levon.
  /// - En cualquier otro caso: ruta absoluta en el sistema de archivos local.
  final String filePath;

  /// ID del elemento BIM al que está asociada esta foto, o null si es una
  /// fotografía de contexto general del proyecto.
  final String? associatedElementId;

  /// Fecha y hora de captura de la fotografía. Por defecto, el momento
  /// en que se adjunta al proyecto.
  final DateTime capturedAt;

  /// Descripción libre de la fotografía (ángulo, detalle, observaciones).
  final String description;

  Photo({
    String? id,
    required this.filePath,
    this.associatedElementId,
    DateTime? capturedAt,
    this.description = '',
  })  : id = id ?? const Uuid().v4(),
        capturedAt = capturedAt ?? DateTime.now();

  /// Retorna `true` si la foto está embebida dentro del contenedor .levon.
  ///
  /// Las fotos embebidas usan rutas relativas con prefijo "media/" para que
  /// las referencias sean portables e independientes del sistema de archivos anfitrión.
  bool get isEmbedded => filePath.startsWith('media/');
}
