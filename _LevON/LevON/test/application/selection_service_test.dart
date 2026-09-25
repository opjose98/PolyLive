// Tests de integración para SelectionService.
// Validan hit-testing de muros, columnas, habitaciones y handles.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/features/editor/application/selection_service.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/shared/domain/shapes.dart';
// ── helpers ────────────────────────────────────────────────────────────────

Wall makeWall(Vector2 a, Vector2 b) => Wall(
      geometry: LineShape(a, b),
      thickness: 0.15,
      height: 2.80,
      material: 'Test',
    );

ArchitecturalColumn circularCol(Vector2 pos, double diam) =>
    ArchitecturalColumn(
      position: pos,
      shape: ColumnShape.circular,
      dimensionX: diam,
      height: 3.0,
      material: 'Test',
    );

ArchitecturalColumn rectCol(Vector2 pos, double w, double h) =>
    ArchitecturalColumn(
      position: pos,
      shape: ColumnShape.rectangular,
      dimensionX: w,
      dimensionY: h,
      height: 3.0,
      material: 'Test',
    );

Room makeRoom(List<Wall> walls) {
  // Construye el polígono usando los startPoints de los muros (cuadrado alineado).
  final polygon = walls.map((w) => w.geometry.startPoint).toList();
  final n = polygon.length;
  double area = 0;
  double cx = 0, cy = 0;
  for (int i = 0; i < n; i++) {
    final j = (i + 1) % n;
    final cross = polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
    area += cross;
    cx += (polygon[i].x + polygon[j].x) * cross;
    cy += (polygon[i].y + polygon[j].y) * cross;
  }
  area = area.abs() / 2;
  final factor = 1 / (6 * (area == 0 ? 1 : area));
  return Room(
    polygon: polygon,
    boundaryWallIds: walls.map((w) => w.id).toList(),
    area: area,
    centroid: Vector2(cx * factor, cy * factor),
    metadata: RoomMetadata(name: 'Test', detectedAt: DateTime(2024)),
    boundary: walls,
  );
}

// ── tests ──────────────────────────────────────────────────────────────────

void main() {
  const threshold = 0.20; // metros
  final svc = SelectionService();

  // ── hitTest — muro ────────────────────────────────────────────────────────

  group('SelectionService.hitTest — muro', () {
    final walls = [makeWall(Vector2(0, 0), Vector2(4, 0))];

    test('punto sobre el muro lo selecciona', () {
      final result = svc.hitTest(
        worldPoint: Vector2(2, 0.05),
        walls: walls,
        rooms: [],
        columns: [],
        thresholdMeters: threshold,
      );
      expect(result, isA<Wall>());
    });

    test('punto lejos del muro no lo selecciona', () {
      final result = svc.hitTest(
        worldPoint: Vector2(2, 1.0),
        walls: walls,
        rooms: [],
        columns: [],
        thresholdMeters: threshold,
      );
      expect(result, isNull);
    });
  });

  // ── hitTest — columna circular ────────────────────────────────────────────

  group('SelectionService.hitTest — columna circular', () {
    final col = circularCol(Vector2(3, 3), 0.40);

    test('punto dentro del radio selecciona columna', () {
      final result = svc.hitTest(
        worldPoint: Vector2(3.1, 3.0),
        walls: [],
        rooms: [],
        columns: [col],
        thresholdMeters: threshold,
      );
      expect(result, isA<ArchitecturalColumn>());
    });

    test('punto fuera del radio+threshold no selecciona columna', () {
      final result = svc.hitTest(
        worldPoint: Vector2(4.0, 3.0),
        walls: [],
        rooms: [],
        columns: [col],
        thresholdMeters: threshold,
      );
      expect(result, isNull);
    });
  });

  // ── hitTest — columna rectangular ─────────────────────────────────────────

  group('SelectionService.hitTest — columna rectangular', () {
    final col = rectCol(Vector2(0, 0), 0.30, 0.50);

    test('punto dentro del bounding box selecciona columna', () {
      final result = svc.hitTest(
        worldPoint: Vector2(0.1, 0.1),
        walls: [],
        rooms: [],
        columns: [col],
        thresholdMeters: threshold,
      );
      expect(result, isA<ArchitecturalColumn>());
    });
  });

  // ── hitTest — habitación ──────────────────────────────────────────────────

  group('SelectionService.hitTest — habitación', () {
    final roomWalls = [
      makeWall(Vector2(0, 0), Vector2(4, 0)),
      makeWall(Vector2(4, 0), Vector2(4, 4)),
      makeWall(Vector2(4, 4), Vector2(0, 4)),
      makeWall(Vector2(0, 4), Vector2(0, 0)),
    ];
    final room = makeRoom(roomWalls);

    test('punto interior a la habitación la selecciona', () {
      final result = svc.hitTest(
        worldPoint: Vector2(2, 2),
        walls: [],
        rooms: [room],
        columns: [],
        thresholdMeters: threshold,
      );
      expect(result, isA<Room>());
    });

    test('punto exterior no selecciona habitación', () {
      final result = svc.hitTest(
        worldPoint: Vector2(6, 6),
        walls: [],
        rooms: [room],
        columns: [],
        thresholdMeters: threshold,
      );
      expect(result, isNull);
    });
  });

  // ── hitTest — prioridad Wall > Column ─────────────────────────────────────

  group('SelectionService.hitTest — prioridad Wall > Column', () {
    test('muro en el mismo punto que una columna: se selecciona el muro', () {
      final wall = makeWall(Vector2(0, 0), Vector2(4, 0));
      final col = circularCol(Vector2(2, 0), 0.40);

      final result = svc.hitTest(
        worldPoint: Vector2(2, 0),
        walls: [wall],
        rooms: [],
        columns: [col],
        thresholdMeters: threshold,
      );
      expect(result, isA<Wall>());
    });
  });

  // ── hitTestHandle — Wall ──────────────────────────────────────────────────

  group('SelectionService.hitTestHandle — Wall', () {
    final wall = makeWall(Vector2(0, 0), Vector2(4, 0));

    test('toca handle inicio → índice 0', () {
      expect(
        svc.hitTestHandle(
          worldPoint: Vector2(0.05, 0.0),
          selectedObject: wall,
          thresholdMeters: threshold,
        ),
        0,
      );
    });

    test('toca handle fin → índice 1', () {
      expect(
        svc.hitTestHandle(
          worldPoint: Vector2(3.95, 0.0),
          selectedObject: wall,
          thresholdMeters: threshold,
        ),
        1,
      );
    });

    test('toca punto medio → índice 2', () {
      expect(
        svc.hitTestHandle(
          worldPoint: Vector2(2.0, 0.05),
          selectedObject: wall,
          thresholdMeters: threshold,
        ),
        2,
      );
    });

    test('lejos de todos los handles → null', () {
      expect(
        svc.hitTestHandle(
          worldPoint: Vector2(10, 10),
          selectedObject: wall,
          thresholdMeters: threshold,
        ),
        isNull,
      );
    });
  });

  // ── hitTestHandle — Column ────────────────────────────────────────────────

  group('SelectionService.hitTestHandle — Column', () {
    final col = circularCol(Vector2(5, 5), 0.40);

    test('toca centro de columna → índice 0', () {
      expect(
        svc.hitTestHandle(
          worldPoint: Vector2(5.05, 5.0),
          selectedObject: col,
          thresholdMeters: threshold,
        ),
        0,
      );
    });
  });

  // ── findNearestNode ───────────────────────────────────────────────────────

  group('SelectionService.findNearestNode', () {
    final walls = [
      makeWall(Vector2(0, 0), Vector2(3, 0)),
      makeWall(Vector2(3, 0), Vector2(3, 4)),
    ];

    test('snap al nodo más cercano', () {
      final node = svc.findNearestNode(
        worldPoint: Vector2(3.1, 0.05),
        walls: walls,
        thresholdMeters: threshold,
      );
      expect(node, isNotNull);
      expect(node!.x, closeTo(3.0, 0.001));
      expect(node.y, closeTo(0.0, 0.001));
    });

    test('sin nodos dentro del umbral retorna null', () {
      final node = svc.findNearestNode(
        worldPoint: Vector2(10, 10),
        walls: walls,
        thresholdMeters: threshold,
      );
      expect(node, isNull);
    });
  });
}
