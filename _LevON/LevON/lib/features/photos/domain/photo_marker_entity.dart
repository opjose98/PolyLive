import 'package:uuid/uuid.dart';

// ─── CAMERA CONE ──────────────────────────────────────────────────────────────

/// Cono de visión de la cámara al momento de la captura.
///
/// Representa el campo de visión proyectado en la planta 2D.
/// Usado para visualización BIM y documentación espacial.
class CameraCone {
  /// Ángulo de apertura horizontal del cono (grados). Típico: 60°–90°.
  final double angle;

  /// Alcance del cono en metros. Representa la distancia estimada de captura.
  final double range;

  /// Estilo de renderizado del cono: 'solid', 'dashed', 'filled'.
  final String style;

  const CameraCone({
    this.angle = 60.0,
    this.range = 3.0,
    this.style = 'dashed',
  });

  CameraCone copyWith({double? angle, double? range, String? style}) {
    return CameraCone(
      angle: angle ?? this.angle,
      range: range ?? this.range,
      style: style ?? this.style,
    );
  }

  Map<String, dynamic> toJson() => {
        'angle': angle,
        'range': range,
        'style': style,
      };

  factory CameraCone.fromJson(Map<String, dynamic> j) => CameraCone(
        angle: (j['angle'] as num?)?.toDouble() ?? 60.0,
        range: (j['range'] as num?)?.toDouble() ?? 3.0,
        style: j['style'] as String? ?? 'dashed',
      );
}

// ─── PHOTO MARKER ENTITY ──────────────────────────────────────────────────────

/// Marcador espacial BIM de una fotografía en planta.
///
/// Un PhotoMarkerEntity NO es una fotografía — es una representación espacial
/// de una PhotoEntity existente. La misma foto puede tener múltiples marcadores
/// en distintos espacios o posiciones.
///
/// REGLA CRÍTICA: Un PhotoMarkerEntity siempre referencia a una PhotoEntity
/// existente mediante [linkedPhotoId]. Si la foto es eliminada, todos sus
/// marcadores deben eliminarse también.
///
/// Arquitectura:
///   Project
///   └── PhotoMarkers: List<PhotoMarkerEntity>   ← por espacio
///       └── linkedPhotoId → PhotoEntity (en PhotoCollection)
class PhotoMarkerEntity {
  final String id;

  /// ID de la PhotoEntity vinculada. Siempre debe existir en alguna colección.
  final String linkedPhotoId;

  /// ID de la colección que contiene la foto vinculada.
  final String collectionId;

  /// ID del espacio (planta) donde está colocado este marcador.
  final String spaceId;

  /// Posición en coordenadas mundo del espacio (metros). {x, y}.
  final double x;
  final double y;

  /// Orientación del marcador: azimut en grados (0 = Norte, 90 = Este).
  /// Coincide con la orientación real de la cámara al capturar.
  final double orientation;

  /// Cono de visión proyectado en planta.
  final CameraCone cameraCone;

  /// Ruta al thumbnail de la foto para renderizado en planta (lazy).
  final String? previewThumbnailPath;

  /// Visible en la vista de planta.
  final bool visible;

  /// Notas libres del marcador (adicional a las notas de la foto).
  final String notes;

  final DateTime createdAt;
  final DateTime updatedAt;

  PhotoMarkerEntity({
    String? id,
    required this.linkedPhotoId,
    required this.collectionId,
    required this.spaceId,
    required this.x,
    required this.y,
    this.orientation = 0.0,
    CameraCone? cameraCone,
    this.previewThumbnailPath,
    this.visible = true,
    this.notes = '',
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : id = id ?? const Uuid().v4(),
        cameraCone = cameraCone ?? const CameraCone(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  PhotoMarkerEntity copyWith({
    double? x,
    double? y,
    double? orientation,
    CameraCone? cameraCone,
    String? previewThumbnailPath,
    bool? visible,
    String? notes,
  }) {
    return PhotoMarkerEntity(
      id: id,
      linkedPhotoId: linkedPhotoId,
      collectionId: collectionId,
      spaceId: spaceId,
      x: x ?? this.x,
      y: y ?? this.y,
      orientation: orientation ?? this.orientation,
      cameraCone: cameraCone ?? this.cameraCone,
      previewThumbnailPath: previewThumbnailPath ?? this.previewThumbnailPath,
      visible: visible ?? this.visible,
      notes: notes ?? this.notes,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'linkedPhotoId': linkedPhotoId,
        'collectionId': collectionId,
        'spaceId': spaceId,
        'x': x,
        'y': y,
        'orientation': orientation,
        'cameraCone': cameraCone.toJson(),
        if (previewThumbnailPath != null)
          'previewThumbnailPath': previewThumbnailPath,
        'visible': visible,
        'notes': notes,
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory PhotoMarkerEntity.fromJson(Map<String, dynamic> j) =>
      PhotoMarkerEntity(
        id: j['id'] as String,
        linkedPhotoId: j['linkedPhotoId'] as String,
        collectionId: j['collectionId'] as String,
        spaceId: j['spaceId'] as String,
        x: (j['x'] as num?)?.toDouble() ?? 0.0,
        y: (j['y'] as num?)?.toDouble() ?? 0.0,
        orientation: (j['orientation'] as num?)?.toDouble() ?? 0.0,
        cameraCone: j['cameraCone'] != null
            ? CameraCone.fromJson(j['cameraCone'] as Map<String, dynamic>)
            : const CameraCone(),
        previewThumbnailPath: j['previewThumbnailPath'] as String?,
        visible: j['visible'] as bool? ?? true,
        notes: j['notes'] as String? ?? '',
        createdAt: j['createdAt'] != null
            ? DateTime.tryParse(j['createdAt'] as String) ?? DateTime.now()
            : DateTime.now(),
        updatedAt: j['updatedAt'] != null
            ? DateTime.tryParse(j['updatedAt'] as String) ?? DateTime.now()
            : DateTime.now(),
      );
}
