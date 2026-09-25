import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/photos/domain/photo_entity.dart';

/// Generador de códigos BIM para entidades del SPDS.
///
/// Produce códigos únicos, cortos y compatibles con nomenclatura BIM/IFC.
///
/// Formatos:
///   PhotoEntity:     PHO001 … PHO999
///   PhotoCollection: PCT001 … PCT999
///
/// La unicidad se garantiza comparando contra los códigos existentes en el
/// contexto (lista de colecciones o fotos) — sin estado global.
class PhotoBimCodeGenerator {
  const PhotoBimCodeGenerator();

  // ── PHOTO CODES ───────────────────────────────────────────────────────────

  /// Genera el siguiente código PHOxxx disponible dado el set de códigos existentes.
  String generatePhotoCode(Iterable<PhotoEntity> existingPhotos) {
    final used = {for (final p in existingPhotos) p.bimCode};
    return _nextCode('PHO', used);
  }

  /// Genera el siguiente código PHOxxx disponible en una colección específica.
  String generatePhotoCodeInCollection(PhotoCollection collection) {
    return generatePhotoCode(collection.photos);
  }

  /// Genera el siguiente código PHOxxx disponible en todas las colecciones.
  String generatePhotoCodeGlobal(Iterable<PhotoCollection> collections) {
    final allPhotos = collections.expand((c) => c.photos);
    return generatePhotoCode(allPhotos);
  }

  // ── COLLECTION CODES ──────────────────────────────────────────────────────

  /// Genera el siguiente código PCTxxx disponible dado el set de colecciones.
  String generateCollectionCode(Iterable<PhotoCollection> existingCollections) {
    final used = {for (final c in existingCollections) c.bimCode};
    return _nextCode('PCT', used);
  }

  // ── INTERNAL ──────────────────────────────────────────────────────────────

  String _nextCode(String prefix, Set<String> used) {
    for (var i = 1; i <= 999; i++) {
      final code = '$prefix${i.toString().padLeft(3, '0')}';
      if (!used.contains(code)) return code;
    }
    // Fallback con timestamp si el espacio de 3 dígitos está agotado.
    return '$prefix${DateTime.now().millisecondsSinceEpoch % 100000}';
  }
}
