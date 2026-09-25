import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:levon/features/projects/domain/workspace_snapshot.dart';

/// Estado del sistema de historial undo/redo.
///
/// Mantiene dos pilas: [past] (estados anteriores) y [future] (estados redo).
/// La invariante es: el estado "presente" vive en los providers de datos
/// (wallsProvider, columnsProvider, etc.) y NO en este objeto.
class HistoryState {
  final List<WorkspaceSnapshot> past;
  final List<WorkspaceSnapshot> future;

  const HistoryState({
    this.past = const [],
    this.future = const [],
  });

  bool get canUndo => past.isNotEmpty;
  bool get canRedo => future.isNotEmpty;

  HistoryState copyWith({
    List<WorkspaceSnapshot>? past,
    List<WorkspaceSnapshot>? future,
  }) {
    return HistoryState(
      past: past ?? this.past,
      future: future ?? this.future,
    );
  }
}

/// Notifier que gestiona el historial de undo/redo del editor.
///
/// PROTOCOLO DE USO:
/// 1. Antes de cualquier mutación: llamar a [record] con el snapshot ACTUAL.
/// 2. Para deshacer: llamar a [undo] con el estado actual → aplicar el snapshot retornado.
/// 3. Para rehacer: llamar a [redo] con el estado actual → aplicar el snapshot retornado.
///
/// El historial se limita a [_maxHistory] snapshots para controlar el uso de memoria.
/// Cada snapshot es ~8 bytes × (n_muros + n_columnas) en datos brutos, más overhead de lista.
class HistoryNotifier extends StateNotifier<HistoryState> {
  static const int _maxHistory = 50;

  HistoryNotifier() : super(const HistoryState());

  /// Registra el estado ANTES de una mutación y limpia el stack de redo.
  ///
  /// Llamar SIEMPRE justo antes de modificar cualquier provider de datos.
  /// Si se excede [_maxHistory], se descarta el snapshot más antiguo.
  void record(WorkspaceSnapshot snapshot) {
    final newPast = [...state.past, snapshot];
    state = HistoryState(
      past: newPast.length > _maxHistory
          ? newPast.sublist(newPast.length - _maxHistory)
          : newPast,
      future: const [],
    );
  }

  /// Deshace la última mutación.
  ///
  /// [current] es el estado presente que se guardará en el stack de redo.
  /// Retorna el snapshot anterior (el que debe aplicarse), o `null` si no hay historial.
  WorkspaceSnapshot? undo(WorkspaceSnapshot current) {
    if (!state.canUndo) return null;
    final prev = state.past.last;
    state = HistoryState(
      past: state.past.sublist(0, state.past.length - 1),
      future: [current, ...state.future],
    );
    return prev;
  }

  /// Rehace la última operación deshecha.
  ///
  /// [current] es el estado presente que se guardará en el stack de undo.
  /// Retorna el snapshot siguiente (el que debe aplicarse), o `null` si no hay redo.
  WorkspaceSnapshot? redo(WorkspaceSnapshot current) {
    if (!state.canRedo) return null;
    final next = state.future.first;
    state = HistoryState(
      past: [...state.past, current],
      future: state.future.sublist(1),
    );
    return next;
  }

  /// Limpia completamente el historial (usado al cargar un nuevo proyecto).
  void clear() => state = const HistoryState();
}

final historyProvider = StateNotifierProvider<HistoryNotifier, HistoryState>(
  (ref) => HistoryNotifier(),
);
