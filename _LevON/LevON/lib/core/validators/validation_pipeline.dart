import 'package:vector_math/vector_math.dart';
import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/core/geometry/intersections.dart';
import 'package:levon/core/constants.dart';

/// Nivel de severidad de un problema de validación BIM.
enum ValidationSeverity { info, advertencia, error }

/// Representa un problema de validación detectado en el modelo BIM.
///
/// Contiene suficiente información para localizar el problema en el canvas
/// y relacionarlo con las entidades afectadas.
class ValidationIssue {
  /// Identificador único del issue (formato: REGLA_ID_ENTIDAD).
  final String id;

  /// Descripción legible del problema.
  final String message;

  final ValidationSeverity severity;

  /// Coordenada mundo donde ocurre el problema (opcional).
  final Vector2? location;

  /// IDs de las entidades BIM implicadas.
  final List<String> relatedEntityIds;

  const ValidationIssue({
    required this.id,
    required this.message,
    required this.severity,
    this.location,
    this.relatedEntityIds = const [],
  });
}

/// Contrato para reglas de validación del modelo BIM.
///
/// Cada implementación encapsula una sola clase de problema.
/// Las reglas son puras: no tienen estado y no modifican el proyecto.
abstract class ValidationRule {
  List<ValidationIssue> validate(Project project);
}

/// Regla: ningún muro puede tener longitud menor a [minLength] metros.
///
/// Muros demasiado cortos suelen ser artefactos del proceso de dibujo y
/// generan errores en la detección de habitaciones.
class LongitudMinimaValidator implements ValidationRule {
  final double minLength;

  const LongitudMinimaValidator({this.minLength = 0.1});

  @override
  List<ValidationIssue> validate(Project project) {
    final List<ValidationIssue> issues = [];
    for (final wall in project.walls) {
      if (wall.geometry.length < minLength) {
        issues.add(ValidationIssue(
          id: 'LONG_MINIMA_${wall.id}',
          message:
              'Muro demasiado corto (${wall.geometry.length.toStringAsFixed(3)} m < $minLength m mínimo)',
          severity: ValidationSeverity.error,
          location: wall.geometry.startPoint,
          relatedEntityIds: [wall.id],
        ));
      }
    }
    return issues;
  }
}

/// Regla: dos muros no deben cruzarse fuera de sus extremos.
///
/// Intersecciones internas indican superposición involuntaria. Las conexiones
/// nodo-a-nodo en extremos son válidas y se excluyen del reporte.
///
/// COMPLEJIDAD: O(n²) donde n = número de muros.
/// Para proyectos con >100 muros se recomienda indexación espacial.
class SolapamientoValidator implements ValidationRule {
  @override
  List<ValidationIssue> validate(Project project) {
    final List<ValidationIssue> issues = [];
    final walls = project.walls;

    for (int i = 0; i < walls.length; i++) {
      for (int j = i + 1; j < walls.length; j++) {
        final w1 = walls[i];
        final w2 = walls[j];

        final intersections = GeometryEngine.doShapesIntersect(
          w1.geometry,
          w2.geometry,
        );

        for (final pt in intersections) {
          // Una intersección en el extremo de AMBOS muros es una unión válida.
          final enExtremo1 = pt.distanceTo(w1.geometry.startPoint) < epsilon ||
              pt.distanceTo(w1.geometry.endPoint) < epsilon;
          final enExtremo2 = pt.distanceTo(w2.geometry.startPoint) < epsilon ||
              pt.distanceTo(w2.geometry.endPoint) < epsilon;

          // Una unión válida requiere que AL MENOS uno de los dos muros
          // tenga la intersección en su extremo (unión en T o en esquina).
          // Solo se reporta cuando ninguno de los dos tiene la intersección
          // en un extremo: eso sí es un cruce interior involuntario.
          if (!(enExtremo1 || enExtremo2)) {
            issues.add(ValidationIssue(
              id: 'SOLAPAMIENTO_${w1.id}_${w2.id}',
              message:
                  'Los muros se cruzan en un punto interior (no es una unión válida)',
              severity: ValidationSeverity.advertencia,
              location: pt,
              relatedEntityIds: [w1.id, w2.id],
            ));
          }
        }
      }
    }
    return issues;
  }
}

/// Orquestador de validación BIM.
///
/// Ejecuta todas las [ValidationRule]s registradas en orden secuencial
/// y agrega sus resultados en una sola lista.
///
/// Añadir nuevas reglas es tan simple como incluirlas en [_rules].
class ValidationPipeline {
  final List<ValidationRule> _rules = [
    const LongitudMinimaValidator(),
    SolapamientoValidator(),
  ];

  /// Ejecuta todas las reglas sobre [project] y retorna la lista consolidada de issues.
  List<ValidationIssue> run(Project project) {
    final List<ValidationIssue> allIssues = [];
    for (final rule in _rules) {
      allIssues.addAll(rule.validate(project));
    }
    return allIssues;
  }
}
