// Tests de integración para HistoryNotifier.
// Validan: record, undo, redo, límite de historial, limpieza.

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:vector_math/vector_math.dart';
import 'package:levon/shared/state/history_notifier.dart';
import 'package:levon/features/projects/domain/workspace_snapshot.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/shared/domain/shapes.dart';

// ── helpers ────────────────────────────────────────────────────────────────

WorkspaceSnapshot emptySnapshot() => WorkspaceSnapshot.empty;

WorkspaceSnapshot snapshotWithWalls(int count) => WorkspaceSnapshot(
      walls: List.generate(
        count,
        (i) => Wall(
          geometry: LineShape(Vector2(i.toDouble(), 0), Vector2(i + 1.0, 0)),
          thickness: 0.15,
          height: 2.80,
          material: 'Test',
        ),
      ),
      columns: const [],
    );

// ── tests ──────────────────────────────────────────────────────────────────

void main() {
  HistoryNotifier makeNotifier() => HistoryNotifier();

  group('HistoryNotifier — estado inicial', () {
    test('canUndo es false al inicio', () {
      expect(makeNotifier().state.canUndo, isFalse);
    });

    test('canRedo es false al inicio', () {
      expect(makeNotifier().state.canRedo, isFalse);
    });
  });

  group('HistoryNotifier — record', () {
    test('después de record, canUndo es true', () {
      final n = makeNotifier();
      n.record(emptySnapshot());
      expect(n.state.canUndo, isTrue);
    });

    test('record limpia el stack de redo', () {
      final n = makeNotifier();
      n.record(emptySnapshot());
      n.undo(emptySnapshot()); // genera redo
      expect(n.state.canRedo, isTrue);

      n.record(emptySnapshot()); // debe limpiar redo
      expect(n.state.canRedo, isFalse);
    });

    test('record acumula múltiples snapshots', () {
      final n = makeNotifier();
      n.record(snapshotWithWalls(1));
      n.record(snapshotWithWalls(2));
      n.record(snapshotWithWalls(3));
      expect(n.state.past.length, 3);
    });
  });

  group('HistoryNotifier — undo', () {
    test('undo retorna el último snapshot guardado', () {
      final n = makeNotifier();
      final s1 = snapshotWithWalls(1);
      n.record(s1);
      final restored = n.undo(emptySnapshot());
      expect(restored, isNotNull);
      expect(restored!.walls.length, 1);
    });

    test('undo sin historial retorna null', () {
      expect(makeNotifier().undo(emptySnapshot()), isNull);
    });

    test('undo mueve el estado actual al stack de redo', () {
      final n = makeNotifier();
      n.record(snapshotWithWalls(1));
      n.undo(snapshotWithWalls(2)); // current=2 → redo
      expect(n.state.canRedo, isTrue);
      expect(n.state.future.first.walls.length, 2);
    });

    test('undo reduce past en 1', () {
      final n = makeNotifier();
      n.record(emptySnapshot());
      n.record(emptySnapshot());
      n.undo(emptySnapshot());
      expect(n.state.past.length, 1);
    });
  });

  group('HistoryNotifier — redo', () {
    test('redo retorna el snapshot deshecho', () {
      // Protocolo correcto:
      // 1. Estado actual = snap5. Antes de mutar, record(snap5) → past:[snap5]
      // 2. Se muta a empty. undo(empty) → past:[], future:[empty], devuelve snap5
      // 3. Se aplica snap5. redo(snap5) → past:[snap5], future:[], devuelve empty
      // Lo que redo devuelve es el estado "futuro" (empty), no lo que undo devolvió.
      // La prueba correcta verifica que redo devuelve lo que estaba en future.
      final n = makeNotifier();
      final snap5 = snapshotWithWalls(5);
      // Registrar el estado vacío ANTES de añadir los 5 muros
      n.record(emptySnapshot()); // past: [empty]
      // Estado actual = snap5. Deshacer: guardar snap5 en future, restaurar empty.
      n.undo(snap5); // past: [], future: [snap5], devuelve empty
      // Estado actual = empty. Rehacer: devuelve snap5 de future.
      final redone = n.redo(emptySnapshot()); // devuelve snap5
      expect(redone, isNotNull);
      expect(redone!.walls.length, 5);
    });

    test('redo sin historial retorna null', () {
      expect(makeNotifier().redo(emptySnapshot()), isNull);
    });

    test('redo mueve el estado actual al stack de undo', () {
      final n = makeNotifier();
      n.record(snapshotWithWalls(1));
      n.undo(snapshotWithWalls(2));
      n.redo(snapshotWithWalls(3)); // current=3 → past
      expect(n.state.past.last.walls.length, 3);
    });
  });

  group('HistoryNotifier — ciclo undo/redo completo', () {
    test('undo→redo restaura el mismo snapshot', () {
      // Protocolo: record estado-previo → undo(estado-actual) → redo(estado-tras-undo)
      final n = makeNotifier();
      final snap7 = snapshotWithWalls(7);
      // Estado previo era empty; estado actual = snap7
      n.record(emptySnapshot()); // past: [empty]
      n.undo(snap7); // past: [], future: [snap7], devuelve empty
      // Ahora estado = empty. Redo devuelve snap7 de future.
      final redone = n.redo(emptySnapshot());
      expect(redone!.walls.length, 7);
    });

    test('múltiples undo/redo navegan el historial correctamente', () {
      final n = makeNotifier();
      n.record(snapshotWithWalls(1)); // past: [1]
      n.record(snapshotWithWalls(2)); // past: [1, 2]
      n.record(snapshotWithWalls(3)); // past: [1, 2, 3]

      final s3 = n.undo(snapshotWithWalls(4))!; // past: [1,2] future:[4]
      expect(s3.walls.length, 3);

      final s2 = n.undo(snapshotWithWalls(3))!; // past: [1] future:[3,4]
      expect(s2.walls.length, 2);

      final r3 = n.redo(snapshotWithWalls(2))!; // past:[1,2] future:[4]
      expect(r3.walls.length, 3);
    });
  });

  group('HistoryNotifier — límite máximo de historial', () {
    test('no excede 50 snapshots en past', () {
      final n = makeNotifier();
      for (int i = 0; i < 60; i++) {
        n.record(snapshotWithWalls(i));
      }
      expect(n.state.past.length, 50);
    });

    test('el snapshot más antiguo se descarta cuando se supera el límite', () {
      final n = makeNotifier();
      for (int i = 0; i < 51; i++) {
        n.record(snapshotWithWalls(i));
      }
      // El primer snapshot (0 muros generados con i=0) fue descartado.
      // El más antiguo ahora tiene i=1 → 1 muro.
      expect(n.state.past.first.walls.length, 1);
    });
  });

  group('HistoryNotifier — clear', () {
    test('clear vacía past y future', () {
      final n = makeNotifier();
      n.record(emptySnapshot());
      n.record(emptySnapshot());
      n.clear();
      expect(n.state.canUndo, isFalse);
      expect(n.state.canRedo, isFalse);
    });
  });

  group('HistoryNotifier — provider', () {
    test('historyProvider expone HistoryNotifier via Riverpod', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(historyProvider.notifier);
      expect(notifier, isA<HistoryNotifier>());
      expect(container.read(historyProvider).canUndo, isFalse);

      notifier.record(emptySnapshot());
      expect(container.read(historyProvider).canUndo, isTrue);
    });
  });
}
