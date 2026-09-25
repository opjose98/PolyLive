import 'dart:math' as math;
import 'package:uuid/uuid.dart';

/// Tipo semántico de apertura en elevación de muro.
///
/// Mapea directamente a tipos IFC para preparación futura de exportación:
///   door    → IfcDoor + IfcOpeningElement
///   window  → IfcWindow + IfcOpeningElement
///   opening → IfcOpeningElement solo (hueco genérico)
enum OpeningType { door, window, opening }

/// Apertura (hueco) posicionada en coordenadas CSL del muro.
///
/// CSL (Sistema de Coordenadas Local):
///   X = longitud desde el inicio del muro (metros)
///   Y = altura desde el suelo (metros)
///
/// Entidad BIM canónica para toda apertura (puerta, ventana, hueco genérico).
/// La representación en planta se deriva automáticamente desde esta entidad —
/// no existen entidades Door/Window separadas en el modelo.
class WallOpening {
  final String id;
  final OpeningType type;

  /// Distancia en metros desde el inicio del muro (eje X CSL).
  final double xOffset;

  /// Ancho del hueco en metros (eje X CSL).
  final double width;

  /// Altura del antepecho en metros desde el suelo (eje Y CSL).
  /// 0.0 para puertas; típicamente 0.90 para ventanas estándar.
  final double sillHeight;

  /// Altura del hueco en metros (eje Y CSL).
  /// Dintel efectivo = sillHeight + height.
  final double height;

  /// Solo puertas: invierte el sentido de apertura (gira 180° respecto al muro host).
  /// false = hoja abre hacia la derecha del muro; true = hacia la izquierda.
  final bool isFlipped;

  /// Observaciones libres de campo o levantamiento (máx. 500 caracteres).
  final String? notes;

  WallOpening({
    String? id,
    required this.type,
    required this.xOffset,
    required this.width,
    required this.sillHeight,
    required this.height,
    this.isFlipped = false,
    this.notes,
  }) : id = id ?? const Uuid().v4();

  /// Rect en coordenadas CSL: (xOffset, sillHeight, width, height).
  double get xEnd => xOffset + width;
  double get sillEnd => sillHeight + height;
  double get centerX => xOffset + width / 2;
  double get centerY => sillHeight + height / 2;

  WallOpening copyWith({
    OpeningType? type,
    double? xOffset,
    double? width,
    double? sillHeight,
    double? height,
    bool? isFlipped,
    Object? notes = _notSet,
  }) {
    return WallOpening(
      id: id,
      type: type ?? this.type,
      xOffset: xOffset ?? this.xOffset,
      width: width ?? this.width,
      sillHeight: sillHeight ?? this.sillHeight,
      height: height ?? this.height,
      isFlipped: isFlipped ?? this.isFlipped,
      notes: identical(notes, _notSet) ? this.notes : notes as String?,
    );
  }
}

// Sentinel interno para distinguir "no pasado" de "null explícito" en copyWith.
const _notSet = Object();

/// Niveles semánticos verticales del muro (NMS — Niveles de Muro Simplificados).
///
/// Soporta perfil de altura variable (culatas):
///   [leftHeight] = altura en el inicio del muro (CSL X=0)
///   [rightHeight] = altura en el fin del muro   (CSL X=wall.length)
///
/// Cuando ambos son null, el muro es rectangular de altura [coronacion].
/// Cuando uno o ambos se definen, la coronación es la línea interpolada
/// entre [effectiveLeftHeight] y [effectiveRightHeight].
///
/// [coronacion] mantiene la altura máxima para compatibilidad BIM/IFC y
/// para la sincronización con [Wall.height].
class VerticalLevels {
  /// Nivel de suelo de referencia. Siempre 0.0.
  final double base;

  /// Altura máxima del muro en metros. Sincronizado con Wall.height.
  /// Para culatas: coronacion = max(effectiveLeftHeight, effectiveRightHeight).
  final double coronacion;

  /// Altura en el inicio del muro (CSL X=0). Null = igual a [coronacion].
  final double? leftHeight;

  /// Altura en el fin del muro (CSL X=wall.length). Null = igual a [coronacion].
  final double? rightHeight;

  const VerticalLevels({
    this.base = 0.0,
    required this.coronacion,
    this.leftHeight,
    this.rightHeight,
  });

  /// Altura efectiva en el inicio del muro.
  double get effectiveLeftHeight => leftHeight ?? coronacion;

  /// Altura efectiva en el fin del muro.
  double get effectiveRightHeight => rightHeight ?? coronacion;

  /// True cuando el muro tiene perfil de altura variable (culata).
  bool get hasHeightProfile => leftHeight != null || rightHeight != null;

  /// Altura interpolada en la coordenada CSL [localX] del muro.
  ///
  /// Para muros rectangulares retorna siempre [coronacion].
  /// Para culatas, interpola linealmente entre [effectiveLeftHeight] y [effectiveRightHeight].
  double heightAt(double localX, double wallLength) {
    if (!hasHeightProfile) return coronacion;
    if (wallLength <= 0) return effectiveLeftHeight;
    final t = (localX / wallLength).clamp(0.0, 1.0);
    return effectiveLeftHeight + (effectiveRightHeight - effectiveLeftHeight) * t;
  }

  VerticalLevels copyWith({
    double? coronacion,
    Object? leftHeight = _notSet,
    Object? rightHeight = _notSet,
  }) {
    return VerticalLevels(
      base: base,
      coronacion: coronacion ?? this.coronacion,
      leftHeight: identical(leftHeight, _notSet)
          ? this.leftHeight
          : leftHeight as double?,
      rightHeight: identical(rightHeight, _notSet)
          ? this.rightHeight
          : rightHeight as double?,
    );
  }
}

/// Cuantificación derivada de un muro con sus openings.
///
/// No se persiste — siempre se recomputa desde [WallElevation] + wallLength.
class WallQuantification {
  final double grossArea;
  final double openingArea;
  final double netArea;

  const WallQuantification({
    required this.grossArea,
    required this.openingArea,
    required this.netArea,
  });

  /// Computa la cuantificación desde la elevación y la longitud del muro.
  ///
  /// Soporta perfil de altura variable (culatas):
  ///   grossArea = wallLength × (leftH + rightH) / 2  [área trapecio]
  ///   Para muros rectangulares: grossArea = wallLength × coronacion
  ///
  /// Los openings se recortan contra el techo interpolado en su punto central.
  /// openingArea = Σ (opening.width × clippedHeight)
  /// netArea = max(0, grossArea − openingArea)
  static WallQuantification compute(WallElevation elevation, double wallLength) {
    final levels = elevation.levels;

    final gross = levels.hasHeightProfile
        ? wallLength *
            (levels.effectiveLeftHeight + levels.effectiveRightHeight) /
            2.0
        : wallLength * levels.coronacion;

    // Construir rectángulos recortados contra el techo interpolado en su centro X.
    // Usar unión de áreas para evitar doble conteo en solapamientos Opening↔Opening.
    final rects = <(double x0, double y0, double x1, double y1)>[];
    for (final o in elevation.openings) {
      final ceiling = levels.heightAt(o.centerX, wallLength);
      final effectiveTop = (o.sillHeight + o.height).clamp(0.0, ceiling);
      final effectiveH = (effectiveTop - o.sillHeight).clamp(0.0, double.infinity);
      if (effectiveH > 0 && o.width > 0) {
        rects.add((o.xOffset, o.sillHeight, o.xEnd, o.sillHeight + effectiveH));
      }
    }

    final openingArea = _rectUnionArea(rects);

    return WallQuantification(
      grossArea: gross,
      openingArea: openingArea,
      netArea: math.max(0.0, gross - openingArea),
    );
  }

  /// Área de la unión de rectángulos axiales (coordinate compression 2D).
  /// O(n²) — aceptable para el número típico de openings por muro (< 20).
  static double _rectUnionArea(List<(double, double, double, double)> rects) {
    if (rects.isEmpty) return 0.0;

    final xs = <double>{};
    final ys = <double>{};
    for (final r in rects) {
      xs.add(r.$1); xs.add(r.$3);
      ys.add(r.$2); ys.add(r.$4);
    }
    final sx = xs.toList()..sort();
    final sy = ys.toList()..sort();

    double area = 0.0;
    for (int i = 0; i < sx.length - 1; i++) {
      for (int j = 0; j < sy.length - 1; j++) {
        final cx = (sx[i] + sx[i + 1]) / 2;
        final cy = (sy[j] + sy[j + 1]) / 2;
        final covered = rects.any(
          (r) => cx > r.$1 && cx < r.$3 && cy > r.$2 && cy < r.$4,
        );
        if (covered) {
          area += (sx[i + 1] - sx[i]) * (sy[j + 1] - sy[j]);
        }
      }
    }
    return area;
  }
}

/// Elevación semántica de un muro individual.
///
/// Entidad inmutable vinculada a [Wall] por [wallId].
/// Contiene toda la información de elevación frontal 2D:
/// niveles verticales (con soporte de culatas), openings en CSL y chain mode.
class WallElevation {
  /// ID del [Wall] al que pertenece esta elevación.
  final String wallId;

  /// Niveles semánticos verticales (base + coronación + perfil de altura).
  final VerticalLevels levels;

  /// Openings posicionados en coordenadas CSL del muro.
  final List<WallOpening> openings;

  /// Cuando true, cambios de coronación se propagan a muros
  /// que comparten nodo en el TopologyGraph.
  final bool chainModeEnabled;

  WallElevation({
    required this.wallId,
    required this.levels,
    List<WallOpening>? openings,
    this.chainModeEnabled = false,
  }) : openings = List.unmodifiable(openings ?? const []);

  /// Crea una elevación por defecto para un muro dado su altura actual.
  factory WallElevation.defaults(String wallId, double wallHeight) {
    return WallElevation(
      wallId: wallId,
      levels: VerticalLevels(coronacion: wallHeight),
      openings: const [],
    );
  }

  WallElevation copyWith({
    VerticalLevels? levels,
    List<WallOpening>? openings,
    bool? chainModeEnabled,
  }) {
    return WallElevation(
      wallId: wallId,
      levels: levels ?? this.levels,
      openings: openings ?? this.openings,
      chainModeEnabled: chainModeEnabled ?? this.chainModeEnabled,
    );
  }

  /// Nivel de umbral: altura mínima de antepecho entre todos los openings.
  /// Retorna null si no hay openings.
  double? get umbral {
    if (openings.isEmpty) return null;
    return openings.map((o) => o.sillHeight).reduce((a, b) => a < b ? a : b);
  }

  /// Nivel de dintel: altura máxima de cima de opening entre todos los openings.
  /// Retorna null si no hay openings.
  double? get dintel {
    if (openings.isEmpty) return null;
    return openings
        .map((o) => o.sillHeight + o.height)
        .reduce((a, b) => a > b ? a : b);
  }
}
