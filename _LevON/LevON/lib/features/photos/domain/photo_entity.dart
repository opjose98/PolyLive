import 'package:uuid/uuid.dart';

// ─── CAPTURE ORIENTATION ──────────────────────────────────────────────────────

/// Orientación espacial del dispositivo al momento de la captura.
///
/// Prepara la arquitectura del futuro sistema de colocación espacial (T17).
class CaptureOrientation {
  /// Azimut respecto al norte magnético (0–360°). 0 = Norte, 90 = Este.
  final double azimuth;

  /// Inclinación vertical del dispositivo (−90° a +90°).
  final double pitch;

  /// Rotación lateral del dispositivo (−180° a +180°).
  final double roll;

  /// Dirección cardinal aproximada: N, NE, E, SE, S, SW, W, NW.
  final String compassDirection;

  const CaptureOrientation({
    required this.azimuth,
    required this.pitch,
    required this.roll,
    required this.compassDirection,
  });

  /// Genera la dirección cardinal a partir del azimut.
  static String compassFromAzimuth(double azimuth) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    final idx = ((azimuth + 22.5) / 45).floor() % 8;
    return dirs[idx];
  }

  factory CaptureOrientation.fromAzimuth(double azimuth, double pitch, double roll) {
    return CaptureOrientation(
      azimuth: azimuth,
      pitch: pitch,
      roll: roll,
      compassDirection: compassFromAzimuth(azimuth),
    );
  }

  CaptureOrientation copyWith({double? azimuth, double? pitch, double? roll}) {
    return CaptureOrientation(
      azimuth: azimuth ?? this.azimuth,
      pitch: pitch ?? this.pitch,
      roll: roll ?? this.roll,
      compassDirection: compassFromAzimuth(azimuth ?? this.azimuth),
    );
  }

  Map<String, dynamic> toJson() => {
        'azimuth': azimuth,
        'pitch': pitch,
        'roll': roll,
        'compassDirection': compassDirection,
      };

  factory CaptureOrientation.fromJson(Map<String, dynamic> j) =>
      CaptureOrientation(
        azimuth: (j['azimuth'] as num?)?.toDouble() ?? 0.0,
        pitch: (j['pitch'] as num?)?.toDouble() ?? 0.0,
        roll: (j['roll'] as num?)?.toDouble() ?? 0.0,
        compassDirection: j['compassDirection'] as String? ?? 'N',
      );
}

// ─── CAPTURE METADATA ─────────────────────────────────────────────────────────

/// Metadata de captura de una fotografía BIM.
///
/// Combina datos EXIF, sensores del dispositivo y localización GPS.
/// Los campos GPS y orientación son opcionales (pueden no estar disponibles).
class CaptureMetadata {
  /// Latitud GPS en grados decimales. Null si no disponible.
  final double? latitude;

  /// Longitud GPS en grados decimales. Null si no disponible.
  final double? longitude;

  /// Altitud GPS en metros sobre el nivel del mar. Null si no disponible.
  final double? altitude;

  /// Precisión horizontal del GPS en metros. Null si no disponible.
  final double? accuracy;

  /// Azimut en grados al momento de la captura (desde sensores, no solo EXIF).
  final double? azimuth;

  /// Dirección cardinal al momento de la captura.
  final String? compassDirection;

  /// Fecha y hora de captura (del dispositivo o EXIF).
  final DateTime capturedAt;

  /// Modelo del dispositivo. Ej: "Samsung Galaxy Tab S9".
  final String? deviceModel;

  /// Fabricante del dispositivo. Ej: "Samsung".
  final String? deviceManufacturer;

  /// Datos EXIF crudos extraídos de la imagen (tags → valores como string).
  final Map<String, String> exifData;

  /// Orientación del dispositivo al momento de la captura.
  final CaptureOrientation? orientation;

  const CaptureMetadata({
    this.latitude,
    this.longitude,
    this.altitude,
    this.accuracy,
    this.azimuth,
    this.compassDirection,
    required this.capturedAt,
    this.deviceModel,
    this.deviceManufacturer,
    this.exifData = const {},
    this.orientation,
  });

  factory CaptureMetadata.empty() => CaptureMetadata(capturedAt: DateTime.now());

  bool get hasLocation => latitude != null && longitude != null;
  bool get hasOrientation => orientation != null;

  Map<String, dynamic> toJson() => {
        'latitude': latitude,
        'longitude': longitude,
        'altitude': altitude,
        'accuracy': accuracy,
        'azimuth': azimuth,
        'compassDirection': compassDirection,
        'capturedAt': capturedAt.toIso8601String(),
        'deviceModel': deviceModel,
        'deviceManufacturer': deviceManufacturer,
        'exifData': exifData,
        if (orientation != null) 'orientation': orientation!.toJson(),
      };

  factory CaptureMetadata.fromJson(Map<String, dynamic> j) => CaptureMetadata(
        latitude: (j['latitude'] as num?)?.toDouble(),
        longitude: (j['longitude'] as num?)?.toDouble(),
        altitude: (j['altitude'] as num?)?.toDouble(),
        accuracy: (j['accuracy'] as num?)?.toDouble(),
        azimuth: (j['azimuth'] as num?)?.toDouble(),
        compassDirection: j['compassDirection'] as String?,
        capturedAt: j['capturedAt'] != null
            ? DateTime.tryParse(j['capturedAt'] as String) ?? DateTime.now()
            : DateTime.now(),
        deviceModel: j['deviceModel'] as String?,
        deviceManufacturer: j['deviceManufacturer'] as String?,
        exifData: (j['exifData'] as Map<String, dynamic>?)
                ?.map((k, v) => MapEntry(k, v.toString())) ??
            const {},
        orientation: j['orientation'] != null
            ? CaptureOrientation.fromJson(
                j['orientation'] as Map<String, dynamic>)
            : null,
      );
}

// ─── OVERLAY LAYER ────────────────────────────────────────────────────────────

enum OverlayType { text, image, metadata, coordinate, compass, date }

/// Capa de overlay editable sobre la fotografía.
///
/// Los overlays NO se rastereizan sobre la imagen original.
/// Se almacenan como datos y se renderizan dinámicamente en la vista.
class OverlayLayer {
  final String id;
  final OverlayType type;

  /// Posición relativa {x: 0–1, y: 0–1} dentro del encuadre de la foto.
  final Map<String, double> position;

  /// Escala del overlay (1.0 = tamaño original).
  final double scale;

  /// Configuración visual (color, fuente, opacidad, borde, etc.).
  final Map<String, dynamic> style;

  /// Visible en la vista.
  final bool visible;

  /// Contenido del overlay (texto, URL imagen, campo de metadata, etc.).
  final Map<String, dynamic> content;

  const OverlayLayer({
    required this.id,
    required this.type,
    this.position = const {'x': 0.05, 'y': 0.05},
    this.scale = 1.0,
    this.style = const {},
    this.visible = true,
    this.content = const {},
  });

  OverlayLayer copyWith({
    OverlayType? type,
    Map<String, double>? position,
    double? scale,
    Map<String, dynamic>? style,
    bool? visible,
    Map<String, dynamic>? content,
  }) {
    return OverlayLayer(
      id: id,
      type: type ?? this.type,
      position: position ?? this.position,
      scale: scale ?? this.scale,
      style: style ?? this.style,
      visible: visible ?? this.visible,
      content: content ?? this.content,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type.name,
        'position': position,
        'scale': scale,
        'style': style,
        'visible': visible,
        'content': content,
      };

  factory OverlayLayer.fromJson(Map<String, dynamic> j) => OverlayLayer(
        id: j['id'] as String,
        type: OverlayType.values.firstWhere(
          (t) => t.name == j['type'],
          orElse: () => OverlayType.text,
        ),
        position: (j['position'] as Map<String, dynamic>?)
                ?.map((k, v) => MapEntry(k, (v as num).toDouble())) ??
            const {'x': 0.05, 'y': 0.05},
        scale: (j['scale'] as num?)?.toDouble() ?? 1.0,
        style: j['style'] as Map<String, dynamic>? ?? const {},
        visible: j['visible'] as bool? ?? true,
        content: j['content'] as Map<String, dynamic>? ?? const {},
      );
}

// ─── ANNOTATION LAYER ─────────────────────────────────────────────────────────

/// Arquitectura preparatoria para el sistema de anotaciones vectoriales (T16).
///
/// Las anotaciones son vectoriales y editables — NO se rasterizan sobre la imagen.
/// Implementación completa prevista para v0.12.0.
class AnnotationLayer {
  final String id;

  /// Tipo de anotación: 'dimension', 'arrow', 'text', 'figure', 'cloud', 'reference'.
  final String type;

  /// Visible en la vista.
  final bool visible;

  /// Datos vectoriales de la anotación (puntos, colores, estilo, texto, etc.).
  final Map<String, dynamic> data;

  const AnnotationLayer({
    required this.id,
    required this.type,
    this.visible = true,
    this.data = const {},
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'visible': visible,
        'data': data,
      };

  factory AnnotationLayer.fromJson(Map<String, dynamic> j) => AnnotationLayer(
        id: j['id'] as String,
        type: j['type'] as String? ?? 'text',
        visible: j['visible'] as bool? ?? true,
        data: j['data'] as Map<String, dynamic>? ?? const {},
      );
}

// ─── BIM RELATIONS ────────────────────────────────────────────────────────────

/// Relaciones semánticas de una foto con entidades BIM del proyecto.
///
/// Una foto SIEMPRE pertenece al proyecto. Opcionalmente puede relacionarse
/// con espacios, muros, aperturas, habitaciones, columnas o tags libres.
class BIMRelations {
  final List<String> spaceIds;
  final List<String> wallIds;
  final List<String> openingIds;
  final List<String> roomIds;
  final List<String> columnIds;
  final List<String> tags;

  const BIMRelations({
    this.spaceIds = const [],
    this.wallIds = const [],
    this.openingIds = const [],
    this.roomIds = const [],
    this.columnIds = const [],
    this.tags = const [],
  });

  BIMRelations copyWith({
    List<String>? spaceIds,
    List<String>? wallIds,
    List<String>? openingIds,
    List<String>? roomIds,
    List<String>? columnIds,
    List<String>? tags,
  }) {
    return BIMRelations(
      spaceIds: spaceIds ?? this.spaceIds,
      wallIds: wallIds ?? this.wallIds,
      openingIds: openingIds ?? this.openingIds,
      roomIds: roomIds ?? this.roomIds,
      columnIds: columnIds ?? this.columnIds,
      tags: tags ?? this.tags,
    );
  }

  bool get isEmpty =>
      spaceIds.isEmpty &&
      wallIds.isEmpty &&
      openingIds.isEmpty &&
      roomIds.isEmpty &&
      columnIds.isEmpty &&
      tags.isEmpty;

  Map<String, dynamic> toJson() => {
        'spaceIds': spaceIds,
        'wallIds': wallIds,
        'openingIds': openingIds,
        'roomIds': roomIds,
        'columnIds': columnIds,
        'tags': tags,
      };

  factory BIMRelations.fromJson(Map<String, dynamic> j) => BIMRelations(
        spaceIds: List<String>.from(j['spaceIds'] as List? ?? []),
        wallIds: List<String>.from(j['wallIds'] as List? ?? []),
        openingIds: List<String>.from(j['openingIds'] as List? ?? []),
        roomIds: List<String>.from(j['roomIds'] as List? ?? []),
        columnIds: List<String>.from(j['columnIds'] as List? ?? []),
        tags: List<String>.from(j['tags'] as List? ?? []),
      );
}

// ─── OVERLAY TEMPLATE ─────────────────────────────────────────────────────────

/// Plantilla reutilizable de overlays para fotografías BIM (T12).
///
/// Permite múltiples configuraciones de rotulado (inspección, obra,
/// levantamiento, minimalista, patologías) con branding compartible.
class OverlayTemplate {
  final String id;
  final String name;
  final List<OverlayLayer> overlays;
  final Map<String, dynamic> styles;
  final Map<String, dynamic> branding;
  final Map<String, bool> visibilityRules;

  const OverlayTemplate({
    required this.id,
    required this.name,
    this.overlays = const [],
    this.styles = const {},
    this.branding = const {},
    this.visibilityRules = const {},
  });

  static OverlayTemplate defaultInspection() => const OverlayTemplate(
        id: 'tpl_inspection',
        name: 'Inspección',
        overlays: [
          OverlayLayer(
            id: 'ov_date',
            type: OverlayType.date,
            position: {'x': 0.05, 'y': 0.88},
            content: {'format': 'dd/MM/yyyy HH:mm'},
          ),
          OverlayLayer(
            id: 'ov_coord',
            type: OverlayType.coordinate,
            position: {'x': 0.05, 'y': 0.93},
          ),
          OverlayLayer(
            id: 'ov_compass',
            type: OverlayType.compass,
            position: {'x': 0.85, 'y': 0.05},
            scale: 0.7,
          ),
        ],
      );

  static OverlayTemplate defaultMinimal() => const OverlayTemplate(
        id: 'tpl_minimal',
        name: 'Minimalista',
        overlays: [
          OverlayLayer(
            id: 'ov_date_min',
            type: OverlayType.date,
            position: {'x': 0.05, 'y': 0.93},
          ),
        ],
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'overlays': overlays.map((o) => o.toJson()).toList(),
        'styles': styles,
        'branding': branding,
        'visibilityRules': visibilityRules,
      };

  factory OverlayTemplate.fromJson(Map<String, dynamic> j) => OverlayTemplate(
        id: j['id'] as String,
        name: j['name'] as String,
        overlays: (j['overlays'] as List? ?? [])
            .map((o) => OverlayLayer.fromJson(o as Map<String, dynamic>))
            .toList(),
        styles: j['styles'] as Map<String, dynamic>? ?? const {},
        branding: j['branding'] as Map<String, dynamic>? ?? const {},
        visibilityRules: (j['visibilityRules'] as Map<String, dynamic>?)
                ?.map((k, v) => MapEntry(k, v as bool)) ??
            const {},
      );
}

// ─── PHOTO SPATIAL MARKER ─────────────────────────────────────────────────────

/// Arquitectura preparatoria para la inserción de fotos en planta (T17).
///
/// Un marcador espacial representa la posición y orientación de la cámara
/// al momento de la captura, proyectada en el plano 2D de la planta.
/// Implementación completa prevista para v0.13.0 (SpatialPlacementSystem).
class PhotoSpatialMarker {
  /// Posición en planta {x, y} en coordenadas mundo (metros).
  final Map<String, double> position;

  /// Orientación de la cámara al capturar.
  final CaptureOrientation orientation;

  /// ID de la foto vinculada.
  final String linkedPhotoId;

  /// Visible en la planta.
  final bool visible;

  const PhotoSpatialMarker({
    required this.position,
    required this.orientation,
    required this.linkedPhotoId,
    this.visible = true,
  });

  Map<String, dynamic> toJson() => {
        'position': position,
        'orientation': orientation.toJson(),
        'linkedPhotoId': linkedPhotoId,
        'visible': visible,
      };

  factory PhotoSpatialMarker.fromJson(Map<String, dynamic> j) =>
      PhotoSpatialMarker(
        position: (j['position'] as Map<String, dynamic>?)
                ?.map((k, v) => MapEntry(k, (v as num).toDouble())) ??
            const {'x': 0.0, 'y': 0.0},
        orientation: CaptureOrientation.fromJson(
            j['orientation'] as Map<String, dynamic>? ?? {}),
        linkedPhotoId: j['linkedPhotoId'] as String,
        visible: j['visible'] as bool? ?? true,
      );
}

// ─── PHOTO ENTITY ─────────────────────────────────────────────────────────────

/// Entidad BIM documental de una fotografía de campo.
///
/// Una foto NO es un archivo simple — es una entidad BIM con:
///   - Identidad BIM (código único, nombre, descripción)
///   - Metadata de captura (GPS, orientación, EXIF, sensores)
///   - Sistema de overlays vectoriales editables
///   - Arquitectura de anotaciones (futura)
///   - Relaciones semánticas con entidades BIM
///   - Sistema de templates de rotulado
///   - Marcador espacial en planta (futuro)
///
/// ALMACENAMIENTO:
///   originalImagePath: ruta relativa dentro del contenedor .levon
///     Formato: "media/photos/original/{id}.jpg"
///   previewImagePath: "media/photos/preview/{id}_preview.jpg"
///   thumbnailPath: "media/photos/thumbnail/{id}_thumb.jpg"
class PhotoEntity {
  final String id;

  /// Código BIM único. Ej: PHO001, PHO042. Generado por [PhotoBimCodeGenerator].
  final String bimCode;

  /// Nombre descriptivo de la fotografía (editable).
  final String name;

  /// Descripción libre de la fotografía (ángulo, detalle, observaciones).
  final String description;

  /// Ruta relativa a la imagen original en el contenedor .levon.
  /// NUNCA se modifica. La imagen original es inmutable.
  final String originalImagePath;

  /// Ruta relativa a la imagen de resolución media (preview).
  final String? previewImagePath;

  /// Ruta relativa a la miniatura (thumbnail ligero para grillas).
  final String? thumbnailPath;

  /// Overlays vectoriales editables configurados sobre la foto.
  final List<OverlayLayer> overlayConfiguration;

  /// Capas de anotaciones vectoriales (arquitectura futura T16).
  final List<AnnotationLayer> annotationLayers;

  /// Metadata de captura: GPS, orientación, EXIF, dispositivo.
  final CaptureMetadata captureMetadata;

  /// Orientación del dispositivo al capturar (azimut, pitch, roll).
  final CaptureOrientation? orientationData;

  /// Relaciones semánticas con entidades BIM del proyecto.
  final BIMRelations spatialRelations;

  /// Plantilla de rotulado activa para esta foto.
  final OverlayTemplate? templateData;

  /// Configuración de visibilidad de secciones del overlay.
  final Map<String, bool> visibilitySettings;

  /// Notas libres del operador (máx. 1000 caracteres recomendado).
  final String notes;

  /// Etiquetas libres para búsqueda y filtrado.
  final List<String> tags;

  /// ID de la colección a la que pertenece esta foto.
  final String collectionId;

  /// Marcador espacial en planta (arquitectura futura T17). Null hasta implementación.
  final PhotoSpatialMarker? spatialMarker;

  final DateTime createdAt;
  final DateTime updatedAt;

  PhotoEntity({
    String? id,
    required this.bimCode,
    required this.name,
    this.description = '',
    required this.originalImagePath,
    this.previewImagePath,
    this.thumbnailPath,
    this.overlayConfiguration = const [],
    this.annotationLayers = const [],
    CaptureMetadata? captureMetadata,
    this.orientationData,
    BIMRelations? spatialRelations,
    this.templateData,
    this.visibilitySettings = const {},
    this.notes = '',
    this.tags = const [],
    required this.collectionId,
    this.spatialMarker,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : id = id ?? const Uuid().v4(),
        captureMetadata = captureMetadata ?? CaptureMetadata.empty(),
        spatialRelations = spatialRelations ?? const BIMRelations(),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  PhotoEntity copyWith({
    String? name,
    String? description,
    String? previewImagePath,
    String? thumbnailPath,
    List<OverlayLayer>? overlayConfiguration,
    List<AnnotationLayer>? annotationLayers,
    CaptureMetadata? captureMetadata,
    CaptureOrientation? orientationData,
    BIMRelations? spatialRelations,
    OverlayTemplate? templateData,
    Map<String, bool>? visibilitySettings,
    String? notes,
    List<String>? tags,
    PhotoSpatialMarker? spatialMarker,
  }) {
    return PhotoEntity(
      id: id,
      bimCode: bimCode,
      name: name ?? this.name,
      description: description ?? this.description,
      originalImagePath: originalImagePath,
      previewImagePath: previewImagePath ?? this.previewImagePath,
      thumbnailPath: thumbnailPath ?? this.thumbnailPath,
      overlayConfiguration: overlayConfiguration ?? this.overlayConfiguration,
      annotationLayers: annotationLayers ?? this.annotationLayers,
      captureMetadata: captureMetadata ?? this.captureMetadata,
      orientationData: orientationData ?? this.orientationData,
      spatialRelations: spatialRelations ?? this.spatialRelations,
      templateData: templateData ?? this.templateData,
      visibilitySettings: visibilitySettings ?? this.visibilitySettings,
      notes: notes ?? this.notes,
      tags: tags ?? this.tags,
      collectionId: collectionId,
      spatialMarker: spatialMarker ?? this.spatialMarker,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'bimCode': bimCode,
        'name': name,
        'description': description,
        'originalImagePath': originalImagePath,
        'previewImagePath': previewImagePath,
        'thumbnailPath': thumbnailPath,
        'overlayConfiguration':
            overlayConfiguration.map((o) => o.toJson()).toList(),
        'annotationLayers':
            annotationLayers.map((a) => a.toJson()).toList(),
        'captureMetadata': captureMetadata.toJson(),
        if (orientationData != null)
          'orientationData': orientationData!.toJson(),
        'spatialRelations': spatialRelations.toJson(),
        if (templateData != null) 'templateData': templateData!.toJson(),
        'visibilitySettings': visibilitySettings,
        'notes': notes,
        'tags': tags,
        'collectionId': collectionId,
        if (spatialMarker != null) 'spatialMarker': spatialMarker!.toJson(),
        'createdAt': createdAt.toIso8601String(),
        'updatedAt': updatedAt.toIso8601String(),
      };

  factory PhotoEntity.fromJson(Map<String, dynamic> j) => PhotoEntity(
        id: j['id'] as String,
        bimCode: j['bimCode'] as String? ?? 'PHO000',
        name: j['name'] as String? ?? 'Sin nombre',
        description: j['description'] as String? ?? '',
        originalImagePath: j['originalImagePath'] as String,
        previewImagePath: j['previewImagePath'] as String?,
        thumbnailPath: j['thumbnailPath'] as String?,
        overlayConfiguration:
            (j['overlayConfiguration'] as List? ?? [])
                .map((o) => OverlayLayer.fromJson(o as Map<String, dynamic>))
                .toList(),
        annotationLayers:
            (j['annotationLayers'] as List? ?? [])
                .map((a) => AnnotationLayer.fromJson(a as Map<String, dynamic>))
                .toList(),
        captureMetadata: j['captureMetadata'] != null
            ? CaptureMetadata.fromJson(
                j['captureMetadata'] as Map<String, dynamic>)
            : CaptureMetadata.empty(),
        orientationData: j['orientationData'] != null
            ? CaptureOrientation.fromJson(
                j['orientationData'] as Map<String, dynamic>)
            : null,
        spatialRelations: j['spatialRelations'] != null
            ? BIMRelations.fromJson(
                j['spatialRelations'] as Map<String, dynamic>)
            : const BIMRelations(),
        templateData: j['templateData'] != null
            ? OverlayTemplate.fromJson(
                j['templateData'] as Map<String, dynamic>)
            : null,
        visibilitySettings:
            (j['visibilitySettings'] as Map<String, dynamic>?)
                    ?.map((k, v) => MapEntry(k, v as bool)) ??
                const {},
        notes: j['notes'] as String? ?? '',
        tags: List<String>.from(j['tags'] as List? ?? []),
        collectionId: j['collectionId'] as String? ?? '',
        spatialMarker: j['spatialMarker'] != null
            ? PhotoSpatialMarker.fromJson(
                j['spatialMarker'] as Map<String, dynamic>)
            : null,
        createdAt: j['createdAt'] != null
            ? DateTime.tryParse(j['createdAt'] as String) ?? DateTime.now()
            : DateTime.now(),
        updatedAt: j['updatedAt'] != null
            ? DateTime.tryParse(j['updatedAt'] as String) ?? DateTime.now()
            : DateTime.now(),
      );
}
