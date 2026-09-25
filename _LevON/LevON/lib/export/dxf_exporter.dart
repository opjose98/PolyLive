import 'dart:convert';
import 'dart:io';
import 'dart:math' as math;
import 'package:vector_math/vector_math.dart';

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/persistence/file_storage_service.dart';

/// Genera archivos DXF R2000 (AC1015) válidos desde un [Project] de LevON.
///
/// ESTRUCTURA OBLIGATORIA AC1015:
///   HEADER → CLASSES → TABLES → BLOCKS → ENTITIES → OBJECTS → EOF
///
/// Manejo de handles: AC1015 requiere handles hexadecimales únicos en todas
/// las entidades del archivo. Los handles "well-known" (predefinidos por
/// AutoCAD) se asignan como constantes; los handles dinámicos se asignan
/// secuencialmente a partir de 0x100.
///
/// Handles fijos (requeridos por AutoCAD R2000):
///   0x1  = tabla BLOCK_RECORD
///   0x2  = tabla LAYER
///   0x3  = tabla STYLE
///   0x5  = tabla LTYPE
///   0x6  = tabla VIEW
///   0x7  = tabla UCS
///   0x8  = tabla VPORT
///   0x9  = tabla APPID
///   0xA  = tabla DIMSTYLE
///   0xB  = registro APPID "ACAD"
///   0xC  = diccionario raíz OBJECTS
///   0xD  = diccionario ACAD_GROUP
///   0x1B = BLOCK_RECORD *Paper_Space
///   0x1C = BLOCK begin *Paper_Space
///   0x1D = ENDBLK *Paper_Space
///   0x1E = registro LTYPE CONTINUOUS
///   0x1F = BLOCK_RECORD *Model_Space
///   0x20 = BLOCK begin *Model_Space
///   0x21 = ENDBLK *Model_Space
class DxfExporter {
  final FileStorageService _storage;

  // Handles fijos — NO modificar: AutoCAD R2000 los espera en estas posiciones.
  static const String _hBlkRecTable = '1';
  static const String _hLayerTable = '2';
  static const String _hStyleTable = '3';
  static const String _hLtypeTable = '5';
  static const String _hViewTable = '6';
  static const String _hUcsTable = '7';
  static const String _hVportTable = '8';
  static const String _hAppidTable = '9';
  static const String _hDimTable = 'A';
  static const String _hAppidAcad = 'B';
  static const String _hRootDict = 'C';
  static const String _hGroupDict = 'D';
  static const String _hPaperBlkRec = '1B';
  static const String _hPaperBlkBegin = '1C';
  static const String _hPaperBlkEnd = '1D';
  static const String _hContinuousLtype = '1E';
  static const String _hModelBlkRec = '1F';
  static const String _hModelBlkBegin = '20';
  static const String _hModelBlkEnd = '21';

  // Handles dinámicos — empiezan en 0x100 para no colisionar con los fijos.
  int _handleCounter = 0x100;

  // Decimales para coordenadas — se establece al inicio de cada exportación.
  int _exportPrecision = 4;

  DxfExporter({FileStorageService? storage})
      : _storage = storage ?? FileStorageService();

  String get _nextHandle {
    final h = _handleCounter.toRadixString(16).toUpperCase();
    _handleCounter++;
    return h;
  }

  // ── API PÚBLICA ────────────────────────────────────────────────────────────

  Future<String> exportToDxf(
    Project project, {
    String? targetDirectory,
    int exportPrecision = 4,
  }) async {
    _handleCounter = 0x100;
    _exportPrecision = exportPrecision;
    _validateProject(project);
    final content = _buildDxf(project);
    final sanitized = _sanitizeFilename(project.title);
    final file = targetDirectory != null
        ? File('$targetDirectory${Platform.pathSeparator}$sanitized.dxf')
        : await _storage.exportFile('$sanitized.dxf');
    // DXF requiere LF puro (\n) — no usar SystemEncoding (puede introducir CRLF)
    await file.writeAsString(content, encoding: utf8, flush: true);
    return file.path;
  }

  /// Retorna el contenido DXF como string — útil para testing y preview.
  String buildDxfString(Project project) {
    _validateProject(project);
    return _buildDxf(project);
  }

  // ── VALIDACIÓN ────────────────────────────────────────────────────────────

  void _validateProject(Project project) {
    if (project.title.isEmpty) {
      throw const DxfExportException('El título del proyecto no puede estar vacío.');
    }
  }

  // ── CONSTRUCTOR PRINCIPAL ─────────────────────────────────────────────────

  String _buildDxf(Project project) {
    _handleCounter = 0x100;
    final buf = StringBuffer();
    _writeHeader(buf, project);
    _writeClasses(buf);
    _writeTables(buf);
    _writeBlocks(buf);
    _writeEntities(buf, project);
    _writeObjects(buf);
    _ln(buf, '0', 'EOF');
    return buf.toString();
  }

  // ── SECCIÓN HEADER ────────────────────────────────────────────────────────

  void _writeHeader(StringBuffer buf, Project project) {
    _ln(buf, '0', 'SECTION');
    _ln(buf, '2', 'HEADER');

    _ln(buf, '9', r'$ACADVER');
    _ln(buf, '1', 'AC1015');

    _ln(buf, '9', r'$ACADMAINTVER');
    _ln(buf, '70', '6');

    _ln(buf, '9', r'$HANDSEED');
    _ln(buf, '5', 'FFFF');

    _ln(buf, '9', r'$INSUNITS');
    _ln(buf, '70', '6'); // 6 = metros

    _ln(buf, '9', r'$LUNITS');
    _ln(buf, '70', '2'); // 2 = decimal

    _ln(buf, '9', r'$LUPREC');
    _ln(buf, '70', '4');

    final (minX, minY, maxX, maxY) = _computeBounds(project);
    _ln(buf, '9', r'$EXTMIN');
    _ln(buf, '10', _f(minX));
    _ln(buf, '20', _f(minY));
    _ln(buf, '30', '0.0'); // Z requerido — omitirlo corrompe el header

    _ln(buf, '9', r'$EXTMAX');
    _ln(buf, '10', _f(maxX));
    _ln(buf, '20', _f(maxY));
    _ln(buf, '30', '0.0');

    _ln(buf, '9', r'$LIMMIN');
    _ln(buf, '10', '0.0');
    _ln(buf, '20', '0.0');

    _ln(buf, '9', r'$LIMMAX');
    _ln(buf, '10', _f(maxX + 1.0));
    _ln(buf, '20', _f(maxY + 1.0));

    _ln(buf, '0', 'ENDSEC');
  }

  (double, double, double, double) _computeBounds(Project project) {
    double minX = double.infinity, minY = double.infinity;
    double maxX = double.negativeInfinity, maxY = double.negativeInfinity;

    void expand(Vector2 p) {
      if (!p.x.isFinite || !p.y.isFinite) return;
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    for (final w in project.walls) {
      expand(w.geometry.startPoint);
      expand(w.geometry.endPoint);
    }
    for (final c in project.columns) {
      final r = math.max(c.dimensionX, c.dimensionY) / 2;
      expand(c.position + Vector2(r, r));
      expand(c.position - Vector2(r, r));
    }

    if (minX == double.infinity) return (-1.0, -1.0, 1.0, 1.0);
    const margin = 1.0;
    return (minX - margin, minY - margin, maxX + margin, maxY + margin);
  }

  // ── SECCIÓN CLASSES ───────────────────────────────────────────────────────

  void _writeClasses(StringBuffer buf) {
    _ln(buf, '0', 'SECTION');
    _ln(buf, '2', 'CLASSES');
    _ln(buf, '0', 'ENDSEC');
  }

  // ── SECCIÓN TABLES ────────────────────────────────────────────────────────

  void _writeTables(StringBuffer buf) {
    _ln(buf, '0', 'SECTION');
    _ln(buf, '2', 'TABLES');

    _writeVportTable(buf);
    _writeLtypeTable(buf);
    _writeLayerTable(buf);
    _writeStyleTable(buf);
    _writeViewTable(buf);
    _writeUcsTable(buf);
    _writeAppidTable(buf);
    _writeDimstyleTable(buf);
    _writeBlockRecordTable(buf);

    _ln(buf, '0', 'ENDSEC');
  }

  void _writeVportTable(StringBuffer buf) {
    _tableHeader(buf, 'VPORT', _hVportTable, 0);
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeLtypeTable(StringBuffer buf) {
    // 3 registros: CONTINUOUS, ByLayer, ByBlock
    _tableHeader(buf, 'LTYPE', _hLtypeTable, 3);
    _writeLtypeRecord(buf, 'CONTINUOUS', 'Solid line', [], _hContinuousLtype, _hLtypeTable);
    _writeLtypeRecord(buf, 'ByLayer', '', [], _nextHandle, _hLtypeTable);
    _writeLtypeRecord(buf, 'ByBlock', '', [], _nextHandle, _hLtypeTable);
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeLtypeRecord(StringBuffer buf, String name, String desc,
      List<double> pattern, String handle, String ownerHandle) {
    _ln(buf, '0', 'LTYPE');
    _ln(buf, '5', handle);
    _ln(buf, '330', ownerHandle); // owner = tabla LTYPE
    _ln(buf, '100', 'AcDbSymbolTableRecord');
    _ln(buf, '100', 'AcDbLinetypeTableRecord');
    _ln(buf, '2', name);
    _ln(buf, '70', '0');
    _ln(buf, '3', desc);
    _ln(buf, '72', '65');
    if (pattern.isNotEmpty) {
      _ln(buf, '73', pattern.length.toString());
      final total = pattern.map((v) => v.abs()).reduce((a, b) => a + b);
      _ln(buf, '40', _f(total));
      for (final v in pattern) {
        _ln(buf, '49', _f(v));
        _ln(buf, '74', '0');
      }
    } else {
      _ln(buf, '73', '0');
      _ln(buf, '40', '0.0');
    }
  }

  void _writeLayerTable(StringBuffer buf) {
    _tableHeader(buf, 'LAYER', _hLayerTable, 6);
    _writeLayerRecord(buf, '0', 7, 'CONTINUOUS');
    _writeLayerRecord(buf, 'S-WALL-FULL', 7, 'CONTINUOUS');
    _writeLayerRecord(buf, 'S-WALL-PRTN', 8, 'CONTINUOUS');
    _writeLayerRecord(buf, 'S-COLS', 3, 'CONTINUOUS');
    _writeLayerRecord(buf, 'S-ROOM-BNDY', 4, 'CONTINUOUS');
    _writeLayerRecord(buf, 'S-OPEN', 5, 'CONTINUOUS');
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeLayerRecord(StringBuffer buf, String name, int color, String ltype) {
    _ln(buf, '0', 'LAYER');
    _ln(buf, '5', _nextHandle);
    _ln(buf, '330', _hLayerTable); // owner = tabla LAYER
    _ln(buf, '100', 'AcDbSymbolTableRecord');
    _ln(buf, '100', 'AcDbLayerTableRecord');
    _ln(buf, '2', name);
    _ln(buf, '70', '0');
    _ln(buf, '62', color.toString());
    _ln(buf, '6', ltype);
    _ln(buf, '390', _hStyleTable); // plotstyle — apunta a tabla STYLE
  }

  void _writeStyleTable(StringBuffer buf) {
    _tableHeader(buf, 'STYLE', _hStyleTable, 1);
    _ln(buf, '0', 'STYLE');
    _ln(buf, '5', _nextHandle);
    _ln(buf, '330', _hStyleTable);
    _ln(buf, '100', 'AcDbSymbolTableRecord');
    _ln(buf, '100', 'AcDbTextStyleTableRecord');
    _ln(buf, '2', 'Standard');
    _ln(buf, '70', '0');
    _ln(buf, '40', '0.0');
    _ln(buf, '41', '1.0');
    _ln(buf, '50', '0.0');
    _ln(buf, '71', '0');
    _ln(buf, '42', '2.5');
    _ln(buf, '3', 'txt');
    _ln(buf, '4', '');
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeViewTable(StringBuffer buf) {
    _tableHeader(buf, 'VIEW', _hViewTable, 0);
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeUcsTable(StringBuffer buf) {
    _tableHeader(buf, 'UCS', _hUcsTable, 0);
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeAppidTable(StringBuffer buf) {
    _tableHeader(buf, 'APPID', _hAppidTable, 1);
    _ln(buf, '0', 'APPID');
    _ln(buf, '5', _hAppidAcad);
    _ln(buf, '330', _hAppidTable);
    _ln(buf, '100', 'AcDbSymbolTableRecord');
    _ln(buf, '100', 'AcDbRegAppTableRecord');
    _ln(buf, '2', 'ACAD');
    _ln(buf, '70', '0');
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeDimstyleTable(StringBuffer buf) {
    _tableHeader(buf, 'DIMSTYLE', _hDimTable, 0);
    _ln(buf, '100', 'AcDbDimStyleTable');
    _ln(buf, '0', 'ENDTAB');
  }

  void _writeBlockRecordTable(StringBuffer buf) {
    _tableHeader(buf, 'BLOCK_RECORD', _hBlkRecTable, 2);

    _ln(buf, '0', 'BLOCK_RECORD');
    _ln(buf, '5', _hModelBlkRec);
    _ln(buf, '330', _hBlkRecTable);
    _ln(buf, '100', 'AcDbSymbolTableRecord');
    _ln(buf, '100', 'AcDbBlockTableRecord');
    _ln(buf, '2', '*Model_Space');

    _ln(buf, '0', 'BLOCK_RECORD');
    _ln(buf, '5', _hPaperBlkRec);
    _ln(buf, '330', _hBlkRecTable);
    _ln(buf, '100', 'AcDbSymbolTableRecord');
    _ln(buf, '100', 'AcDbBlockTableRecord');
    _ln(buf, '2', '*Paper_Space');

    _ln(buf, '0', 'ENDTAB');
  }

  void _tableHeader(StringBuffer buf, String name, String handle, int count) {
    _ln(buf, '0', 'TABLE');
    _ln(buf, '2', name);
    _ln(buf, '5', handle);
    _ln(buf, '330', '0'); // owner = base de datos raíz
    _ln(buf, '100', 'AcDbSymbolTable');
    _ln(buf, '70', count.toString());
  }

  // ── SECCIÓN BLOCKS ────────────────────────────────────────────────────────

  void _writeBlocks(StringBuffer buf) {
    _ln(buf, '0', 'SECTION');
    _ln(buf, '2', 'BLOCKS');

    // *Model_Space block
    _ln(buf, '0', 'BLOCK');
    _ln(buf, '5', _hModelBlkBegin);
    _ln(buf, '330', _hModelBlkRec); // owner = BLOCK_RECORD *Model_Space
    _ln(buf, '100', 'AcDbEntity');
    _ln(buf, '8', '0');
    _ln(buf, '100', 'AcDbBlockBegin');
    _ln(buf, '2', '*Model_Space');
    _ln(buf, '70', '0');
    _ln(buf, '10', '0.0');
    _ln(buf, '20', '0.0');
    _ln(buf, '30', '0.0');
    _ln(buf, '3', '*Model_Space');
    _ln(buf, '1', '');
    _ln(buf, '0', 'ENDBLK');
    _ln(buf, '5', _hModelBlkEnd);
    _ln(buf, '330', _hModelBlkRec);
    _ln(buf, '100', 'AcDbEntity');
    _ln(buf, '8', '0');
    _ln(buf, '100', 'AcDbBlockEnd');

    // *Paper_Space block
    _ln(buf, '0', 'BLOCK');
    _ln(buf, '5', _hPaperBlkBegin);
    _ln(buf, '330', _hPaperBlkRec); // owner = BLOCK_RECORD *Paper_Space
    _ln(buf, '100', 'AcDbEntity');
    _ln(buf, '67', '1'); // 67=1 indica paper space
    _ln(buf, '8', '0');
    _ln(buf, '100', 'AcDbBlockBegin');
    _ln(buf, '2', '*Paper_Space');
    _ln(buf, '70', '0');
    _ln(buf, '10', '0.0');
    _ln(buf, '20', '0.0');
    _ln(buf, '30', '0.0');
    _ln(buf, '3', '*Paper_Space');
    _ln(buf, '1', '');
    _ln(buf, '0', 'ENDBLK');
    _ln(buf, '5', _hPaperBlkEnd);
    _ln(buf, '330', _hPaperBlkRec);
    _ln(buf, '100', 'AcDbEntity');
    _ln(buf, '67', '1');
    _ln(buf, '8', '0');
    _ln(buf, '100', 'AcDbBlockEnd');

    _ln(buf, '0', 'ENDSEC');
  }

  // ── SECCIÓN ENTITIES ──────────────────────────────────────────────────────

  void _writeEntities(StringBuffer buf, Project project) {
    _ln(buf, '0', 'SECTION');
    _ln(buf, '2', 'ENTITIES');

    for (final wall in project.walls) {
      _writeWall(buf, wall);
    }
    for (final col in project.columns) {
      _writeColumn(buf, col);
    }
    for (final space in project.spaces.values) {
      _writeOpenings(buf, space.walls, space.wallElevations);
    }

    _ln(buf, '0', 'ENDSEC');
  }

  // ── ENTIDADES: MURO ───────────────────────────────────────────────────────

  void _writeWall(StringBuffer buf, Wall wall) {
    final layer = wall.isStructural ? 'S-WALL-FULL' : 'S-WALL-PRTN';
    final geom = wall.geometry;

    if (geom is LineShape) {
      _writeLineWall(buf, geom, wall.thickness, layer);
    } else if (geom is ArcShape) {
      _writeArcWall(buf, geom, wall.thickness, layer);
    } else if (geom is PolygonShape) {
      _writePolygonWall(buf, geom, layer);
    }
  }

  /// Muro recto → LWPOLYLINE cerrada (opción C: polilínea del contorno real).
  /// Representa el muro con su espesor real en planta.
  void _writeLineWall(
      StringBuffer buf, LineShape line, double thickness, String layer) {
    final dir = (line.end - line.start);
    final len = dir.length;
    if (len < 1e-9) return; // degenerate wall — ignorar

    final unitDir = dir / len;
    final normal = Vector2(-unitDir.y, unitDir.x);
    final half = thickness / 2;

    final pts = [
      line.start + normal * half,
      line.end + normal * half,
      line.end - normal * half,
      line.start - normal * half,
    ];
    _writeLwPolyline(buf, layer, pts, closed: true);
  }

  void _writeArcWall(
      StringBuffer buf, ArcShape arc, double thickness, String layer) {
    if (arc.radius <= 0) return;
    final half = thickness / 2;
    _writeArc(buf, layer, arc.center, arc.radius - half, arc.startAngle,
        arc.sweepAngle);
    _writeArc(buf, layer, arc.center, arc.radius + half, arc.startAngle,
        arc.sweepAngle);
  }

  void _writePolygonWall(StringBuffer buf, PolygonShape poly, String layer) {
    if (poly.vertices.length < 2) return;
    _writeLwPolyline(buf, layer, poly.vertices, closed: false);
  }

  // ── ENTIDADES: COLUMNA ────────────────────────────────────────────────────

  void _writeColumn(StringBuffer buf, ArchitecturalColumn col) {
    const layer = 'S-COLS';
    if (col.isCircular) {
      _writeCircle(buf, layer, col.position, col.dimensionX / 2);
    } else {
      final corners = _rectCorners(
          col.position, col.dimensionX, col.dimensionY, col.rotation);
      _writeLwPolyline(buf, layer, corners, closed: true);
    }
  }

  List<Vector2> _rectCorners(
      Vector2 center, double w, double h, double rotation) {
    final hw = w / 2;
    final hh = h / 2;
    final cos = math.cos(rotation);
    final sin = math.sin(rotation);
    Vector2 rot(double x, double y) =>
        Vector2(center.x + x * cos - y * sin, center.y + x * sin + y * cos);
    return [rot(-hw, -hh), rot(hw, -hh), rot(hw, hh), rot(-hw, hh)];
  }

  // ── ENTIDADES: HUECOS (PLAN VIEW) ─────────────────────────────────────────

  void _writeOpenings(StringBuffer buf, List<Wall> walls, List<WallElevation> elevations) {
    final wallById = {for (final w in walls) w.id: w};
    for (final elev in elevations) {
      final wall = wallById[elev.wallId];
      if (wall == null || wall.geometry is! LineShape) continue;
      final geom = wall.geometry as LineShape;
      final len = geom.length;
      if (len < 1e-9) continue;
      final dir = (geom.end - geom.start) / len;
      final perp = Vector2(-dir.y, dir.x);
      for (final op in elev.openings) {
        if (op.type == OpeningType.door) {
          _writeDoorPlan(buf, geom.start, dir, perp, op);
        } else if (op.type == OpeningType.window) {
          _writeWindowPlan(buf, geom.start, dir, perp, op, wall.thickness);
        }
      }
    }
  }

  void _writeDoorPlan(StringBuffer buf, Vector2 wallStart, Vector2 dir, Vector2 perp, WallOpening op) {
    const layer = 'S-OPEN';
    final side = op.isFlipped ? -1.0 : 1.0;
    final hinge = wallStart + dir * op.xOffset;
    final leafEnd = hinge + perp * (op.width * side);

    // Hoja de puerta — línea
    _writeLine(buf, layer, hinge, leafEnd);

    // Arco de apertura (cuarto de círculo)
    final baseAngle = math.atan2(perp.y * side, perp.x * side);
    final sweepAngle = -math.pi / 2 * side;
    _writeArc(buf, layer, hinge, op.width, baseAngle, sweepAngle);
  }

  void _writeWindowPlan(StringBuffer buf, Vector2 wallStart, Vector2 dir, Vector2 perp, WallOpening op, double wallThickness) {
    const layer = 'S-OPEN';
    final offset = wallThickness * 0.35;
    final p0 = wallStart + dir * op.xOffset;
    final p1 = wallStart + dir * op.xEnd;
    // Marco: dos líneas paralelas
    for (final sign in [-1.0, 1.0]) {
      _writeLine(buf, layer, p0 + perp * (offset * sign), p1 + perp * (offset * sign));
    }
    // Línea central (vidrio)
    _writeLine(buf, layer, p0, p1);
  }

  void _writeLine(StringBuffer buf, String layer, Vector2 a, Vector2 b) {
    _entityHeader(buf, 'LINE', layer);
    _ln(buf, '100', 'AcDbLine');
    _ln(buf, '10', _f(a.x));
    _ln(buf, '20', _f(a.y));
    _ln(buf, '30', '0.0');
    _ln(buf, '11', _f(b.x));
    _ln(buf, '21', _f(b.y));
    _ln(buf, '31', '0.0');
  }

  // ── SECCIÓN OBJECTS ───────────────────────────────────────────────────────

  void _writeObjects(StringBuffer buf) {
    _ln(buf, '0', 'SECTION');
    _ln(buf, '2', 'OBJECTS');

    // Diccionario raíz — handle 0xC, owner = base de datos (330=0)
    _ln(buf, '0', 'DICTIONARY');
    _ln(buf, '5', _hRootDict);
    _ln(buf, '330', '0');
    _ln(buf, '100', 'AcDbDictionary');
    _ln(buf, '281', '1');
    // Entrada: ACAD_GROUP → sub-diccionario
    _ln(buf, '3', 'ACAD_GROUP');
    _ln(buf, '350', _hGroupDict);

    // Sub-diccionario ACAD_GROUP — vacío, requerido por AC1015
    _ln(buf, '0', 'DICTIONARY');
    _ln(buf, '5', _hGroupDict);
    _ln(buf, '330', _hRootDict);
    _ln(buf, '100', 'AcDbDictionary');
    _ln(buf, '281', '1');

    _ln(buf, '0', 'ENDSEC');
  }

  // ── PRIMITIVAS ────────────────────────────────────────────────────────────

  /// Escribe el header común de entidad en model space.
  void _entityHeader(StringBuffer buf, String type, String layer) {
    _ln(buf, '0', type);
    _ln(buf, '5', _nextHandle);
    _ln(buf, '330', _hModelBlkRec); // owner = *Model_Space
    _ln(buf, '100', 'AcDbEntity');
    _ln(buf, '8', layer);
  }

  void _writeCircle(StringBuffer buf, String layer, Vector2 center, double r) {
    if (r <= 0 || !r.isFinite) return;
    _entityHeader(buf, 'CIRCLE', layer);
    _ln(buf, '100', 'AcDbCircle');
    _ln(buf, '10', _f(center.x));
    _ln(buf, '20', _f(center.y));
    _ln(buf, '30', '0.0');
    _ln(buf, '40', _f(r));
  }

  void _writeArc(StringBuffer buf, String layer, Vector2 center, double r,
      double startRad, double sweepRad) {
    if (r <= 0 || !r.isFinite) return;
    final startDeg = _toDeg(startRad) % 360.0;
    var endDeg = _toDeg(startRad + sweepRad) % 360.0;
    if (endDeg < 0) endDeg += 360.0;

    _entityHeader(buf, 'ARC', layer);
    _ln(buf, '100', 'AcDbCircle');
    _ln(buf, '10', _f(center.x));
    _ln(buf, '20', _f(center.y));
    _ln(buf, '30', '0.0');
    _ln(buf, '40', _f(r));
    _ln(buf, '100', 'AcDbArc');
    _ln(buf, '50', _f(sweepRad >= 0 ? startDeg : endDeg));
    _ln(buf, '51', _f(sweepRad >= 0 ? endDeg : startDeg));
  }

  void _writeLwPolyline(StringBuffer buf, String layer, List<Vector2> pts,
      {required bool closed}) {
    if (pts.isEmpty) return;
    _entityHeader(buf, 'LWPOLYLINE', layer);
    _ln(buf, '100', 'AcDbPolyline');
    _ln(buf, '90', pts.length.toString());
    _ln(buf, '70', closed ? '1' : '0');
    _ln(buf, '43', '0.0'); // constant width
    for (final pt in pts) {
      _ln(buf, '10', _f(pt.x));
      _ln(buf, '20', _f(pt.y));
    }
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  /// Escribe un par grupo/valor DXF: cada uno en su propia línea.
  void _ln(StringBuffer buf, String code, String value) {
    buf.write(code);
    buf.write('\n');
    buf.write(value);
    buf.write('\n');
  }

  String _f(double v) {
    if (!v.isFinite) return '0.0';
    final s = v.toStringAsFixed(_exportPrecision);
    // Evitar "-0.000…" que confunde a algunos parsers DXF
    final negZero = '-0.${'0' * _exportPrecision}';
    return s == negZero ? s.substring(1) : s;
  }

  double _toDeg(double rad) => rad * 180.0 / math.pi;

  String _sanitizeFilename(String name) =>
      name.replaceAll(RegExp(r'[<>:"/\\|?*\x00-\x1F]'), '_').trim();
}

class DxfExportException implements Exception {
  final String message;
  const DxfExportException(this.message);
  @override
  String toString() => 'DxfExportException: $message';
}
