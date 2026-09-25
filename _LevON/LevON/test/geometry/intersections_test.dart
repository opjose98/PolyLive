// Tests unitarios para GeometryEngine.
// Validan intersección línea-línea, detección de paralelismo, segmentos que no cruzan.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/core/geometry/intersections.dart';
import 'package:levon/core/constants.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/walls/domain/wall.dart';

void main() {
  group('GeometryEngine.getLineIntersection', () {
    test('dos segmentos perpendiculares se cortan en el origen', () {
      final pt = GeometryEngine.getLineIntersection(
        Vector2(-1, 0),
        Vector2(1, 0),
        Vector2(0, -1),
        Vector2(0, 1),
      );
      expect(pt, isNotNull);
      expect(pt!.x, closeTo(0.0, epsilon));
      expect(pt.y, closeTo(0.0, epsilon));
    });

    test('segmentos paralelos no se cortan', () {
      final pt = GeometryEngine.getLineIntersection(
        Vector2(0, 0),
        Vector2(2, 0),
        Vector2(0, 1),
        Vector2(2, 1),
      );
      expect(pt, isNull);
    });

    test('segmentos colineales (solapados) no producen intersección', () {
      final pt = GeometryEngine.getLineIntersection(
        Vector2(0, 0),
        Vector2(2, 0),
        Vector2(1, 0),
        Vector2(3, 0),
      );
      // Colineales: denominador ≈ 0 → retorna null
      expect(pt, isNull);
    });

    test(
        'segmentos que se extienden pero no se cruzan como segmentos retornan null',
        () {
      // Líneas que se cruzarían si fueran infinitas, pero los segmentos no se tocan.
      final pt = GeometryEngine.getLineIntersection(
        Vector2(0, 0),
        Vector2(1, 0),
        Vector2(2, -1),
        Vector2(2, -2),
      );
      expect(pt, isNull);
    });

    test('segmentos en T (extremo de uno toca interior del otro)', () {
      final pt = GeometryEngine.getLineIntersection(
        Vector2(0, 0),
        Vector2(4, 0),
        Vector2(2, -2),
        Vector2(2, 0),
      );
      expect(pt, isNotNull);
      expect(pt!.x, closeTo(2.0, epsilon));
      expect(pt.y, closeTo(0.0, epsilon));
    });
  });

  group('GeometryEngine.doShapesIntersect — LineShape', () {
    test('dos LineShapes que se cruzan retornan 1 punto', () {
      final pts = GeometryEngine.doShapesIntersect(
        _line(Vector2(0, -1), Vector2(0, 1)),
        _line(Vector2(-1, 0), Vector2(1, 0)),
      );
      expect(pts.length, 1);
      expect(pts.first.x, closeTo(0.0, epsilon));
      expect(pts.first.y, closeTo(0.0, epsilon));
    });

    test('dos LineShapes paralelas retornan lista vacía', () {
      final pts = GeometryEngine.doShapesIntersect(
        _line(Vector2(0, 0), Vector2(3, 0)),
        _line(Vector2(0, 1), Vector2(3, 1)),
      );
      expect(pts, isEmpty);
    });
  });

  group('GeometryEngine.wallIntersection — compatibilidad', () {
    test('retorna null para muros paralelos', () {
      // Usando el método legacy para verificar que sigue funcionando.
      final a = _wall(Vector2(0, 0), Vector2(3, 0));
      final b = _wall(Vector2(0, 1), Vector2(3, 1));
      expect(GeometryEngine.wallIntersection(a, b), isNull);
    });
  });
}

// ── helpers ────────────────────────────────────────────────────────────────

LineShape _line(Vector2 a, Vector2 b) => LineShape(a, b);

Wall _wall(Vector2 start, Vector2 end) => Wall(
      geometry: LineShape(start, end),
      thickness: 0.15,
      height: 2.80,
      material: 'Test',
    );
