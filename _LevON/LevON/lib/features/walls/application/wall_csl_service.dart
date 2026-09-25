import 'dart:math' as math;
import 'package:vector_math/vector_math.dart';

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';

/// Resultado de validación de un WallOpening dentro de su muro.
enum ValidationSeverity { valid, warning, error }

class ValidationResult {
  final ValidationSeverity severity;
  final String? message;

  const ValidationResult.valid()
      : severity = ValidationSeverity.valid,
        message = null;

  const ValidationResult.warning(this.message)
      : severity = ValidationSeverity.warning;

  const ValidationResult.error(this.message)
      : severity = ValidationSeverity.error;

  bool get isValid => severity == ValidationSeverity.valid;
}

/// Sistema de Coordenadas Local del muro (CSL).
///
/// X = longitud del muro (0 → wall.length)
/// Y = altura desde el suelo (0 → wall.height)
///
/// Todas las funciones son estáticas y puras — sin estado.
/// Solo soporta LineShape; para ArcShape proyecta sobre la longitud del arco.
class WallCslService {
  // ── TRANSFORMS ────────────────────────────────────────────────────────────

  /// Dirección unitaria del muro (eje X CSL) desde la geometría de planta.
  static Vector2 direction(Wall wall) {
    final s = wall.geometry.startPoint;
    final e = wall.geometry.endPoint;
    final delta = e - s;
    final len = delta.length;
    if (len < 1e-9) return Vector2(1.0, 0.0);
    return delta / len;
  }

  /// Ángulo del muro en radianes (eje X CSL respecto al eje X del mundo).
  static double wallAngle(Wall wall) {
    final d = direction(wall);
    return math.atan2(d.y, d.x);
  }

  /// Transforma un punto de planta (world-space) a coordenada X CSL del muro.
  ///
  /// Retorna la proyección escalar a lo largo del eje del muro.
  /// No incluye Y (altura), que solo existe en el contexto de elevación.
  static double worldToLocalX(Wall wall, Vector2 worldPoint) {
    final s = wall.geometry.startPoint;
    final d = direction(wall);
    return (worldPoint - s).dot(d);
  }

  /// Transforma una coordenada X CSL a punto 2D en planta (world-space).
  static Vector2 localXToWorld(Wall wall, double localX) {
    final s = wall.geometry.startPoint;
    final d = direction(wall);
    return s + d * localX;
  }

  // ── VALIDATION ────────────────────────────────────────────────────────────

  /// Valida un opening contra los bounds del muro y sus constraints.
  ///
  /// Retorna [ValidationResult.valid] si todo es correcto.
  /// [ValidationResult.warning] si hay violación suave (geometría inválida pero
  /// se permite guardar con indicador visual).
  /// [ValidationResult.error] si hay violación severa (bloquea commit).
  static ValidationResult validateOpening(
    WallOpening opening,
    WallElevation elevation,
    Wall wall,
  ) {
    if (opening.width <= 0 || opening.height <= 0) {
      return const ValidationResult.error('width y height deben ser > 0');
    }
    if (opening.xOffset < 0) {
      return const ValidationResult.error('xOffset no puede ser negativo');
    }
    if (opening.sillHeight < 0) {
      return const ValidationResult.error('sillHeight no puede ser negativo');
    }
    if (opening.xOffset + opening.width > wall.length + 1e-6) {
      return ValidationResult.warning(
        'Opening excede la longitud del muro (${wall.length.toStringAsFixed(3)} m)',
      );
    }
    if (opening.sillHeight + opening.height > elevation.levels.coronacion + 1e-6) {
      return ValidationResult.warning(
        'Opening excede la altura del muro (${elevation.levels.coronacion.toStringAsFixed(3)} m)',
      );
    }
    // Detectar solapamiento 2D con otros openings; severidad según tipo semántico.
    // Opening(genérico) ↔ cualquier tipo → warning (permitido visualmente).
    // Door/Window ↔ Door/Window → error (overlap inválido, marcado en rojo).
    for (final other in elevation.openings) {
      if (other.id == opening.id) continue;
      final overlapX = opening.xOffset < other.xEnd - 1e-6 &&
          opening.xEnd > other.xOffset + 1e-6;
      final overlapY = opening.sillHeight < other.sillEnd - 1e-6 &&
          opening.sillEnd > other.sillHeight + 1e-6;
      if (!overlapX || !overlapY) continue;
      if (opening.type == OpeningType.opening ||
          other.type == OpeningType.opening) {
        return ValidationResult.warning(
          'Apertura genérica solapada con ${_typeName(other.type)}',
        );
      }
      return ValidationResult.error(
        '${_typeName(opening.type)} se solapa con ${_typeName(other.type)}',
      );
    }
    return const ValidationResult.valid();
  }

  /// Valida todos los openings de una elevación.
  ///
  /// Retorna la peor severidad encontrada. Incluye el mensaje del primer error/warning.
  static ValidationResult validateElevation(WallElevation elevation, Wall wall) {
    ValidationResult worst = const ValidationResult.valid();
    for (final opening in elevation.openings) {
      final result = validateOpening(opening, elevation, wall);
      if (result.severity == ValidationSeverity.error) return result;
      if (result.severity == ValidationSeverity.warning) worst = result;
    }
    return worst;
  }

  // ── CHAIN MODE ─────────────────────────────────────────────────────────────

  /// Retorna los IDs de muros conectados al muro dado via nodos compartidos.
  ///
  /// Recibe el mapa de adyacencia del TopologyGraph (nodeId → wallIds).
  /// Se usa en ChainMode para propagar cambios de coronación.
  static Set<String> connectedWallIds(
    Wall wall,
    Map<String, List<String>> nodeToWallIds,
  ) {
    final connected = <String>{};
    // Un muro LineShape tiene exactamente dos nodos (start y end)
    // El TopologyGraph usa coordenadas redondeadas como clave de nodo
    for (final wallIds in nodeToWallIds.values) {
      if (wallIds.contains(wall.id) && wallIds.length > 1) {
        for (final id in wallIds) {
          if (id != wall.id) connected.add(id);
        }
      }
    }
    return connected;
  }

  // ── SNAP EN CSL ────────────────────────────────────────────────────────────

  /// Redondea una coordenada X CSL al paso de precisión dado.
  static double snapX(double localX, double step) {
    if (step <= 0) return localX;
    return (localX / step).roundToDouble() * step;
  }

  /// Redondea una coordenada Y CSL (altura) al paso de precisión dado.
  /// Los niveles NMS tienen prioridad sobre el snap a grid.
  static double snapY(
    double localY,
    double step,
    WallElevation elevation,
  ) {
    // halfStep con fallback para step <= 0 (evita división por cero en el loop NMS)
    final halfStep = step > 0 ? step / 2.0 : 0.05;
    final nmsLevels = [
      elevation.levels.base,
      elevation.levels.coronacion,
      if (elevation.umbral != null) elevation.umbral!,
      if (elevation.dintel != null) elevation.dintel!,
    ];
    for (final level in nmsLevels) {
      if ((localY - level).abs() < halfStep) return level;
    }
    if (step <= 0) return localY;
    return (localY / step).roundToDouble() * step;
  }

  // ── OVERLAP VALIDATION ───────────────────────────────────────────────────────

  /// Valida que un opening entrante no se solape con openings existentes de forma inválida.
  ///
  /// REGLA SEMÁNTICA:
  ///   Opening(genérico) ↔ Opening(genérico) → permitido (superposición de huecos aceptada).
  ///   Cualquier otra combinación (Door↔Door, Door↔Window, Window↔Window, etc.) → inválido.
  ///
  /// Retorna un mensaje de error si hay conflicto, null si es válido.
  static String? validateOverlap(
    WallOpening incoming,
    List<WallOpening> existing,
  ) {
    for (final o in existing) {
      final overlapX = incoming.xOffset < o.xEnd - 1e-6 &&
          incoming.xEnd > o.xOffset + 1e-6;
      final overlapY = incoming.sillHeight < o.sillEnd - 1e-6 &&
          incoming.sillEnd > o.sillHeight + 1e-6;
      if (!overlapX || !overlapY) { continue; }
      // Opening genérico puede solaparse con otro Opening genérico sin conflicto.
      if (incoming.type == OpeningType.opening &&
          o.type == OpeningType.opening) { continue; }
      final inName = _typeName(incoming.type);
      final oName = _typeName(o.type);
      return 'Conflicto: $inName se superpone con $oName existente';
    }
    return null;
  }

  static String _typeName(OpeningType t) => switch (t) {
        OpeningType.door => 'Puerta',
        OpeningType.window => 'Ventana',
        OpeningType.opening => 'Hueco',
      };

  // ── SMART SNAPS ─────────────────────────────────────────────────────────────

  /// Snap inteligente en X: primero a bordes/centros de openings existentes,
  /// luego al borde del muro, y finalmente al paso de precisión.
  static double snapXSmart(
    double localX,
    double step,
    WallElevation elevation,
    Wall wall, {
    bool snapToOpenings = true,
  }) {
    final snapPoints = <double>[0.0, wall.length];

    if (snapToOpenings) {
      for (final o in elevation.openings) {
        snapPoints.add(o.xOffset);
        snapPoints.add(o.xOffset + o.width);
        snapPoints.add(o.xOffset + o.width / 2); // centro
      }
    }

    final threshold = step / 2.0;
    for (final sp in snapPoints) {
      if ((localX - sp).abs() < threshold) return sp;
    }

    return snapX(localX, step);
  }

  /// Snap inteligente en Y: primero a niveles NMS y cimas/bases de openings,
  /// luego al paso de precisión.
  static double snapYSmart(
    double localY,
    double step,
    WallElevation elevation,
    double wallLength, {
    bool snapToNms = true,
    bool snapToOpenings = true,
  }) {
    final snapPoints = <double>[];

    if (snapToNms) {
      snapPoints.add(elevation.levels.base);
      snapPoints.add(elevation.levels.coronacion);
      if (elevation.levels.hasHeightProfile) {
        snapPoints.add(elevation.levels.effectiveLeftHeight);
        snapPoints.add(elevation.levels.effectiveRightHeight);
      }
      if (elevation.umbral != null) snapPoints.add(elevation.umbral!);
      if (elevation.dintel != null) snapPoints.add(elevation.dintel!);
    }

    if (snapToOpenings) {
      for (final o in elevation.openings) {
        snapPoints.add(o.sillHeight);           // base del hueco
        snapPoints.add(o.sillHeight + o.height); // cima del hueco (dintel)
        snapPoints.add(o.centerY);              // centro vertical
      }
    }

    final threshold = step / 2.0;
    for (final sp in snapPoints) {
      if ((localY - sp).abs() < threshold) return sp;
    }

    return snapY(localY, step, elevation);
  }
}
