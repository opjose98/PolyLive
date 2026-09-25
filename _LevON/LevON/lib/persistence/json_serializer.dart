import 'dart:convert';
import 'package:uuid/uuid.dart';
import 'package:vector_math/vector_math.dart';

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/photos/domain/photo.dart';
import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';

/// Transforma el modelo de dominio BIM ↔ JSON en el formato interno de LevON.
///
/// Schema actual: v2.1
///
/// Cambios respecto a v2.0:
/// - Door/Window no se serializan en elements[] ni relations[]:
///   WallOpening (dentro de elevations[]) es la entidad canónica.
/// - WallOpening incluye `isFlipped` y `notes`.
/// - Wall, Column incluyen campo `notes` opcional.
/// - Migración automática: archivos v2.0 con Door/Window elements[]
///   los convierten a WallOpenings en la elevación correspondiente.
///
/// Migración legacy: si `version == "1.0"` se delega a `_deserializeV1`.
class JsonSerializer {
  static const String _schemaVersion = '2.1';
  static const String _defaultStoreyId = 'ground';

  // ── SERIALIZACIÓN ──────────────────────────────────────────────────────────

  /// Serializa [project] al JSON canónico v2.1 del formato .levon.
  String serializeProject(Project project) {
    final wallIds = {for (final space in project.spaces.values) ...space.walls.map((w) => w.id)};
    final map = <String, dynamic>{
      'version': _schemaVersion,
      'project': _serializeProjectMeta(project),
      'storeys': _serializeStoreys(project),
      'elements': _serializeElements(project),
      'relations': _serializeRelations(project),
      'media': project.photos.map(_serializePhoto).toList(),
      'elevations': _serializeElevations(
        project.spaces.values.expand((s) => s.wallElevations).toList(),
        wallIds,
      ),
      'photoCollections': project.photoCollections.map((c) => c.toJson()).toList(),
      'photoMarkers': project.photoMarkers.map((m) => m.toJson()).toList(),
    };
    return const JsonEncoder.withIndent('  ').convert(map);
  }

  /// Genera el JSON ligero de metadata.json (sin el modelo completo).
  String serializeMetadata(Project project) {
    final elementCount = project.spaces.values.fold<int>(
      0,
      (sum, s) => sum + s.walls.length + s.columns.length +
          s.wallElevations.fold<int>(0, (n, we) => n + we.openings.length),
    );
    final map = <String, dynamic>{
      'id': project.id,
      'title': project.title,
      'bimCode': project.bimCode,
      'description': project.description,
      'discipline': project.discipline,
      'author': project.author,
      'updatedAt': project.updatedAt.toIso8601String(),
      'createdAt': project.createdAt.toIso8601String(),
      'elementCount': elementCount,
      'schemaVersion': _schemaVersion,
    };
    return const JsonEncoder.withIndent('  ').convert(map);
  }

  // ── DESERIALIZACIÓN ────────────────────────────────────────────────────────

  /// Deserializa el JSON de `project.json`.
  Project deserializeProject(String jsonString) {
    final map = jsonDecode(jsonString) as Map<String, dynamic>;
    final version = map['version'] as String? ?? '1.0';
    if (version == '1.0') return _deserializeV1(map);
    return _deserializeV2(map);
  }

  // ── SERIALIZACIÓN PRIVADA v2.0 ─────────────────────────────────────────────

  Map<String, dynamic> _serializeProjectMeta(Project project) => {
        'id': project.id,
        'title': project.title,
        'bimCode': project.bimCode,
        'description': project.description,
        'discipline': project.discipline,
        'author': project.author,
        'units': 'meters',
        'createdAt': project.createdAt.toIso8601String(),
        'updatedAt': project.updatedAt.toIso8601String(),
      };

  List<Map<String, dynamic>> _serializeStoreys(Project project) {
    return project.spaces.values
        .map((s) => {
              'id': s.id,
              'name': s.name,
              'elevation': 0.0,
            })
        .toList();
  }

  List<Map<String, dynamic>> _serializeElements(Project project) {
    final elements = <Map<String, dynamic>>[];

    for (final space in project.spaces.values) {
      final sId = space.id;

      for (final wall in space.walls) {
        elements.add({
          'id': wall.id,
          'type': wall.isStructural ? 'Wall' : 'Partition',
          'storeyId': sId,
          'geometry': _serializeGeometry(wall.geometry, wall.height),
          'properties': {
            'thickness': wall.thickness,
            'height': wall.height,
            'material': wall.material,
            'isStructural': wall.isStructural,
            if (wall.notes != null) 'notes': wall.notes,
          },
        });
      }

      for (final col in space.columns) {
        elements.add({
          'id': col.id,
          'type': 'Column',
          'storeyId': sId,
          'geometry': _serializeColumnGeometry(col),
          'properties': {
            'shape': col.shape.name,
            'dimensionX': col.dimensionX,
            'dimensionY': col.dimensionY,
            'height': col.height,
            'material': col.material,
            'rotation': col.rotation,
            'position': [col.position.x, col.position.y],
            if (col.notes != null) 'notes': col.notes,
          },
        });
      }
      // Door/Window no se serialzan aquí (v2.1+): WallOpening en elevations[] es canónico.
    }

    return elements;
  }

  List<Map<String, dynamic>> _serializeRelations(Project project) {
    // v2.1+: Door/Window openings se almacenan en elevations[].openings; no hay relaciones separadas.
    return const [];
  }

  /// Serializa geometría con semántica IFC: profile + height + type semántico.
  ///
  /// `profile` contiene la sección transversal del elemento en el plano XY.
  /// `height` es la dimensión de extrusión en Z (altura de piso).
  /// Esta estructura mapea directamente a IfcExtrudedAreaSolid en el backend.
  Map<String, dynamic> _serializeGeometry(Shape shape, double height) {
    if (shape is LineShape) {
      return {
        'type': 'Line',
        'profile': [
          [shape.start.x, shape.start.y],
          [shape.end.x, shape.end.y],
        ],
        'height': height,
      };
    } else if (shape is ArcShape) {
      return {
        'type': 'Arc',
        'center': [shape.center.x, shape.center.y],
        'radius': shape.radius,
        'startAngle': shape.startAngle,
        'sweepAngle': shape.sweepAngle,
        'height': height,
      };
    } else if (shape is PolygonShape) {
      return {
        'type': 'Polygon',
        'profile': shape.vertices.map((v) => [v.x, v.y]).toList(),
        'height': height,
      };
    }
    throw ArgumentError('Subtipo de Shape desconocido: ${shape.runtimeType}');
  }

  /// Geometría de columna como extrusión de perfil (circular o rectangular).
  Map<String, dynamic> _serializeColumnGeometry(ArchitecturalColumn col) {
    if (col.isCircular) {
      return {
        'type': 'Extrusion',
        'profileType': 'Circle',
        'center': [col.position.x, col.position.y],
        'diameter': col.dimensionX,
        'height': col.height,
      };
    } else {
      return {
        'type': 'Extrusion',
        'profileType': 'Rectangle',
        'center': [col.position.x, col.position.y],
        'width': col.dimensionX,
        'depth': col.dimensionY,
        'rotation': col.rotation,
        'height': col.height,
      };
    }
  }

  Map<String, dynamic> _serializePhoto(Photo photo) => {
        'id': photo.id,
        'relativePath': photo.filePath,
        'associatedElementId': photo.associatedElementId,
        'capturedAt': photo.capturedAt.toIso8601String(),
        'description': photo.description,
      };

  /// Serializa elevaciones MEM. Solo incluye las que referencian muros existentes.
  List<Map<String, dynamic>> _serializeElevations(
    List<WallElevation> elevations,
    Set<String> validWallIds,
  ) {
    return [
      for (final e in elevations)
        if (validWallIds.contains(e.wallId))
          {
            'wallId': e.wallId,
            'levels': {
              'coronacion': e.levels.coronacion,
              if (e.levels.leftHeight != null)
                'leftHeight': e.levels.leftHeight,
              if (e.levels.rightHeight != null)
                'rightHeight': e.levels.rightHeight,
            },
            'chainModeEnabled': e.chainModeEnabled,
            'openings': [
              for (final o in e.openings)
                {
                  'id': o.id,
                  'type': o.type.name,
                  'xOffset': o.xOffset,
                  'width': o.width,
                  'sillHeight': o.sillHeight,
                  'height': o.height,
                  'isFlipped': o.isFlipped,
                  if (o.notes != null) 'notes': o.notes,
                },
            ],
          },
    ];
  }

  List<WallElevation> _deserializeElevations(
    List<dynamic> list,
    Set<String> validWallIds,
  ) {
    final result = <WallElevation>[];
    for (final item in list) {
      final map = item as Map<String, dynamic>;
      final wallId = map['wallId'] as String;
      if (!validWallIds.contains(wallId)) continue;
      final levelsMap = map['levels'] as Map<String, dynamic>;
      final openingsList = (map['openings'] as List<dynamic>? ?? []);
      result.add(WallElevation(
        wallId: wallId,
        levels: VerticalLevels(
          coronacion: (levelsMap['coronacion'] as num).toDouble(),
          leftHeight: levelsMap['leftHeight'] != null
              ? (levelsMap['leftHeight'] as num).toDouble()
              : null,
          rightHeight: levelsMap['rightHeight'] != null
              ? (levelsMap['rightHeight'] as num).toDouble()
              : null,
        ),
        chainModeEnabled: map['chainModeEnabled'] as bool? ?? false,
        openings: [
          for (final o in openingsList)
            _deserializeOpening(o as Map<String, dynamic>),
        ],
      ));
    }
    return result;
  }

  WallOpening _deserializeOpening(Map<String, dynamic> map) {
    return WallOpening(
      id: map['id'] as String,
      type: OpeningType.values.byName(map['type'] as String),
      xOffset: (map['xOffset'] as num).toDouble(),
      width: (map['width'] as num).toDouble(),
      sillHeight: (map['sillHeight'] as num).toDouble(),
      height: (map['height'] as num).toDouble(),
      isFlipped: map['isFlipped'] as bool? ?? false,
      notes: map['notes'] as String?,
    );
  }

  // ── DESERIALIZACIÓN v2.x ──────────────────────────────────────────────────

  Project _deserializeV2(Map<String, dynamic> map) {
    final projectMeta = map['project'] as Map<String, dynamic>;
    final elementsList = map['elements'] as List<dynamic>;
    final relationsList = (map['relations'] as List<dynamic>?) ?? [];
    final mediaList = (map['media'] as List<dynamic>?) ?? [];
    final elevationsList = (map['elevations'] as List<dynamic>?) ?? [];
    final storeysList = (map['storeys'] as List<dynamic>?) ?? [];

    // Agrupar elementos por storeyId
    final storeyElements = <String, List<Map<String, dynamic>>>{};
    for (final e in elementsList) {
      final elem = e as Map<String, dynamic>;
      final sId = elem['storeyId'] as String? ?? _defaultStoreyId;
      storeyElements.putIfAbsent(sId, () => []).add(elem);
    }

    // Lookup relations by elementId (v2.0 compat)
    final relMap = <String, Map<String, dynamic>>{};
    for (final r in relationsList) {
      final rel = r as Map<String, dynamic>;
      if (rel['type'] == 'HostedBy') {
        relMap[rel['elementId'] as String] = rel;
      }
    }

    final photos = mediaList
        .map((e) => _deserializePhotoV2(e as Map<String, dynamic>))
        .toList();

    final photoCollections = (map['photoCollections'] as List? ?? [])
        .map((c) => PhotoCollection.fromJson(c as Map<String, dynamic>))
        .toList();

    final photoMarkers = (map['photoMarkers'] as List? ?? [])
        .map((m) => PhotoMarkerEntity.fromJson(m as Map<String, dynamic>))
        .toList();

    final spaces = <String, SpaceGeometry>{};

    for (final s in storeysList) {
      final sMap = s as Map<String, dynamic>;
      final sId = sMap['id'] as String;
      final sName = sMap['name'] as String;
      spaces[sId] = SpaceGeometry.empty(sId, sName);
    }

    if (!spaces.containsKey(_defaultStoreyId)) {
      spaces[_defaultStoreyId] = SpaceGeometry.empty(_defaultStoreyId, 'Planta Baja');
    }

    for (final sId in storeyElements.keys) {
      final elems = storeyElements[sId]!;

      final wallMaps = elems
          .where((e) => e['type'] == 'Wall' || e['type'] == 'Partition')
          .toList();
      final columnMaps = elems.where((e) => e['type'] == 'Column').toList();
      // v2.0 compat: Door/Window elements migrados a WallOpenings
      final doorMaps = elems.where((e) => e['type'] == 'Door').toList();
      final windowMaps = elems.where((e) => e['type'] == 'Window').toList();

      final walls = wallMaps.map(_deserializeWallV2).toList();
      final wallById = {for (final w in walls) w.id: w};
      final columns = columnMaps.map(_deserializeColumnV2).toList();

      final wallIds = {for (final w in walls) w.id};
      var wallElevations = _deserializeElevations(elevationsList, wallIds);

      // Migración v2.0 → v2.1: convertir Door/Window elements a WallOpenings
      if (doorMaps.isNotEmpty || windowMaps.isNotEmpty) {
        wallElevations = _migrateDoorsWindowsToOpenings(
          wallElevations, walls, doorMaps, windowMaps, relMap, wallById,
        );
      }

      final existingSpace =
          spaces[sId] ?? SpaceGeometry.empty(sId, 'Espacio $sId');
      spaces[sId] = existingSpace.copyWith(
        walls: walls,
        columns: columns,
        wallElevations: wallElevations,
      );
    }

    return Project(
      id: projectMeta['id'] as String,
      title: projectMeta['title'] as String,
      bimCode: projectMeta['bimCode'] as String?,
      description: (projectMeta['description'] as String?) ?? '',
      discipline: (projectMeta['discipline'] as String?) ?? 'Arquitectura',
      author: (projectMeta['author'] as String?) ?? '',
      spaces: spaces,
      photos: photos,
      photoCollections: photoCollections,
      photoMarkers: photoMarkers,
      createdAt: DateTime.parse(projectMeta['createdAt'] as String),
      updatedAt: DateTime.parse(projectMeta['updatedAt'] as String),
    );
  }

  /// Migración v2.0 → v2.1: convierte Door/Window elements a WallOpenings.
  ///
  /// Para cada Door/Window: localiza o crea la WallElevation del muro host,
  /// luego añade un WallOpening equivalente.
  List<WallElevation> _migrateDoorsWindowsToOpenings(
    List<WallElevation> elevations,
    List<Wall> walls,
    List<Map<String, dynamic>> doorMaps,
    List<Map<String, dynamic>> windowMaps,
    Map<String, Map<String, dynamic>> relMap,
    Map<String, Wall> wallById,
  ) {
    final elevMap = <String, WallElevation>{
      for (final e in elevations) e.wallId: e,
    };

    void migrate(Map<String, dynamic> elemMap, OpeningType type) {
      final rel = relMap[elemMap['id'] as String];
      if (rel == null) return;
      final hostWall = wallById[rel['hostId'] as String];
      if (hostWall == null) return;
      final props = elemMap['properties'] as Map<String, dynamic>;
      final xOffset = (rel['positionFromStart'] as num).toDouble();
      final width = (props['width'] as num).toDouble();
      final height = (props['height'] as num).toDouble();
      final sillHeight = type == OpeningType.window
          ? (props['sillHeight'] as num? ?? 0.90).toDouble()
          : 0.0;
      final elev = elevMap[hostWall.id] ??
          WallElevation.defaults(hostWall.id, hostWall.height);

      // Clamp width al rango del muro antes de usar como límite de xOffset.
      // Sin este guarda, width > wallLength produce clamp(0.0, negativo) que
      // lanza StateError en Dart (clamp requiere min <= max).
      final safeWidth = width.clamp(0.0, hostWall.length);
      final safeXMax = hostWall.length - safeWidth; // siempre >= 0
      final opening = WallOpening(
        type: type,
        xOffset: xOffset.clamp(0.0, safeXMax),
        width: safeWidth,
        sillHeight: sillHeight,
        height: height,
      );
      elevMap[hostWall.id] = elev.copyWith(
        openings: [...elev.openings, opening],
      );
    }

    for (final d in doorMaps) { migrate(d, OpeningType.door); }
    for (final w in windowMaps) { migrate(w, OpeningType.window); }
    return elevMap.values.toList();
  }

  Wall _deserializeWallV2(Map<String, dynamic> map) {
    final props = map['properties'] as Map<String, dynamic>;
    final geomMap = map['geometry'] as Map<String, dynamic>;
    final height = (props['height'] as num).toDouble();
    return Wall(
      id: map['id'] as String,
      geometry: _deserializeGeometryV2(geomMap),
      thickness: (props['thickness'] as num).toDouble(),
      height: height,
      material: props['material'] as String,
      isStructural: props['isStructural'] as bool,
      notes: props['notes'] as String?,
    );
  }

  Shape _deserializeGeometryV2(Map<String, dynamic> map) {
    final type = map['type'] as String;
    switch (type) {
      case 'Line':
        final profile = map['profile'] as List<dynamic>;
        final start = profile[0] as List<dynamic>;
        final end = profile[1] as List<dynamic>;
        return LineShape(
          Vector2((start[0] as num).toDouble(), (start[1] as num).toDouble()),
          Vector2((end[0] as num).toDouble(), (end[1] as num).toDouble()),
        );
      case 'Arc':
        final center = map['center'] as List<dynamic>;
        return ArcShape(
          center: Vector2(
            (center[0] as num).toDouble(),
            (center[1] as num).toDouble(),
          ),
          radius: (map['radius'] as num).toDouble(),
          startAngle: (map['startAngle'] as num).toDouble(),
          sweepAngle: (map['sweepAngle'] as num).toDouble(),
        );
      case 'Polygon':
        final profile = map['profile'] as List<dynamic>;
        final vertices = profile
            .map((v) => Vector2(
                  ((v as List<dynamic>)[0] as num).toDouble(),
                  (v[1] as num).toDouble(),
                ))
            .toList();
        return PolygonShape(vertices);
      default:
        throw ArgumentError('Tipo de geometría desconocido en v2.0: $type');
    }
  }

  ArchitecturalColumn _deserializeColumnV2(Map<String, dynamic> map) {
    final props = map['properties'] as Map<String, dynamic>;
    final pos = props['position'] as List<dynamic>;
    return ArchitecturalColumn(
      id: map['id'] as String,
      position: Vector2(
        (pos[0] as num).toDouble(),
        (pos[1] as num).toDouble(),
      ),
      shape: ColumnShape.values.byName(props['shape'] as String),
      dimensionX: (props['dimensionX'] as num).toDouble(),
      dimensionY: (props['dimensionY'] as num).toDouble(),
      height: (props['height'] as num).toDouble(),
      material: props['material'] as String,
      rotation: (props['rotation'] as num).toDouble(),
      notes: props['notes'] as String?,
    );
  }

  Photo _deserializePhotoV2(Map<String, dynamic> map) => Photo(
        id: map['id'] as String,
        filePath: (map['relativePath'] as String?) ??
            (map['filePath'] as String? ?? ''),
        associatedElementId: map['associatedElementId'] as String?,
        capturedAt: DateTime.parse(map['capturedAt'] as String),
        description: (map['description'] as String?) ?? '',
      );

  // ── DESERIALIZACIÓN LEGACY v1.0 ────────────────────────────────────────────

  /// Reader de compatibilidad para proyectos guardados con schema v1.0.
  ///
  /// El formato v1.0 usaba estructura plana `elements.walls/doors/windows/…`.
  /// Este método convierte esa estructura al modelo de dominio sin pérdida de datos,
  /// permitiendo abrir archivos creados en Alpha 1.0 anterior a este refactor.
  Project _deserializeV1(Map<String, dynamic> map) {
    final projectMeta = map['project'] as Map<String, dynamic>;
    final elements = map['elements'] as Map<String, dynamic>;

    final walls = (elements['walls'] as List<dynamic>)
        .map((e) => _deserializeWallV1(e as Map<String, dynamic>))
        .toList();

    final wallById = {for (final w in walls) w.id: w};

    final columns = (elements['columns'] as List<dynamic>)
        .map((e) => _deserializeColumnV1(e as Map<String, dynamic>))
        .toList();

    final photos = (elements['photos'] as List<dynamic>)
        .map((e) => _deserializePhotoV1(e as Map<String, dynamic>))
        .toList();

    // Migrate v1.0 doors/windows → WallElevation.openings
    final elevMap = <String, List<WallOpening>>{};

    for (final raw in (elements['doors'] as List<dynamic>)) {
      final e = raw as Map<String, dynamic>;
      final wallId = e['hostWallId'] as String?;
      if (wallId == null || !wallById.containsKey(wallId)) continue;
      elevMap.putIfAbsent(wallId, () => []).add(WallOpening(
        id: e['id'] as String? ?? const Uuid().v4(),
        type: OpeningType.door,
        xOffset: (e['positionFromStart'] as num).toDouble(),
        width: (e['width'] as num).toDouble(),
        height: (e['height'] as num).toDouble(),
        sillHeight: 0.0,
      ));
    }

    for (final raw in (elements['windows'] as List<dynamic>)) {
      final e = raw as Map<String, dynamic>;
      final wallId = e['hostWallId'] as String?;
      if (wallId == null || !wallById.containsKey(wallId)) continue;
      elevMap.putIfAbsent(wallId, () => []).add(WallOpening(
        id: e['id'] as String? ?? const Uuid().v4(),
        type: OpeningType.window,
        xOffset: (e['positionFromStart'] as num).toDouble(),
        width: (e['width'] as num).toDouble(),
        height: (e['height'] as num).toDouble(),
        sillHeight: (e['sillHeight'] as num? ?? 0.9).toDouble(),
      ));
    }

    final wallElevations = elevMap.entries.map((entry) {
      final wall = wallById[entry.key]!;
      return WallElevation(
        wallId: wall.id,
        openings: entry.value,
        levels: VerticalLevels(coronacion: wall.height),
      );
    }).toList();

    return Project(
      id: projectMeta['id'] as String,
      title: projectMeta['title'] as String,
      walls: walls,
      columns: columns,
      wallElevations: wallElevations,
      photos: photos,
      createdAt: DateTime.parse(projectMeta['createdAt'] as String),
      updatedAt: DateTime.parse(projectMeta['updatedAt'] as String),
    );
  }

  Wall _deserializeWallV1(Map<String, dynamic> map) => Wall(
        id: map['id'] as String,
        geometry: _deserializeShapeV1(map['geometry'] as Map<String, dynamic>),
        thickness: (map['thickness'] as num).toDouble(),
        height: (map['height'] as num).toDouble(),
        material: map['material'] as String,
        isStructural: map['isStructural'] as bool,
      );

  Shape _deserializeShapeV1(Map<String, dynamic> map) {
    final type = map['type'] as String;
    switch (type) {
      case 'Line':
        final start = map['start'] as List<dynamic>;
        final end = map['end'] as List<dynamic>;
        return LineShape(
          Vector2((start[0] as num).toDouble(), (start[1] as num).toDouble()),
          Vector2((end[0] as num).toDouble(), (end[1] as num).toDouble()),
        );
      case 'Arc':
        final center = map['center'] as List<dynamic>;
        return ArcShape(
          center: Vector2(
            (center[0] as num).toDouble(),
            (center[1] as num).toDouble(),
          ),
          radius: (map['radius'] as num).toDouble(),
          startAngle: (map['startAngle'] as num).toDouble(),
          sweepAngle: (map['sweepAngle'] as num).toDouble(),
        );
      case 'Polygon':
        final vertices = (map['vertices'] as List<dynamic>)
            .map((v) => Vector2(
                  ((v as List<dynamic>)[0] as num).toDouble(),
                  (v[1] as num).toDouble(),
                ))
            .toList();
        return PolygonShape(vertices);
      default:
        throw ArgumentError('Tipo de geometría desconocido en v1.0: $type');
    }
  }

  ArchitecturalColumn _deserializeColumnV1(Map<String, dynamic> map) {
    final pos = map['position'] as List<dynamic>;
    return ArchitecturalColumn(
      id: map['id'] as String,
      position: Vector2(
        (pos[0] as num).toDouble(),
        (pos[1] as num).toDouble(),
      ),
      shape: ColumnShape.values.byName(map['shape'] as String),
      dimensionX: (map['dimensionX'] as num).toDouble(),
      dimensionY: (map['dimensionY'] as num).toDouble(),
      height: (map['height'] as num).toDouble(),
      material: map['material'] as String,
      rotation: (map['rotation'] as num).toDouble(),
    );
  }

  Photo _deserializePhotoV1(Map<String, dynamic> map) => Photo(
        id: map['id'] as String,
        filePath: map['filePath'] as String,
        associatedElementId: map['associatedElementId'] as String?,
        capturedAt: DateTime.parse(map['capturedAt'] as String),
        description: (map['description'] as String?) ?? '',
      );
}
