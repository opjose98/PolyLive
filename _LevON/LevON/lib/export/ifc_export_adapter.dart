import 'dart:convert';
import 'dart:io';

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/persistence/file_storage_service.dart';

/// Produces a JSON payload describing the full BIM model in a format
/// consumable by a Python / IfcOpenShell backend for IFC 4 generation.
///
/// This adapter does NOT write IFC directly — it serializes the semantic
/// BIM graph (elements, geometry, relations) to JSON and delegates the
/// STEP-format encoding to the backend service.
///
/// Contract with backend (Python):
///   POST /api/ifc/generate  body: <output of this adapter>
///   → 200 OK  body: binary .ifc file
///
/// The [IfcExporter] class handles direct in-app IFC STEP generation when
/// no backend is available. Use this adapter for cloud/batch workflows.
class IfcExportAdapter {
  final FileStorageService _storage;

  IfcExportAdapter({FileStorageService? storage})
      : _storage = storage ?? FileStorageService();

  // ── PUBLIC API ─────────────────────────────────────────────────────────────

  /// Serializes [project] to the IFC JSON interchange format and writes it.
  ///
  /// [targetDirectory] — carpeta de destino elegida por el usuario.
  /// Si es null, se usa el directorio de exportes estándar de la aplicación.
  ///
  /// Returns the path of the written file.
  Future<String> exportToIfcJson(Project project,
      {String? targetDirectory}) async {
    final payload = buildPayload(project);
    final content = const JsonEncoder.withIndent('  ').convert(payload);
    final sanitized = _sanitizeFilename(project.title);
    final file = targetDirectory != null
        // Escritura en directorio elegido por el usuario
        ? File(
            '$targetDirectory${Platform.pathSeparator}${sanitized}_ifc_payload.json')
        : await _storage.exportFile('${sanitized}_ifc_payload.json');
    await file.writeAsString(content, encoding: utf8, flush: true);
    return file.path;
  }

  /// Returns the JSON payload as a [Map] — useful for direct HTTP POST.
  Map<String, dynamic> buildPayload(Project project) {
    return {
      'schema': 'LevON-IFC-Payload',
      'schemaVersion': '1.0',
      'generatedAt': DateTime.now().toIso8601String(),
      'project': _serializeProject(project),
      'elements': _serializeElements(project),
    };
  }

  // ── PROJECT META ───────────────────────────────────────────────────────────

  Map<String, dynamic> _serializeProject(Project project) => {
        'id': project.id,
        'name': project.title,
        'units': 'METRE',
        'ifcSchema': 'IFC4',
        'site': {'name': 'Default Site'},
        'building': {'name': 'Default Building'},
        'storey': {'name': 'Ground Floor', 'elevation': 0.0},
      };

  // ── ELEMENTS ───────────────────────────────────────────────────────────────

  Map<String, dynamic> _serializeElements(Project project) => {
        'walls': project.walls.map(_serializeWall).toList(),
        'columns': project.columns.map(_serializeColumn).toList(),
        'doors': _serializeOpeningsOfType(project, OpeningType.door),
        'windows': _serializeOpeningsOfType(project, OpeningType.window),
        'openings': _serializeOpeningsOfType(project, OpeningType.opening),
        'spaces': project.rooms
            .map((r) => {
                  'id': r.id,
                  'name': r.name,
                  'area': r.area,
                  'perimeter': r.estimatedPerimeter,
                  'boundingWallIds': r.boundary.map((w) => w.id).toList(),
                  'ifcType': 'IfcSpace',
                })
            .toList(),
      };

  List<Map<String, dynamic>> _serializeOpeningsOfType(
      Project project, OpeningType type) {
    final result = <Map<String, dynamic>>[];
    for (final space in project.spaces.values) {
      for (final we in space.wallElevations) {
        for (final op in we.openings) {
          if (op.type != type) continue;
          result.add({
            'id': op.id,
            'hostWallId': we.wallId,
            'positionFromStart': op.xOffset,
            'width': op.width,
            'height': op.height,
            'sillHeight': op.sillHeight,
            'isFlipped': op.isFlipped,
            if (op.notes != null) 'notes': op.notes,
            'ifcType': type == OpeningType.door ? 'IfcDoor' : 'IfcWindow',
          });
        }
      }
    }
    return result;
  }

  Map<String, dynamic> _serializeWall(wall) {
    final geom = wall.geometry;
    Map<String, dynamic> geometry;

    if (geom is LineShape) {
      // IFC standard case: axis line + profile extrusion
      geometry = {
        'representation': 'SweptSolid',
        'axisStart': {'x': geom.start.x, 'y': geom.start.y, 'z': 0.0},
        'axisEnd': {'x': geom.end.x, 'y': geom.end.y, 'z': 0.0},
        'length': geom.length,
        'profileType': 'RECTANGLE',
      };
    } else if (geom is ArcShape) {
      geometry = {
        'representation': 'SweptSolid',
        'profileType': 'ARC',
        'center': {'x': geom.center.x, 'y': geom.center.y, 'z': 0.0},
        'radius': geom.radius,
        'startAngle': geom.startAngle,
        'sweepAngle': geom.sweepAngle,
      };
    } else if (geom is PolygonShape) {
      geometry = {
        'representation': 'Brep',
        'profileType': 'POLYGON',
        'vertices': geom.vertices.map((v) => {'x': v.x, 'y': v.y}).toList(),
      };
    } else {
      geometry = {'representation': 'Unknown'};
    }

    return {
      'id': wall.id,
      'ifcType': wall.isStructural ? 'IfcWallStandardCase' : 'IfcWall',
      'predefinedType': wall.isStructural ? 'STANDARD' : 'PARTITIONING',
      'name': '${wall.material} Wall',
      'thickness': wall.thickness,
      'height': wall.height,
      'material': wall.material,
      'isStructural': wall.isStructural,
      'geometry': geometry,
    };
  }

  Map<String, dynamic> _serializeColumn(ArchitecturalColumn col) {
    Map<String, dynamic> profile;
    if (col.isCircular) {
      profile = {
        'type': 'CIRCLE',
        'diameter': col.dimensionX,
        'ifcProfileDef': 'IfcCircleProfileDef',
      };
    } else {
      profile = {
        'type': 'RECTANGLE',
        'width': col.dimensionX,
        'depth': col.dimensionY,
        'rotation': col.rotation,
        'ifcProfileDef': 'IfcRectangleProfileDef',
      };
    }

    return {
      'id': col.id,
      'ifcType': 'IfcColumn',
      'name': '${col.material} Column',
      'position': {
        'x': col.position.x,
        'y': col.position.y,
        'z': 0.0,
      },
      'height': col.height,
      'material': col.material,
      'profile': profile,
    };
  }

  // ── HELPERS ────────────────────────────────────────────────────────────────

  String _sanitizeFilename(String name) =>
      name.replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '_').trim();
}
