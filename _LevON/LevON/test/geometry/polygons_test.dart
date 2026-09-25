// Tests unitarios para Polygons (fórmula Shoelace + Ray-casting).
// Cubren cuadrados, triángulos, polígonos complejos y casos borde.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/core/geometry/polygons.dart';

void main() {
  // ── calculateArea ──────────────────────────────────────────────────────────

  group('Polygons.calculateArea', () {
    test('cuadrado 3×3 tiene área 9', () {
      final vertices = [
        Vector2(0, 0),
        Vector2(3, 0),
        Vector2(3, 3),
        Vector2(0, 3),
      ];
      expect(Polygons.calculateArea(vertices), closeTo(9.0, 0.001));
    });

    test('cuadrado 1×1 tiene área 1', () {
      final sq = [
        Vector2(0, 0),
        Vector2(1, 0),
        Vector2(1, 1),
        Vector2(0, 1),
      ];
      expect(Polygons.calculateArea(sq), closeTo(1.0, 0.001));
    });

    test('triángulo rectángulo 3-4 tiene área 6', () {
      final tri = [Vector2(0, 0), Vector2(3, 0), Vector2(0, 4)];
      expect(Polygons.calculateArea(tri), closeTo(6.0, 0.001));
    });

    test('rectángulo 4×2.5 tiene área 10', () {
      final rect = [
        Vector2(0, 0),
        Vector2(4, 0),
        Vector2(4, 2.5),
        Vector2(0, 2.5),
      ];
      expect(Polygons.calculateArea(rect), closeTo(10.0, 0.001));
    });

    test('menos de 3 vértices retorna 0', () {
      expect(Polygons.calculateArea([]), 0.0);
      expect(Polygons.calculateArea([Vector2(0, 0)]), 0.0);
      expect(Polygons.calculateArea([Vector2(0, 0), Vector2(1, 0)]), 0.0);
    });

    test('polígono en sentido horario da el mismo área que antihorario', () {
      final ccw = [Vector2(0, 0), Vector2(2, 0), Vector2(2, 2), Vector2(0, 2)];
      final cw = ccw.reversed.toList();
      expect(
        Polygons.calculateArea(ccw),
        closeTo(Polygons.calculateArea(cw), 0.001),
      );
    });
  });

  // ── isPointInPolygon ───────────────────────────────────────────────────────

  group('Polygons.isPointInPolygon', () {
    final square = [
      Vector2(0, 0),
      Vector2(4, 0),
      Vector2(4, 4),
      Vector2(0, 4),
    ];

    test('punto interior está dentro', () {
      expect(Polygons.isPointInPolygon(Vector2(2, 2), square), isTrue);
    });

    test('punto exterior está fuera', () {
      expect(Polygons.isPointInPolygon(Vector2(5, 5), square), isFalse);
      expect(Polygons.isPointInPolygon(Vector2(-1, 2), square), isFalse);
    });

    test('esquina del cuadrado — comportamiento de borde (no crash)', () {
      // El comportamiento en borde no se garantiza, solo que no falla.
      Polygons.isPointInPolygon(Vector2(0, 0), square);
    });

    test('punto en triángulo interior', () {
      final tri = [Vector2(0, 0), Vector2(6, 0), Vector2(3, 6)];
      expect(Polygons.isPointInPolygon(Vector2(3, 2), tri), isTrue);
      expect(Polygons.isPointInPolygon(Vector2(0.1, 5.5), tri), isFalse);
    });
  });
}
