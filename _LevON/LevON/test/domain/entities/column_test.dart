// Tests unitarios para la entidad ArchitecturalColumn.
// Validan: creación, getters de conveniencia, copyWith con rotation.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/features/walls/domain/column.dart';

void main() {
  group('ArchitecturalColumn — circular', () {
    late ArchitecturalColumn col;

    setUp(() {
      col = ArchitecturalColumn(
        position: Vector2(2, 3),
        shape: ColumnShape.circular,
        dimensionX: 0.40, // diámetro
        height: 3.0,
        material: 'Acero',
      );
    });

    test('isCircular retorna true', () => expect(col.isCircular, isTrue));
    test('width = dimensionX (diámetro)',
        () => expect(col.width, closeTo(0.40, 1e-9)));
    test('rotation inicial es 0',
        () => expect(col.rotation, closeTo(0.0, 1e-9)));
    test('se crea con ID único', () {
      final col2 = ArchitecturalColumn(
        position: Vector2.zero(),
        shape: ColumnShape.circular,
        dimensionX: 0.30,
        height: 3.0,
        material: 'Acero',
      );
      expect(col.id, isNot(equals(col2.id)));
    });
  });

  group('ArchitecturalColumn — rectangular', () {
    late ArchitecturalColumn col;

    setUp(() {
      col = ArchitecturalColumn(
        position: Vector2(0, 0),
        shape: ColumnShape.rectangular,
        dimensionX: 0.30,
        dimensionY: 0.50,
        height: 2.80,
        material: 'Hormigón',
      );
    });

    test('isCircular retorna false', () => expect(col.isCircular, isFalse));
    test('width = dimensionX', () => expect(col.width, closeTo(0.30, 1e-9)));
    test('depth = dimensionY', () => expect(col.depth, closeTo(0.50, 1e-9)));
  });

  group('ArchitecturalColumn — copyWith', () {
    late ArchitecturalColumn original;

    setUp(() {
      original = ArchitecturalColumn(
        position: Vector2(1, 1),
        shape: ColumnShape.rectangular,
        dimensionX: 0.30,
        dimensionY: 0.30,
        height: 2.80,
        material: 'Hormigón',
      );
    });

    test('copyWith position actualiza posición', () {
      final moved = original.copyWith(position: Vector2(5, 5));
      expect(moved.position.x, closeTo(5.0, 1e-9));
      expect(moved.position.y, closeTo(5.0, 1e-9));
      expect(moved.id, equals(original.id));
    });

    test('copyWith rotation actualiza rotación', () {
      final rotated = original.copyWith(rotation: 1.5708); // ~90°
      expect(rotated.rotation, closeTo(1.5708, 1e-4));
      expect(rotated.dimensionX, equals(original.dimensionX));
    });

    test('copyWith sin argumentos preserva todos los campos', () {
      final clone = original.copyWith();
      expect(clone.id, equals(original.id));
      expect(clone.material, equals(original.material));
      expect(clone.rotation, equals(original.rotation));
    });
  });
}
