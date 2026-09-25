import 'package:flutter_test/flutter_test.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';

void main() {
  // ── WallOpening ─────────────────────────────────────────────────────────────

  group('WallOpening', () {
    test('genera id único si no se provee', () {
      final a = WallOpening(type: OpeningType.door, xOffset: 0, width: 0.9, sillHeight: 0, height: 2.1);
      final b = WallOpening(type: OpeningType.door, xOffset: 0, width: 0.9, sillHeight: 0, height: 2.1);
      expect(a.id, isNot(b.id));
    });

    test('preserva id en copyWith', () {
      final o = WallOpening(type: OpeningType.door, xOffset: 1.0, width: 0.9, sillHeight: 0, height: 2.1);
      final o2 = o.copyWith(xOffset: 2.0);
      expect(o2.id, o.id);
      expect(o2.xOffset, 2.0);
      expect(o2.width, 0.9);
    });

    test('copyWith no modifica campos no especificados', () {
      final o = WallOpening(
        type: OpeningType.window,
        xOffset: 1.5,
        width: 1.2,
        sillHeight: 0.9,
        height: 1.2,
      );
      final o2 = o.copyWith(width: 1.5);
      expect(o2.type, OpeningType.window);
      expect(o2.sillHeight, 0.9);
      expect(o2.height, 1.2);
    });
  });

  // ── VerticalLevels ──────────────────────────────────────────────────────────

  group('VerticalLevels', () {
    test('base siempre 0.0', () {
      const levels = VerticalLevels(coronacion: 2.8);
      expect(levels.base, 0.0);
    });

    test('copyWith actualiza coronacion', () {
      const levels = VerticalLevels(coronacion: 2.8);
      final updated = levels.copyWith(coronacion: 3.0);
      expect(updated.coronacion, 3.0);
      expect(updated.base, 0.0);
    });
  });

  // ── WallQuantification ──────────────────────────────────────────────────────

  group('WallQuantification', () {
    test('grossArea = longitud × coronacion', () {
      final elev = WallElevation(
        wallId: 'w1',
        levels: const VerticalLevels(coronacion: 2.80),
      );
      final q = WallQuantification.compute(elev, 5.0);
      expect(q.grossArea, closeTo(14.0, 1e-6));
      expect(q.openingArea, 0.0);
      expect(q.netArea, closeTo(14.0, 1e-6));
    });

    test('netArea = grossArea - openings', () {
      final door = WallOpening(
        type: OpeningType.door,
        xOffset: 1.0,
        width: 0.9,
        sillHeight: 0.0,
        height: 2.1,
      );
      final win = WallOpening(
        type: OpeningType.window,
        xOffset: 3.0,
        width: 1.2,
        sillHeight: 0.9,
        height: 1.2,
      );
      final elev = WallElevation(
        wallId: 'w1',
        levels: const VerticalLevels(coronacion: 2.8),
        openings: [door, win],
      );
      final q = WallQuantification.compute(elev, 5.0);
      // gross = 5.0 × 2.8 = 14.0
      // door = 0.9 × 2.1 = 1.89
      // win  = 1.2 × 1.2 = 1.44
      // total openings = 3.33
      expect(q.grossArea, closeTo(14.0, 1e-6));
      expect(q.openingArea, closeTo(3.33, 1e-6));
      expect(q.netArea, closeTo(14.0 - 3.33, 1e-6));
    });

    test('netArea nunca es negativa', () {
      final opening = WallOpening(
        type: OpeningType.opening,
        xOffset: 0.0,
        width: 100.0,
        sillHeight: 0.0,
        height: 100.0,
      );
      final elev = WallElevation(
        wallId: 'w1',
        levels: const VerticalLevels(coronacion: 2.8),
        openings: [opening],
      );
      final q = WallQuantification.compute(elev, 5.0);
      expect(q.netArea, 0.0);
    });
  });

  // ── WallElevation ──────────────────────────────────────────────────────────

  group('WallElevation', () {
    test('defaults crea elevación con coronación correcta', () {
      final e = WallElevation.defaults('wall-1', 3.0);
      expect(e.wallId, 'wall-1');
      expect(e.levels.coronacion, 3.0);
      expect(e.openings, isEmpty);
      expect(e.chainModeEnabled, false);
    });

    test('openings es inmutable', () {
      final e = WallElevation.defaults('w', 2.8);
      final fakeOpening = WallOpening(type: OpeningType.door, xOffset: 0, width: 0.9, sillHeight: 0, height: 2.1);
      expect(() => e.openings.add(fakeOpening), throwsUnsupportedError);
    });

    test('copyWith no cambia wallId', () {
      final e = WallElevation.defaults('w1', 2.8);
      final e2 = e.copyWith(chainModeEnabled: true);
      expect(e2.wallId, 'w1');
      expect(e2.chainModeEnabled, true);
    });

    test('umbral retorna null sin openings', () {
      final e = WallElevation.defaults('w', 2.8);
      expect(e.umbral, isNull);
      expect(e.dintel, isNull);
    });

    test('umbral y dintel calculados correctamente', () {
      final door = WallOpening(type: OpeningType.door, xOffset: 0, width: 0.9, sillHeight: 0, height: 2.1);
      final win = WallOpening(type: OpeningType.window, xOffset: 2, width: 1.2, sillHeight: 0.9, height: 1.2);
      final e = WallElevation(
        wallId: 'w',
        levels: const VerticalLevels(coronacion: 2.8),
        openings: [door, win],
      );
      expect(e.umbral, 0.0); // min sillHeight
      expect(e.dintel, closeTo(2.1, 1e-6)); // max(0+2.1, 0.9+1.2)=max(2.1,2.1)
    });
  });
}
