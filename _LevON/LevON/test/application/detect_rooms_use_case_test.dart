// Tests de integración para DetectRoomsUseCase.
// Validan detección de habitaciones a partir de ciclos de muros.

import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/features/rooms/application/detect_rooms_use_case.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/shared/domain/shapes.dart';

// ── helpers ────────────────────────────────────────────────────────────────

Wall seg(Vector2 a, Vector2 b) => Wall(
      geometry: LineShape(a, b),
      thickness: 0.15,
      height: 2.80,
      material: 'Test',
    );

/// Cuadrado cerrado de 4 muros.
List<Wall> square4x4() => [
      seg(Vector2(0, 0), Vector2(4, 0)),
      seg(Vector2(4, 0), Vector2(4, 4)),
      seg(Vector2(4, 4), Vector2(0, 4)),
      seg(Vector2(0, 4), Vector2(0, 0)),
    ];

// ── tests ──────────────────────────────────────────────────────────────────

void main() {
  const useCase = DetectRoomsUseCase();

  group('DetectRoomsUseCase — casos sin habitación', () {
    test('lista vacía retorna sin habitaciones', () {
      expect(useCase.execute([]), isEmpty);
    });

    test('menos de 3 muros retorna sin habitaciones', () {
      expect(useCase.execute([seg(Vector2(0, 0), Vector2(1, 0))]), isEmpty);
      expect(
        useCase.execute([
          seg(Vector2(0, 0), Vector2(1, 0)),
          seg(Vector2(1, 0), Vector2(2, 0)),
        ]),
        isEmpty,
      );
    });

    test('3 muros no conectados no forman habitación', () {
      final walls = [
        seg(Vector2(0, 0), Vector2(1, 0)),
        seg(Vector2(5, 5), Vector2(6, 5)),
        seg(Vector2(10, 0), Vector2(11, 0)),
      ];
      expect(useCase.execute(walls), isEmpty);
    });
  });

  group('DetectRoomsUseCase — cuadrado simple', () {
    test('4 muros que forman un cuadrado cerrado detectan 1 habitación', () {
      final rooms = useCase.execute(square4x4());
      expect(rooms.length, 1);
    });

    test('habitación detectada tiene nombre en español', () {
      final rooms = useCase.execute(square4x4());
      expect(rooms.first.name, contains('Habitación'));
    });

    test('habitación detectada tiene 4 muros en su boundary', () {
      final rooms = useCase.execute(square4x4());
      expect(rooms.first.boundary.length, 4);
    });
  });

  group('DetectRoomsUseCase — nombres secuenciales', () {
    test('múltiples habitaciones reciben nombres Habitación 1, 2…', () {
      // Dos cuadrados adyacentes compartiendo un muro lateral.
      //
      //  (0,4)──(4,4)──(8,4)
      //    |      |      |
      //  (0,0)──(4,0)──(8,0)
      final walls = [
        seg(Vector2(0, 0), Vector2(4, 0)),
        seg(Vector2(4, 0), Vector2(8, 0)),
        seg(Vector2(8, 0), Vector2(8, 4)),
        seg(Vector2(8, 4), Vector2(4, 4)),
        seg(Vector2(4, 4), Vector2(0, 4)),
        seg(Vector2(0, 4), Vector2(0, 0)),
        seg(Vector2(4, 0), Vector2(4, 4)), // muro compartido
      ];
      final rooms = useCase.execute(walls);
      // Dos habitaciones: nombres deben ser Habitación 1 y Habitación 2.
      expect(rooms.length, 2);
      final names = rooms.map((r) => r.name).toSet();
      expect(names, containsAll(['Habitación 1', 'Habitación 2']));
    });
  });
}
