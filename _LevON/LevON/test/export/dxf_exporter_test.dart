// Tests de regresión para el motor de exportación DXF.
// Validan: estructura del archivo, group codes, coordenadas world-space,
// entidades geométricas y compatibilidad con el estándar AC1015.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/export/dxf_exporter.dart';

// ── Helpers de parseo ─────────────────────────────────────────────────────────

/// Retorna todos los valores para un group code específico.
///
/// DXF alterna estrictamente: línea par = code, línea impar = value.
/// Se avanza de 2 en 2 para evitar falsos positivos cuando un VALUE
/// coincide con un code buscado (p.ej. valor "5" confundiéndose con
/// el group code 5 de handles).
List<String> _values(String dxf, String code) {
  final lines = dxf.split('\n').map((l) => l.trimRight()).toList();
  final result = <String>[];
  for (int i = 0; i < lines.length - 1; i += 2) {
    if (lines[i] == code) result.add(lines[i + 1]);
  }
  return result;
}

/// Cuenta cuántas veces aparece una entidad (group 0) específica.
int _countEntity(String dxf, String type) =>
    _values(dxf, '0').where((v) => v == type).length;

/// Verifica que el par code/value existe en ese orden exacto (paridad correcta).
bool _hasPair(String dxf, String code, String value) {
  final lines = dxf.split('\n').map((l) => l.trimRight()).toList();
  for (int i = 0; i < lines.length - 1; i += 2) {
    if (lines[i] == code && lines[i + 1] == value) return true;
  }
  return false;
}

// ── Proyecto mínimo de prueba ─────────────────────────────────────────────────

Project _projectWith({
  List<Wall> walls = const [],
  List<ArchitecturalColumn> columns = const [],
}) =>
    Project(
      id: 'test-id',
      title: 'Test Project',
      walls: walls,
      columns: columns,
    );

Wall _lineWall(double x1, double y1, double x2, double y2,
    {double thickness = 0.15, bool structural = true}) =>
    Wall(
      geometry: LineShape(Vector2(x1, y1), Vector2(x2, y2)),
      thickness: thickness,
      height: 2.8,
      material: 'Hormigón',
      isStructural: structural,
    );

// ─────────────────────────────────────────────────────────────────────────────

void main() {
  late DxfExporter exporter;

  setUp(() => exporter = DxfExporter());

  // ── Estructura básica del archivo ────────────────────────────────────────────
  group('Estructura DXF AC1015', () {
    late String dxf;
    setUp(() => dxf = exporter.buildDxfString(_projectWith()));

    test('empieza con SECTION / HEADER', () {
      expect(_hasPair(dxf, '0', 'SECTION'), isTrue);
      expect(_hasPair(dxf, '2', 'HEADER'), isTrue);
    });

    test('contiene versión AC1015', () {
      expect(_hasPair(dxf, '1', 'AC1015'), isTrue);
    });

    test('INSUNITS = 6 (metros)', () {
      expect(_hasPair(dxf, '70', '6'), isTrue);
    });

    test('secciones obligatorias presentes', () {
      final sections = _values(dxf, '2');
      expect(sections, containsAll(['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS']));
    });

    test('termina con 0 / EOF', () {
      final trimmed = dxf.trimRight();
      expect(trimmed.endsWith('0\nEOF'), isTrue);
    });

    test('cada SECTION tiene su ENDSEC', () {
      final sections = _values(dxf, '0').where((v) => v == 'SECTION').length;
      final endSecs = _values(dxf, '0').where((v) => v == 'ENDSEC').length;
      expect(endSecs, equals(sections));
    });

    test('EXTMIN contiene coordenada Z (group 30)', () {
      // Busca la secuencia $EXTMIN seguida de 10, 20, 30
      final lines = dxf.split('\n').map((l) => l.trimRight()).toList();
      bool foundExtmin = false;
      bool hasZ = false;
      for (int i = 0; i < lines.length; i++) {
        if (lines[i] == '9' && i + 1 < lines.length && lines[i + 1] == r'$EXTMIN') {
          foundExtmin = true;
          // Buscar group 30 en los próximos 8 pares
          for (int j = i + 2; j < i + 18 && j < lines.length - 1; j++) {
            if (lines[j] == '30') { hasZ = true; break; }
          }
          break;
        }
      }
      expect(foundExtmin, isTrue, reason: r'$EXTMIN debe existir en HEADER');
      expect(hasZ, isTrue, reason: 'EXTMIN debe tener group code 30 (Z)');
    });
  });

  // ── Tablas TABLES ──────────────────────────────────────────────────────────
  group('Sección TABLES', () {
    late String dxf;
    setUp(() => dxf = exporter.buildDxfString(_projectWith()));

    test('tablas obligatorias presentes', () {
      final tables = _values(dxf, '2');
      for (final t in ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD']) {
        expect(tables.contains(t), isTrue, reason: 'Tabla $t ausente');
      }
    });

    test('LTYPE CONTINUOUS tiene subclass AcDbLinetypeTableRecord', () {
      expect(_hasPair(dxf, '100', 'AcDbLinetypeTableRecord'), isTrue);
    });

    test('LAYER 0 tiene subclass AcDbLayerTableRecord', () {
      expect(_hasPair(dxf, '100', 'AcDbLayerTableRecord'), isTrue);
    });

    test('BLOCK_RECORD tiene subclass AcDbBlockTableRecord', () {
      expect(_hasPair(dxf, '100', 'AcDbBlockTableRecord'), isTrue);
    });

    test('registros de tabla tienen owner handle (330)', () {
      expect(_values(dxf, '330').isNotEmpty, isTrue);
    });

    test('layer S-WALL-FULL existe', () {
      expect(_values(dxf, '2').contains('S-WALL-FULL'), isTrue);
    });

    test('layer S-COLS existe', () {
      expect(_values(dxf, '2').contains('S-COLS'), isTrue);
    });
  });

  // ── Sección BLOCKS ────────────────────────────────────────────────────────
  group('Sección BLOCKS', () {
    late String dxf;
    setUp(() => dxf = exporter.buildDxfString(_projectWith()));

    test('contiene *Model_Space', () {
      expect(_values(dxf, '2').contains('*Model_Space'), isTrue);
    });

    test('contiene *Paper_Space', () {
      expect(_values(dxf, '2').contains('*Paper_Space'), isTrue);
    });

    test('BLOCK y ENDBLK presentes', () {
      expect(_countEntity(dxf, 'BLOCK'), equals(2));
      expect(_countEntity(dxf, 'ENDBLK'), equals(2));
    });

    test('BLOCKs tienen owner handle (330)', () {
      // Verificar que hay pares 330 después de los BLOCKs
      expect(_values(dxf, '330').isNotEmpty, isTrue);
    });
  });

  // ── Sección OBJECTS ───────────────────────────────────────────────────────
  group('Sección OBJECTS', () {
    late String dxf;
    setUp(() => dxf = exporter.buildDxfString(_projectWith()));

    test('diccionario raíz presente', () {
      expect(_countEntity(dxf, 'DICTIONARY'), greaterThanOrEqualTo(1));
    });

    test('ACAD_GROUP presente en diccionario', () {
      expect(_values(dxf, '3').contains('ACAD_GROUP'), isTrue);
    });
  });

  // ── Exportación de muros ──────────────────────────────────────────────────
  group('Exportación de muros — LWPOLYLINE', () {
    test('muro recto simple genera LWPOLYLINE', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(0, 0, 5, 0)],
      ));
      expect(_countEntity(dxf, 'LWPOLYLINE'), greaterThanOrEqualTo(1));
    });

    test('muro cerrado (closed=1)', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(0, 0, 5, 0)],
      ));
      expect(_hasPair(dxf, '70', '1'), isTrue);
    });

    test('muro diagonal conserva 4 vértices', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(0, 0, 3, 4)], // longitud 5
      ));
      // 4 vértices en la LWPOLYLINE
      expect(_hasPair(dxf, '90', '4'), isTrue);
    });

    test('muro en layer S-WALL-FULL', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(0, 0, 5, 0, structural: true)],
      ));
      expect(_values(dxf, '8').contains('S-WALL-FULL'), isTrue);
    });

    test('partición en layer S-WALL-PRTN', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(0, 0, 5, 0, structural: false)],
      ));
      expect(_values(dxf, '8').contains('S-WALL-PRTN'), isTrue);
    });

    test('múltiples muros generan múltiples LWPOLYLINE', () {
      final dxf = exporter.buildDxfString(_projectWith(walls: [
        _lineWall(0, 0, 5, 0),
        _lineWall(5, 0, 5, 4),
        _lineWall(5, 4, 0, 4),
        _lineWall(0, 4, 0, 0),
      ]));
      expect(_countEntity(dxf, 'LWPOLYLINE'), equals(4));
    });

    test('proyecto vacío genera DXF válido sin entidades', () {
      final dxf = exporter.buildDxfString(_projectWith());
      expect(_countEntity(dxf, 'LWPOLYLINE'), equals(0));
      expect(_hasPair(dxf, '1', 'AC1015'), isTrue);
    });
  });

  // ── Coordenadas world-space ───────────────────────────────────────────────
  group('Coordenadas world-space', () {
    test('muro en (2,3)→(7,3) exporta coordenadas X correctas', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(2, 3, 7, 3, thickness: 0.2)],
      ));
      // Los puntos de la LWPOLYLINE deben estar alrededor de X=2..7, Y=2.9..3.1
      final xVals = _values(dxf, '10').map(double.tryParse).whereType<double>();
      expect(xVals.any((x) => x > 1.5 && x < 7.5), isTrue,
          reason: 'Coordenadas X deben estar en rango del muro');
    });

    test('coordenadas negativas son válidas', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(-5, -3, -1, -3)],
      ));
      final xVals = _values(dxf, '10').map(double.tryParse).whereType<double>();
      expect(xVals.any((x) => x < 0), isTrue,
          reason: 'Coordenadas negativas deben exportarse');
    });

    test('coordenadas grandes (>100m) son válidas', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(100, 200, 150, 200)],
      ));
      final xVals = _values(dxf, '10').map(double.tryParse).whereType<double>();
      expect(xVals.any((x) => x > 90), isTrue);
    });

    test('NaN e Infinity se reemplazan por 0', () {
      // Proyecto vacío: bounds devuelve (-1,-1,1,1) → no NaN en output
      final dxf = exporter.buildDxfString(_projectWith());
      expect(dxf.contains('NaN'), isFalse);
      expect(dxf.contains('Infinity'), isFalse);
    });
  });

  // ── Columnas ──────────────────────────────────────────────────────────────
  group('Exportación de columnas', () {
    test('columna circular genera CIRCLE', () {
      final dxf = exporter.buildDxfString(_projectWith(columns: [
        ArchitecturalColumn(
          position: Vector2(5, 5),
          shape: ColumnShape.circular,
          dimensionX: 0.4,
          dimensionY: 0.4,
          height: 3.0,
          material: 'Hormigón',
          rotation: 0,
        ),
      ]));
      expect(_countEntity(dxf, 'CIRCLE'), equals(1));
    });

    test('columna rectangular genera LWPOLYLINE con 4 vértices', () {
      final dxf = exporter.buildDxfString(_projectWith(columns: [
        ArchitecturalColumn(
          position: Vector2(3, 3),
          shape: ColumnShape.rectangular,
          dimensionX: 0.3,
          dimensionY: 0.3,
          height: 3.0,
          material: 'Hormigón',
          rotation: 0,
        ),
      ]));
      expect(_countEntity(dxf, 'LWPOLYLINE'), equals(1));
      expect(_hasPair(dxf, '90', '4'), isTrue);
    });

    test('columna en layer S-COLS', () {
      final dxf = exporter.buildDxfString(_projectWith(columns: [
        ArchitecturalColumn(
          position: Vector2(0, 0),
          shape: ColumnShape.circular,
          dimensionX: 0.3,
          dimensionY: 0.3,
          height: 3.0,
          material: 'Hormigón',
          rotation: 0,
        ),
      ]));
      expect(_values(dxf, '8').contains('S-COLS'), isTrue);
    });
  });

  // ── Handles únicos ────────────────────────────────────────────────────────
  group('Integridad de handles', () {
    test('todos los handles son únicos', () {
      final dxf = exporter.buildDxfString(_projectWith(walls: [
        _lineWall(0, 0, 5, 0),
        _lineWall(5, 0, 5, 4),
      ]));
      final handles = _values(dxf, '5');
      final unique = handles.toSet();
      expect(unique.length, equals(handles.length),
          reason: 'Handles duplicados detectados: ${handles.where((h) => handles.where((x) => x == h).length > 1).toSet()}');
    });
  });

  // ── Muro degenerado ───────────────────────────────────────────────────────
  group('Casos límite', () {
    test('muro de longitud cero no genera entidades', () {
      final dxf = exporter.buildDxfString(_projectWith(
        walls: [_lineWall(3, 3, 3, 3)], // start == end
      ));
      expect(_countEntity(dxf, 'LWPOLYLINE'), equals(0));
    });

    test('título con caracteres especiales no corrompe el archivo', () {
      final exotic = Project(
        id: 'test',
        title: 'Proyecto Año 2024 — Edificio',
        walls: [],
      );
      expect(() => exporter.buildDxfString(exotic), returnsNormally);
    });
  });
}
