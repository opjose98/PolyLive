import 'package:flutter_test/flutter_test.dart';
import 'package:vector_math/vector_math.dart';

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/features/walls/application/wall_csl_service.dart';

Wall _makeWall({double length = 5.0, double height = 2.8}) {
  return Wall(
    geometry: LineShape(Vector2.zero(), Vector2(length, 0)),
    thickness: 0.15,
    height: height,
    material: 'Test',
  );
}

WallOpening _door({double xOffset = 1.0}) => WallOpening(
      type: OpeningType.door,
      xOffset: xOffset,
      width: 0.9,
      sillHeight: 0.0,
      height: 2.1,
    );

void main() {
  const uc = EditWallElevationUseCase();

  group('EditWallElevationUseCase - getOrCreate', () {
    test('crea elevation por defecto si no existe', () {
      final wall = _makeWall();
      final elev = uc.getOrCreate(wall.id, wall.height, []);
      expect(elev.wallId, wall.id);
      expect(elev.levels.coronacion, wall.height);
      expect(elev.openings, isEmpty);
    });

    test('retorna existente si ya existe', () {
      final wall = _makeWall();
      final existing = WallElevation.defaults(wall.id, 3.5);
      final elev = uc.getOrCreate(wall.id, wall.height, [existing]);
      expect(elev.levels.coronacion, 3.5);
    });
  });

  group('EditWallElevationUseCase - openings', () {
    test('addOpening añade el opening', () {
      final wall = _makeWall();
      final elev = WallElevation.defaults(wall.id, wall.height);
      final result = uc.addOpening(elev, wall, _door());
      expect(result.elevation.openings.length, 1);
      expect(result.elevation.openings.first.type, OpeningType.door);
    });

    test('removeOpening elimina por id', () {
      final wall = _makeWall();
      final door = _door();
      final elev = WallElevation.defaults(wall.id, wall.height)
          .copyWith(openings: [door]);
      final updated = uc.removeOpening(elev, door.id);
      expect(updated.openings, isEmpty);
    });

    test('removeOpening no-op si id no existe', () {
      final wall = _makeWall();
      final door = _door();
      final elev = WallElevation.defaults(wall.id, wall.height)
          .copyWith(openings: [door]);
      final updated = uc.removeOpening(elev, 'nonexistent');
      expect(updated.openings.length, 1);
    });

    test('updateOpening actualiza por id', () {
      final wall = _makeWall();
      final door = _door(xOffset: 1.0);
      final elev = WallElevation.defaults(wall.id, wall.height)
          .copyWith(openings: [door]);
      final moved = door.copyWith(xOffset: 2.5);
      final updated = uc.updateOpening(elev, moved);
      expect(updated.openings.first.xOffset, 2.5);
    });
  });

  group('EditWallElevationUseCase - coronacion', () {
    test('updateCoronacion clampea a mínimo 0.01', () {
      final wall = _makeWall();
      final elev = WallElevation.defaults(wall.id, wall.height);
      expect(uc.updateCoronacion(elev, -1.0).levels.coronacion, 0.01);
    });

    test('updateCoronacion acepta valor válido', () {
      final wall = _makeWall();
      final elev = WallElevation.defaults(wall.id, wall.height);
      expect(uc.updateCoronacion(elev, 3.5).levels.coronacion, 3.5);
    });
  });

  group('EditWallElevationUseCase - chain mode', () {
    test('setChainMode activa chain mode', () {
      final wall = _makeWall();
      final elev = WallElevation.defaults(wall.id, wall.height);
      expect(uc.setChainMode(elev, true).chainModeEnabled, true);
    });

    test('propagateChainMode propaga solo a vecinos con CM activo', () {
      final w1 = _makeWall();
      final w2 = _makeWall();
      final w3 = _makeWall();
      final e1 = WallElevation.defaults(w1.id, 2.8);
      final e2 = WallElevation.defaults(w2.id, 2.8).copyWith(chainModeEnabled: true);
      final e3 = WallElevation.defaults(w3.id, 2.8); // CM off
      final result = uc.propagateChainMode([e1, e2, e3], w1.id, 3.5, {w2.id, w3.id}, [w1, w2, w3]);
      expect(result.firstWhere((e) => e.wallId == w2.id).levels.coronacion, 3.5);
      expect(result.firstWhere((e) => e.wallId == w3.id).levels.coronacion, 2.8);
    });
  });

  group('EditWallElevationUseCase - syncWithWalls', () {
    test('elimina elevaciones huérfanas', () {
      final wall = _makeWall();
      final orphan = WallElevation.defaults('orphan', 2.8);
      final valid = WallElevation.defaults(wall.id, 2.8);
      final result = uc.syncWithWalls([valid, orphan], [wall]);
      expect(result.length, 1);
      expect(result.first.wallId, wall.id);
    });
  });

  // ── WallQuantification ────────────────────────────────────────────────────

  group('WallQuantification.compute', () {
    test('grossArea = length × coronacion sin openings', () {
      final elev = WallElevation.defaults('w', 2.8);
      final q = WallQuantification.compute(elev, 5.0);
      expect(q.grossArea, closeTo(14.0, 1e-6));
      expect(q.openingArea, 0.0);
      expect(q.netArea, closeTo(14.0, 1e-6));
    });

    test('netArea descuenta openings correctamente', () {
      final door = WallOpening(type: OpeningType.door, xOffset: 1.0, width: 0.9, sillHeight: 0, height: 2.1);
      final win = WallOpening(type: OpeningType.window, xOffset: 3.0, width: 1.2, sillHeight: 0.9, height: 1.2);
      final elev = WallElevation(
        wallId: 'w',
        levels: const VerticalLevels(coronacion: 2.8),
        openings: [door, win],
      );
      final q = WallQuantification.compute(elev, 5.0);
      expect(q.grossArea, closeTo(14.0, 1e-6));
      expect(q.openingArea, closeTo(0.9 * 2.1 + 1.2 * 1.2, 1e-6));
      expect(q.netArea, closeTo(14.0 - (0.9 * 2.1 + 1.2 * 1.2), 1e-6));
    });

    test('netArea se clampea a 0 si openings exceden area total', () {
      final huge = WallOpening(type: OpeningType.opening, xOffset: 0, width: 50, sillHeight: 0, height: 50);
      final elev = WallElevation(wallId: 'w', levels: const VerticalLevels(coronacion: 2.8), openings: [huge]);
      final q = WallQuantification.compute(elev, 5.0);
      expect(q.netArea, 0.0);
    });
  });

  // ── WallCslService ────────────────────────────────────────────────────────

  group('WallCslService', () {
    test('direction unitaria para muro horizontal', () {
      final wall = _makeWall(length: 4.0);
      final d = WallCslService.direction(wall);
      expect(d.x, closeTo(1.0, 1e-9));
      expect(d.y, closeTo(0.0, 1e-9));
    });

    test('worldToLocalX proyecta sobre eje del muro', () {
      final wall = _makeWall(length: 4.0);
      expect(WallCslService.worldToLocalX(wall, Vector2(2.5, 0)), closeTo(2.5, 1e-9));
    });

    test('localXToWorld es inversa de worldToLocalX', () {
      final wall = _makeWall(length: 4.0);
      final world = WallCslService.localXToWorld(wall, 1.8);
      expect(WallCslService.worldToLocalX(wall, world), closeTo(1.8, 1e-6));
    });

    test('direction normalizada para muro diagonal', () {
      final wall = Wall(
        geometry: LineShape(Vector2.zero(), Vector2(1.0, 1.0)),
        thickness: 0.15,
        height: 2.8,
        material: 'Test',
      );
      expect(WallCslService.direction(wall).length, closeTo(1.0, 1e-6));
    });
  });

  group('WallCslService.validateOpening', () {
    test('valid para opening dentro de bounds', () {
      final wall = _makeWall();
      final elev = WallElevation.defaults(wall.id, wall.height);
      final result = WallCslService.validateOpening(_door(), elev, wall);
      expect(result.severity, ValidationSeverity.valid);
    });

    test('warning si opening excede longitud del muro', () {
      final wall = _makeWall(length: 2.0);
      final elev = WallElevation.defaults(wall.id, wall.height);
      final opening = _door(xOffset: 1.5); // 1.5 + 0.9 = 2.4 > 2.0
      expect(WallCslService.validateOpening(opening, elev, wall).severity, ValidationSeverity.warning);
    });

    test('error si width <= 0', () {
      final wall = _makeWall();
      final elev = WallElevation.defaults(wall.id, wall.height);
      final bad = WallOpening(type: OpeningType.door, xOffset: 0, width: 0, sillHeight: 0, height: 2.1);
      expect(WallCslService.validateOpening(bad, elev, wall).severity, ValidationSeverity.error);
    });

    test('error si xOffset negativo', () {
      final wall = _makeWall();
      final elev = WallElevation.defaults(wall.id, wall.height);
      final bad = WallOpening(type: OpeningType.door, xOffset: -0.5, width: 0.9, sillHeight: 0, height: 2.1);
      expect(WallCslService.validateOpening(bad, elev, wall).severity, ValidationSeverity.error);
    });

    test('error si openings se solapan en X', () {
      final wall = _makeWall(length: 6.0);
      final o1 = WallOpening(type: OpeningType.door, xOffset: 1.0, width: 1.0, sillHeight: 0, height: 2.1);
      final o2 = WallOpening(type: OpeningType.door, xOffset: 1.5, width: 1.0, sillHeight: 0, height: 2.1);
      final elev = WallElevation(
        wallId: wall.id,
        levels: const VerticalLevels(coronacion: 2.8),
        openings: [o1],
      );
      expect(WallCslService.validateOpening(o2, elev, wall).severity, ValidationSeverity.error);
    });
  });
}
