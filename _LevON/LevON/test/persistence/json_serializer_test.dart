// Tests de integración para JsonSerializer.
// Cubren: round-trip v2.1, backward-compat v2.0 (migración Door/Window),
// backward-compat v1.0, campos opcionales nulos, crash guard de migración.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';

import 'package:levon/persistence/json_serializer.dart';
import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/shared/domain/shapes.dart';

// ── helpers ────────────────────────────────────────────────────────────────

Wall _wall(Vector2 start, Vector2 end) => Wall(
      geometry: LineShape(start, end),
      thickness: 0.15,
      height: 3.0,
      material: 'Generic',
      isStructural: true,
    );

Project _emptyProject() => Project(title: 'Test');

// ── tests ──────────────────────────────────────────────────────────────────

void main() {
  final serializer = JsonSerializer();

  // ── ROUND-TRIP v2.1 ────────────────────────────────────────────────────────

  group('JsonSerializer — round-trip v2.1', () {
    test('proyecto vacío serializa y deserializa sin error', () {
      final json = serializer.serializeProject(_emptyProject());
      final restored = serializer.deserializeProject(json);
      expect(restored.title, 'Test');
    });

    test('ID del proyecto se preserva', () {
      final p = _emptyProject();
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      expect(restored.id, p.id);
    });

    test('título se preserva', () {
      final p = Project(title: 'Mi Edificio');
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      expect(restored.title, 'Mi Edificio');
    });

    test('campos BIM se preservan', () {
      final p = Project(
        title: 'BIM Test',
        bimCode: 'ARC001',
        description: 'Descripción',
        discipline: 'Estructuras',
        author: 'Juan',
      );
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      expect(restored.bimCode, 'ARC001');
      expect(restored.description, 'Descripción');
      expect(restored.discipline, 'Estructuras');
      expect(restored.author, 'Juan');
    });

    test('muro round-trip preserva geometría', () {
      final wall = _wall(Vector2(1, 2), Vector2(4, 6));
      final p = Project(title: 'T', walls: [wall]);
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      final w = restored.walls.first;
      expect(w.geometry.startPoint.x, closeTo(1.0, 1e-6));
      expect(w.geometry.startPoint.y, closeTo(2.0, 1e-6));
      expect(w.geometry.endPoint.x, closeTo(4.0, 1e-6));
      expect(w.geometry.endPoint.y, closeTo(6.0, 1e-6));
    });

    test('muro round-trip preserva propiedades', () {
      final wall = Wall(
        geometry: LineShape(Vector2.zero(), Vector2(3, 0)),
        thickness: 0.20,
        height: 2.80,
        material: 'Brick',
        isStructural: false,
        notes: 'Nota de muro',
      );
      final p = Project(title: 'T', walls: [wall]);
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      final w = restored.walls.first;
      expect(w.thickness, closeTo(0.20, 1e-6));
      expect(w.height, closeTo(2.80, 1e-6));
      expect(w.material, 'Brick');
      expect(w.isStructural, isFalse);
      expect(w.notes, 'Nota de muro');
    });

    test('WallElevation con opening round-trip', () {
      final wall = _wall(Vector2.zero(), Vector2(5, 0));
      final elev = WallElevation(
        wallId: wall.id,
        levels: const VerticalLevels(coronacion: 3.0),
        openings: [
          WallOpening(
            type: OpeningType.door,
            xOffset: 1.0,
            width: 0.9,
            sillHeight: 0.0,
            height: 2.1,
            isFlipped: true,
            notes: 'Puerta principal',
          ),
        ],
      );
      final p = Project(
        title: 'T',
        walls: [wall],
        wallElevations: [elev],
      );
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      final we = restored.wallElevations.first;
      expect(we.openings.length, 1);
      final op = we.openings.first;
      expect(op.type, OpeningType.door);
      expect(op.xOffset, closeTo(1.0, 1e-6));
      expect(op.width, closeTo(0.9, 1e-6));
      expect(op.isFlipped, isTrue);
      expect(op.notes, 'Puerta principal');
    });

    test('columna circular round-trip', () {
      final col = ArchitecturalColumn(
        position: Vector2(2, 3),
        shape: ColumnShape.circular,
        dimensionX: 0.30,
        dimensionY: 0.30,
        height: 3.0,
        material: 'Concrete',
      );
      final p = Project(title: 'T', columns: [col]);
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      final c = restored.columns.first;
      expect(c.position.x, closeTo(2.0, 1e-6));
      expect(c.isCircular, isTrue);
      expect(c.dimensionX, closeTo(0.30, 1e-6));
    });

    test('múltiples muros preservan count y IDs', () {
      final walls = List.generate(
        5,
        (i) => _wall(Vector2(i.toDouble(), 0), Vector2(i + 1.0, 0)),
      );
      final p = Project(title: 'T', walls: walls);
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      expect(restored.walls.length, 5);
      final ids = walls.map((w) => w.id).toSet();
      final restoredIds = restored.walls.map((w) => w.id).toSet();
      expect(restoredIds, ids);
    });

    test('bimCode null se preserva como null', () {
      final p = Project(title: 'T');
      final restored = serializer.deserializeProject(
        serializer.serializeProject(p),
      );
      expect(restored.bimCode, isNull);
    });
  });

  // ── serializeMetadata ─────────────────────────────────────────────────────

  group('JsonSerializer — serializeMetadata', () {
    test('produce JSON con campo title', () {
      final p = Project(title: 'Meta Test');
      final json = serializer.serializeMetadata(p);
      expect(json, contains('"title"'));
      expect(json, contains('Meta Test'));
    });

    test('elementCount incluye muros y columnas', () {
      final wall = _wall(Vector2.zero(), Vector2(1, 0));
      final col = ArchitecturalColumn(
        position: Vector2.zero(),
        shape: ColumnShape.circular,
        dimensionX: 0.3,
        dimensionY: 0.3,
        height: 3.0,
        material: 'C',
      );
      final p = Project(title: 'T', walls: [wall], columns: [col]);
      final json = serializer.serializeMetadata(p);
      expect(json, contains('"elementCount": 2'));
    });
  });

  // ── MIGRACIÓN v2.0 → v2.1 ─────────────────────────────────────────────────

  group('JsonSerializer — migración v2.0 Door/Window', () {
    // Construye un JSON v2.0 con Door y Window elements en el formato antiguo.
    String buildV20Json({
      required String wallId,
      required double wallLength,
      double doorWidth = 0.9,
      double windowSillHeight = 0.9,
    }) {
      return '''
{
  "version": "2.0",
  "project": {
    "id": "proj1",
    "title": "Legacy",
    "createdAt": "2026-01-01T00:00:00.000",
    "updatedAt": "2026-01-01T00:00:00.000"
  },
  "storeys": [{"id": "ground", "name": "PB", "elevation": 0}],
  "elements": [
    {
      "id": "$wallId",
      "type": "Wall",
      "storeyId": "ground",
      "geometry": {
        "type": "Line",
        "profile": [[0,0],[$wallLength,0]],
        "height": 3.0
      },
      "properties": {
        "thickness": 0.15,
        "height": 3.0,
        "material": "Generic",
        "isStructural": true
      }
    },
    {
      "id": "door1",
      "type": "Door",
      "storeyId": "ground",
      "geometry": {"type": "Line", "profile": [[0,0],[1,0]], "height": 2.1},
      "properties": {"width": $doorWidth, "height": 2.1, "thickness": 0.1, "material": "Wood", "isStructural": false}
    },
    {
      "id": "win1",
      "type": "Window",
      "storeyId": "ground",
      "geometry": {"type": "Line", "profile": [[0,0],[1,0]], "height": 1.2},
      "properties": {"width": 1.0, "height": 1.2, "sillHeight": $windowSillHeight, "thickness": 0.1, "material": "Glass", "isStructural": false}
    }
  ],
  "relations": [
    {"type": "HostedBy", "elementId": "door1", "hostId": "$wallId", "positionFromStart": 0.5},
    {"type": "HostedBy", "elementId": "win1", "hostId": "$wallId", "positionFromStart": 2.0}
  ],
  "media": [],
  "elevations": []
}''';
    }

    test('Door se migra a WallOpening de tipo door', () {
      const wallId = 'wall1';
      final json = buildV20Json(wallId: wallId, wallLength: 5.0);
      final project = serializer.deserializeProject(json);
      final we = project.wallElevations
          .where((e) => e.wallId == wallId)
          .firstOrNull;
      expect(we, isNotNull);
      final doors = we!.openings.where((o) => o.type == OpeningType.door);
      expect(doors.length, 1);
      expect(doors.first.sillHeight, closeTo(0.0, 1e-9));
    });

    test('Window se migra a WallOpening de tipo window con sillHeight correcto', () {
      const wallId = 'wall1';
      final json = buildV20Json(wallId: wallId, wallLength: 5.0, windowSillHeight: 1.0);
      final project = serializer.deserializeProject(json);
      final we = project.wallElevations
          .where((e) => e.wallId == wallId)
          .firstOrNull;
      expect(we, isNotNull);
      final wins = we!.openings.where((o) => o.type == OpeningType.window);
      expect(wins.length, 1);
      expect(wins.first.sillHeight, closeTo(1.0, 1e-6));
    });

    test('Door más ancha que el muro no lanza excepción (crash guard)', () {
      const wallId = 'wall1';
      // doorWidth (3.0) > wallLength (2.0) → antes crasheaba con clamp inválido
      final json = buildV20Json(
        wallId: wallId,
        wallLength: 2.0,
        doorWidth: 3.0,
      );
      expect(
        () => serializer.deserializeProject(json),
        returnsNormally,
      );
    });

    test('Door más ancha que el muro se recorta a wallLength', () {
      const wallId = 'wall1';
      final json = buildV20Json(
        wallId: wallId,
        wallLength: 2.0,
        doorWidth: 3.0,
      );
      final project = serializer.deserializeProject(json);
      final we = project.wallElevations
          .where((e) => e.wallId == wallId)
          .firstOrNull;
      final door = we?.openings.where((o) => o.type == OpeningType.door).firstOrNull;
      expect(door, isNotNull);
      expect(door!.width, closeTo(2.0, 1e-6)); // recortado a wallLength
    });

    test('Door sin relación HostedBy se ignora silenciosamente', () {
      const json = '''
{
  "version": "2.0",
  "project": {"id": "p1", "title": "T", "createdAt": "2026-01-01T00:00:00.000", "updatedAt": "2026-01-01T00:00:00.000"},
  "storeys": [{"id": "ground", "name": "PB", "elevation": 0}],
  "elements": [
    {"id": "w1", "type": "Wall", "storeyId": "ground",
     "geometry": {"type": "Line", "profile": [[0,0],[5,0]], "height": 3.0},
     "properties": {"thickness": 0.15, "height": 3.0, "material": "G", "isStructural": true}},
    {"id": "d1", "type": "Door", "storeyId": "ground",
     "geometry": {"type": "Line", "profile": [[0,0],[1,0]], "height": 2.1},
     "properties": {"width": 0.9, "height": 2.1, "thickness": 0.1, "material": "W", "isStructural": false}}
  ],
  "relations": [],
  "media": [],
  "elevations": []
}''';
      expect(() => serializer.deserializeProject(json), returnsNormally);
    });
  });

  // ── COMPATIBILIDAD v1.0 ────────────────────────────────────────────────────

  group('JsonSerializer — compatibilidad v1.0', () {
    test('archivo v1.0 básico deserializa sin error', () {
      const json = '''
{
  "version": "1.0",
  "project": {
    "id": "legacy1",
    "title": "Legacy v1",
    "createdAt": "2025-01-01T00:00:00.000",
    "updatedAt": "2025-01-01T00:00:00.000"
  },
  "elements": {
    "walls": [
      {
        "id": "w1",
        "geometry": {"type": "Line", "start": [0,0], "end": [4,0]},
        "thickness": 0.15,
        "height": 2.8,
        "material": "Brick",
        "isStructural": true
      }
    ],
    "columns": [],
    "photos": [],
    "doors": [],
    "windows": []
  }
}''';
      final project = serializer.deserializeProject(json);
      expect(project.id, 'legacy1');
      expect(project.title, 'Legacy v1');
      expect(project.walls.length, 1);
    });

    test('v1.0 con Door y Window los migra a WallOpenings', () {
      const json = '''
{
  "version": "1.0",
  "project": {"id": "l2", "title": "L2",
    "createdAt": "2025-01-01T00:00:00.000",
    "updatedAt": "2025-01-01T00:00:00.000"},
  "elements": {
    "walls": [
      {"id": "wA", "geometry": {"type": "Line", "start": [0,0], "end": [6,0]},
       "thickness": 0.15, "height": 3.0, "material": "G", "isStructural": true}
    ],
    "columns": [],
    "photos": [],
    "doors": [
      {"id": "d1", "hostWallId": "wA", "positionFromStart": 1.0,
       "width": 0.9, "height": 2.1}
    ],
    "windows": [
      {"id": "win1", "hostWallId": "wA", "positionFromStart": 3.0,
       "width": 1.0, "height": 1.2, "sillHeight": 0.9}
    ]
  }
}''';
      final project = serializer.deserializeProject(json);
      final we = project.wallElevations.where((e) => e.wallId == 'wA').firstOrNull;
      expect(we, isNotNull);
      expect(we!.openings.length, 2);
      final types = we.openings.map((o) => o.type).toSet();
      expect(types, containsAll([OpeningType.door, OpeningType.window]));
    });
  });
}
