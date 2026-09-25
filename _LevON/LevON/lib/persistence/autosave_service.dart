import 'dart:async';

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/persistence/project_repository.dart';

/// Servicio de guardado automático con debounce de 30 segundos.
///
/// Cada llamada a [schedule] cancela el temporizador anterior y programa
/// uno nuevo. Esto garantiza que, al estar el usuario dibujando activamente,
/// el guardado no ocurra a mitad de una secuencia de ediciones, sino 30
/// segundos después de la última modificación.
///
/// Flujo de uso típico:
/// ```dart
/// // En EditorScreen o via ref.listen:
/// autosaveService.schedule(currentProject, repository);
///
/// // Al cerrar el editor, forzar guardado inmediato:
/// await autosaveService.flush(currentProject, repository);
/// ```
///
/// El servicio debe ser disposed cuando el editor se cierra para cancelar
/// cualquier temporizador pendiente que pudiera dispararse en background.
class AutosaveService {
  static const Duration _debounce = Duration(seconds: 30);

  Timer? _debounceTimer;

  // ── API PÚBLICA ────────────────────────────────────────────────────────────

  /// Agenda un guardado de [project] en [repository] tras [_debounce].
  ///
  /// Si ya había un guardado pendiente, se cancela y se reinicia el contador.
  /// Esto asegura que múltiples ediciones rápidas generen un único write a disco.
  void schedule(Project project, ProjectRepository repository) {
    _debounceTimer?.cancel();
    _debounceTimer = Timer(_debounce, () {
      repository.autosaveProject(project);
    });
  }

  /// Fuerza el guardado inmediato cancelando el temporizador pendiente.
  ///
  /// Llamar antes de cerrar el editor o navegar fuera para no perder cambios.
  Future<void> flush(Project project, ProjectRepository repository) async {
    _debounceTimer?.cancel();
    _debounceTimer = null;
    await repository.autosaveProject(project);
  }

  /// Cancela cualquier guardado pendiente sin ejecutarlo.
  ///
  /// Usar únicamente cuando el proyecto se descarta intencionalmente
  /// (e.g., el usuario cancela la creación de un proyecto).
  void cancel() {
    _debounceTimer?.cancel();
    _debounceTimer = null;
  }

  /// Libera recursos del servicio.
  ///
  /// Debe llamarse en el [dispose] del widget o provider que lo posee.
  void dispose() => cancel();
}
