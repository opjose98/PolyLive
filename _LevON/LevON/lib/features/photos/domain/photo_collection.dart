import 'package:uuid/uuid.dart';

import 'package:levon/features/photos/domain/photo_entity.dart';

/// Colección BIM de fotografías de campo.
///
/// Una PhotoCollection NO es un Space — es una entidad documental semántica
/// que agrupa fotografías bajo un contexto de levantamiento específico.
///
/// Ejemplos de uso:
///   - "Fachada Norte — Levantamiento 2026-05"
///   - "Interior Sala Principal — Patologías"
///   - "Estado Actual — Cubierta"
///
/// La colección siempre pertenece al proyecto y puede relacionarse
/// opcionalmente con espacios, muros u otras entidades BIM a través
/// de las relaciones en sus PhotoEntity contenidas.
class PhotoCollection {
  final String id;

  /// Código BIM único. Ej: PCT001, PCT042.
  /// Generado por [PhotoBimCodeGenerator.generateCollectionCode].
  final String bimCode;

  /// Nombre descriptivo de la colección (editable).
  final String name;

  /// Descripción libre del propósito de la colección.
  final String description;

  /// Fotografías BIM contenidas en esta colección.
  final List<PhotoEntity> photos;

  /// Metadata extendida de la colección (contexto, fase, responsable, etc.).
  final Map<String, String> metadata;

  final DateTime createdAt;
  final DateTime updatedAt;

  PhotoCollection({
    String? id,
    required this.bimCode,
    required this.name,
    this.description = '',
    List<PhotoEntity>? photos,
    Map<String, String>? metadata,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : id = id ?? const Uuid().v4(),
        photos = List.unmodifiable(photos ?? const []),
        metadata = Map.unmodifiable(metadata ?? const {}),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  int get photoCount => photos.length;
  bool get isEmpty => photos.isEmpty;

  PhotoCollection copyWith({
    String? name,
    String? description,
    List<PhotoEntity>? photos,
    Map<String, String>? metadata,
  }) {
    return PhotoCollection(
      id: id,
      bimCode: bimCode,
      name: name ?? this.name,
      description: description ?? this.description,
      photos: photos ?? this.photos,
      metadata: metadata ?? this.metadata,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }

  /// Retorna la colección con la foto añadida.
  PhotoCollection addPhoto(PhotoEntity photo) {
    return copyWith(photos: [...photos, photo]);
  }

  /// Retorna la colección sin la foto indicada.
  PhotoCollection removePhoto(String photoId) {
    return copyWith(photos: photos.where((p) => p.id != photoId).toList());
  }

  /// Retorna la colección con la foto actualizada.
  PhotoCollection updatePhoto(PhotoEntity updated) {
    return copyWith(
      photos: [
        for (final p in photos) p.id == updated.id ? updated : p,
      ],
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'bimCode': bimCode,
        'name': name,
        'description': description,
        'photos': photos.map((p) => p.toJson()).toList(),
        'metadata': metadata,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory PhotoCollection.fromJson(Map<String, dynamic> j) => PhotoCollection(
        id: j['id'] as String,
        bimCode: j['bimCode'] as String? ?? 'PCT000',
        name: j['name'] as String? ?? 'Sin nombre',
        description: j['description'] as String? ?? '',
        photos: (j['photos'] as List? ?? [])
            .map((p) => PhotoEntity.fromJson(p as Map<String, dynamic>))
            .toList(),
        metadata: (j['metadata'] as Map<String, dynamic>?)
                ?.map((k, v) => MapEntry(k, v.toString())) ??
            const {},
        createdAt: j['createdAt'] != null
            ? DateTime.tryParse(j['createdAt'] as String) ?? DateTime.now()
            : DateTime.now(),
        updatedAt: j['updatedAt'] != null
            ? DateTime.tryParse(j['updatedAt'] as String) ?? DateTime.now()
            : DateTime.now(),
      );
}
