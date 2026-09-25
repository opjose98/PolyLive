// Tests unitarios para WallCslService.
// Cubren: transforms CSL↔world, validateOpening, validateOverlap, snap functions.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/walls/application/wall_csl_service.dart';
import 'package:levon/shared/domain/shapes.dart';

// ── helpers ────────────────────────────────────────────────────────────────

/// Muro horizontal de [length] metros desde (0,0).
Wall _wall(double length, {double height = 3.0, double thickness = 0.15}) =>
    Wall(
      geometry: LineShape(Vector2.zero(), Vector2(length, 0)),
      thickness: thickness,
      height: height,
      material: 'Test',
    );

WallElevation _emptyElev(Wall wall) =>
    WallElevation.defaults(wall.id, wall.height);

WallOpening _door({
  double xOffset = 0.5,
  double width = 0.9,
  double height = 2.1,
}) =>
    WallOpening(
      type: OpeningType.door,
      xOffset: xOffset,
      width: width,
      sillHeight: 0.0,
      height: height,
    );

WallOpening _window({
  double xOffset = 1.0,
  double width = 1.0,
  double height = 1.2,
  double sillHeight = 0.9,
}) =>
    WallOpening(
      type: OpeningType.window,
      xOffset: xOffset,
      width: width,
      sillHeight: sillHeight,
      height: height,
    );

WallOpening _opening({
  double xOffset = 0.5,
  double width = 0.8,
  double height = 2.0,
}) =>
    WallOpening(
      type: OpeningType.opening,
      xOffset: xOffset,
      width: width,
      sillHeight: 0.0,
      height: height,
    );

// ── tests ──────────────────────────────────────────────────────────────────

void main() {
  // ── TRANSFORMS ─────────────────────────────────────────────────────────────

  group('WallCslService — direction / worldToLocalX / localXToWorld', () {
    test('direction de muro horizontal es (1, 0)', () {
      final wall = _wall(5.0);
      final d = WallCslService.direction(wall);
      expect(d.x, closeTo(1.0, 1e-9));
      expect(d.y, closeTo(0.0, 1e-9));
    });

    test('direction de muro vertical es (0, 1)', () {
      final wall = Wall(
        geometry: LineShape(Vector2.zero(), Vector2(0, 4)),
        thickness: 0.15,
        height: 3.0,
        material: 'Test',
      );
      final d = WallCslService.direction(wall);
      expect(d.x, closeTo(0.0, 1e-9));
      expect(d.y, closeTo(1.0, 1e-9));
    });

    test('worldToLocalX proyecta correctamente punto en eje del muro', () {
      final wall = _wall(5.0);
      final x = WallCslService.worldToLocalX(wall, Vector2(2.5, 99));
      expect(x, closeTo(2.5, 1e-9));
    });

    test('localXToWorld invierte worldToLocalX (round-trip)', () {
      final wall = Wall(
        geometry: LineShape(Vector2(1, 2), Vector2(4, 6)),
        thickness: 0.15,
        height: 3.0,
        material: 'Test',
      );
      const localX = 2.0;
      final world = WallCslService.localXToWorld(wall, localX);
      final backX = WallCslService.worldToLocalX(wall, world);
      expect(backX, closeTo(localX, 1e-9));
    });

    test('direction de muro degenerado (longitud cero) retorna (1, 0)', () {
      final wall = Wall(
        geometry: LineShape(Vector2(1, 1), Vector2(1, 1)),
        thickness: 0.15,
        height: 3.0,
        material: 'Test',
      );
      final d = WallCslService.direction(wall);
      expect(d.x, closeTo(1.0, 1e-9));
    });
  });

  // ── validateOpening ────────────────────────────────────────────────────────

  group('WallCslService — validateOpening', () {
    test('puerta válida dentro del muro retorna valid', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      final result = WallCslService.validateOpening(_door(), elev, wall);
      expect(result.isValid, isTrue);
    });

    test('width <= 0 retorna error', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      final bad = _door().copyWith(width: 0.0);
      final result = WallCslService.validateOpening(bad, elev, wall);
      expect(result.severity, ValidationSeverity.error);
    });

    test('height <= 0 retorna error', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      final bad = _door().copyWith(height: -1.0);
      final result = WallCslService.validateOpening(bad, elev, wall);
      expect(result.severity, ValidationSeverity.error);
    });

    test('xOffset negativo retorna error', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      final bad = _door(xOffset: -0.1);
      final result = WallCslService.validateOpening(bad, elev, wall);
      expect(result.severity, ValidationSeverity.error);
    });

    test('opening que excede longitud del muro retorna warning', () {
      final wall = _wall(2.0);
      final elev = _emptyElev(wall);
      final big = _door(xOffset: 1.5, width: 0.9); // 1.5 + 0.9 = 2.4 > 2.0
      final result = WallCslService.validateOpening(big, elev, wall);
      expect(result.severity, ValidationSeverity.warning);
    });

    test('opening que excede altura del muro retorna warning', () {
      final wall = _wall(5.0, height: 2.0);
      final elev = _emptyElev(wall);
      final tall = _door().copyWith(height: 2.5); // sill=0 + h=2.5 > wall.height=2.0
      final result = WallCslService.validateOpening(tall, elev, wall);
      expect(result.severity, ValidationSeverity.warning);
    });

    test('Door↔Door solapamiento retorna error', () {
      final wall = _wall(5.0);
      final door1 = _door(xOffset: 0.5, width: 1.0);
      final door2 = _door(xOffset: 1.0, width: 1.0); // solapa con door1
      final elev = WallElevation(
        wallId: wall.id,
        levels: VerticalLevels(coronacion: wall.height),
        openings: [door1],
      );
      final result = WallCslService.validateOpening(door2, elev, wall);
      expect(result.severity, ValidationSeverity.error);
    });

    test('Opening↔Door solapamiento retorna warning (no error)', () {
      final wall = _wall(5.0);
      final door = _door(xOffset: 0.5, width: 1.0);
      final op = _opening(xOffset: 0.8, width: 0.5); // solapa con door
      final elev = WallElevation(
        wallId: wall.id,
        levels: VerticalLevels(coronacion: wall.height),
        openings: [door],
      );
      final result = WallCslService.validateOpening(op, elev, wall);
      expect(result.severity, ValidationSeverity.warning);
    });

    test('openings sin solapamiento 2D son válidos', () {
      final wall = _wall(5.0);
      final door = _door(xOffset: 0.5, width: 0.9);
      final win = _window(xOffset: 2.0, width: 1.0);
      final elev = WallElevation(
        wallId: wall.id,
        levels: VerticalLevels(coronacion: wall.height),
        openings: [door],
      );
      final result = WallCslService.validateOpening(win, elev, wall);
      expect(result.isValid, isTrue);
    });
  });

  // ── validateOverlap ────────────────────────────────────────────────────────

  group('WallCslService — validateOverlap', () {
    test('Opening↔Opening permitido (retorna null)', () {
      final op1 = _opening(xOffset: 0.0, width: 1.0);
      final op2 = _opening(xOffset: 0.5, width: 1.0);
      expect(WallCslService.validateOverlap(op2, [op1]), isNull);
    });

    test('Door↔Door retorna mensaje de error', () {
      final d1 = _door(xOffset: 0.0, width: 1.0);
      final d2 = _door(xOffset: 0.5, width: 1.0);
      expect(WallCslService.validateOverlap(d2, [d1]), isNotNull);
    });

    test('Door↔Window retorna mensaje de error', () {
      final d = _door(xOffset: 0.0, width: 1.0);
      final w = _window(xOffset: 0.5, width: 1.0, sillHeight: 0.0, height: 2.1);
      expect(WallCslService.validateOverlap(w, [d]), isNotNull);
    });

    test('Opening↔Door retorna mensaje de error', () {
      final d = _door(xOffset: 0.0, width: 1.0);
      final op = _opening(xOffset: 0.5, width: 0.5);
      expect(WallCslService.validateOverlap(op, [d]), isNotNull);
    });

    test('sin solapamiento retorna null', () {
      final d1 = _door(xOffset: 0.0, width: 0.9);
      final d2 = _door(xOffset: 1.0, width: 0.9);
      expect(WallCslService.validateOverlap(d2, [d1]), isNull);
    });

    test('lista vacía siempre retorna null', () {
      expect(WallCslService.validateOverlap(_door(), []), isNull);
    });
  });

  // ── snapX / snapY ──────────────────────────────────────────────────────────

  group('WallCslService — snapX', () {
    test('snap a 0.05 redondea correctamente', () {
      expect(WallCslService.snapX(1.03, 0.05), closeTo(1.05, 1e-9));
      expect(WallCslService.snapX(1.02, 0.05), closeTo(1.00, 1e-9));
    });

    test('step <= 0 retorna el valor sin modificar', () {
      expect(WallCslService.snapX(1.234, 0.0), closeTo(1.234, 1e-9));
      expect(WallCslService.snapX(1.234, -0.1), closeTo(1.234, 1e-9));
    });
  });

  group('WallCslService — snapY', () {
    test('snap a nivel NMS (base) tiene prioridad sobre grid', () {
      final wall = _wall(5.0, height: 3.0);
      final elev = _emptyElev(wall);
      // base = 0.0; con step = 0.10, el punto 0.03 debería snap a 0.0 (NMS)
      expect(WallCslService.snapY(0.03, 0.10, elev), closeTo(0.0, 1e-9));
    });

    test('snap a nivel NMS (coronacion) tiene prioridad sobre grid', () {
      final wall = _wall(5.0, height: 3.0);
      final elev = _emptyElev(wall);
      // coronacion = 3.0; punto 2.96 con step=0.10 debería snap a 3.0
      expect(WallCslService.snapY(2.96, 0.10, elev), closeTo(3.0, 1e-9));
    });

    test('sin NMS cercano, aplica snap a grid', () {
      final wall = _wall(5.0, height: 3.0);
      final elev = _emptyElev(wall);
      // 1.52 con step=0.10 → 1.50 (fuera de rango de NMS base=0 y corona=3)
      expect(WallCslService.snapY(1.52, 0.10, elev), closeTo(1.50, 1e-9));
    });

    test('step <= 0 retorna el valor sin modificar (fuera de NMS)', () {
      final wall = _wall(5.0, height: 3.0);
      final elev = _emptyElev(wall);
      expect(WallCslService.snapY(1.23, 0.0, elev), closeTo(1.23, 1e-9));
    });
  });

  // ── snapXSmart ─────────────────────────────────────────────────────────────

  group('WallCslService — snapXSmart', () {
    test('snap al borde de inicio del muro (0.0)', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      final result = WallCslService.snapXSmart(0.02, 0.10, elev, wall);
      expect(result, closeTo(0.0, 1e-9));
    });

    test('snap al borde final del muro (wallLength)', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      final result = WallCslService.snapXSmart(4.98, 0.10, elev, wall);
      expect(result, closeTo(5.0, 1e-9));
    });

    test('snap al borde de un opening existente', () {
      final wall = _wall(5.0);
      final door = _door(xOffset: 1.0, width: 0.9); // bordes: 1.0 y 1.9
      final elev = WallElevation(
        wallId: wall.id,
        levels: VerticalLevels(coronacion: wall.height),
        openings: [door],
      );
      final result = WallCslService.snapXSmart(1.03, 0.10, elev, wall);
      expect(result, closeTo(1.0, 1e-9));
    });

    test('sin snap cercano aplica grid', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      final result = WallCslService.snapXSmart(2.54, 0.10, elev, wall);
      expect(result, closeTo(2.50, 1e-9));
    });
  });

  // ── validateElevation ──────────────────────────────────────────────────────

  group('WallCslService — validateElevation', () {
    test('elevación sin openings retorna valid', () {
      final wall = _wall(5.0);
      final elev = _emptyElev(wall);
      expect(WallCslService.validateElevation(elev, wall).isValid, isTrue);
    });

    test('retorna peor severidad: error sobre warning', () {
      final wall = _wall(5.0, height: 3.0);
      final door1 = _door(xOffset: 0.0, width: 1.0); // válida
      final door2 = _door(xOffset: 0.5, width: 1.0); // solapa door1 → error
      final elev = WallElevation(
        wallId: wall.id,
        levels: VerticalLevels(coronacion: wall.height),
        openings: [door1, door2],
      );
      expect(
        WallCslService.validateElevation(elev, wall).severity,
        ValidationSeverity.error,
      );
    });
  });
}
