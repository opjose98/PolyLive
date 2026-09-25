// Tests unitarios para la entidad Wall.
// Validan: creación, inmutabilidad, getter length, copyWith.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/shared/domain/shapes.dart';

void main() {
  group('Wall — creación y propiedades básicas', () {
    late Wall wall;

    setUp(() {
      wall = Wall(
        geometry: LineShape(Vector2(0, 0), Vector2(3, 0)),
        thickness: 0.15,
        height: 2.80,
        material: 'Hormigón',
      );
    });

    test('se crea con ID único', () {
      final wall2 = Wall(
        geometry: LineShape(Vector2(0, 0), Vector2(3, 0)),
        thickness: 0.15,
        height: 2.80,
        material: 'Hormigón',
      );
      expect(wall.id, isNotEmpty);
      expect(wall.id, isNot(equals(wall2.id)));
    });

    test('length delega correctamente a geometry.length', () {
      expect(wall.length, closeTo(3.0, 0.001));
    });

    test('isStructural es true por defecto', () {
      expect(wall.isStructural, isTrue);
    });

    test('partición tiene isStructural=false', () {
      final partition = Wall(
        geometry: LineShape(Vector2(0, 0), Vector2(1, 0)),
        thickness: 0.10,
        height: 2.50,
        material: 'Yeso',
        isStructural: false,
      );
      expect(partition.isStructural, isFalse);
    });
  });

  group('Wall — copyWith', () {
    late Wall original;

    setUp(() {
      original = Wall(
        geometry: LineShape(Vector2(0, 0), Vector2(5, 0)),
        thickness: 0.15,
        height: 2.80,
        material: 'Generic',
      );
    });

    test('copyWith height genera nueva instancia con height actualizado', () {
      final updated = original.copyWith(height: 3.0);
      expect(updated.height, closeTo(3.0, 0.001));
      expect(updated.id, equals(original.id));
      expect(updated.thickness, equals(original.thickness));
    });

    test('copyWith geometry preserva el resto de campos', () {
      final newGeom = LineShape(Vector2(0, 0), Vector2(10, 0));
      final updated = original.copyWith(geometry: newGeom);
      expect(updated.length, closeTo(10.0, 0.001));
      expect(updated.material, equals(original.material));
    });

    test('copyWith sin argumentos produce clon equivalente', () {
      final clone = original.copyWith();
      expect(clone.id, equals(original.id));
      expect(clone.thickness, equals(original.thickness));
      expect(clone.height, equals(original.height));
      expect(clone.material, equals(original.material));
    });
  });

  group('Wall — geometría diagonal', () {
    test('longitud diagonal 3-4-5 es 5', () {
      final wall = Wall(
        geometry: LineShape(Vector2(0, 0), Vector2(3, 4)),
        thickness: 0.15,
        height: 2.80,
        material: 'Generic',
      );
      expect(wall.length, closeTo(5.0, 0.001));
    });
  });
}
