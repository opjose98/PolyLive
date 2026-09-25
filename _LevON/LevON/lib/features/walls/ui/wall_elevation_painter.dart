import 'dart:math' as math;
import 'package:flutter/material.dart';

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/walls/application/wall_csl_service.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/core/utils/unit_service.dart';
import 'package:levon/shared/state/project_settings.dart';

// ── Handle types ──────────────────────────────────────────────────────────────

/// Handle de interacción en el WEP.
///
/// Los handles de opening son los 8 puntos de resize.
/// Los handles de nodo son las esquinas y el centro del cuerpo del muro (culatas).
enum ElevationHandle {
  none,
  // Opening resize handles
  left, right, top, bottom,
  topLeft, topRight, bottomLeft, bottomRight,
  // Corner node handles (culatas)
  nodeLeft, nodeRight,
  // Center node — mueve ambas aristas simultáneamente
  nodeCenter,
}

// ── Viewport ──────────────────────────────────────────────────────────────────

/// Convierte coordenadas CSL ↔ canvas pixels con renderizado proporcional.
///
/// El muro se renderiza manteniendo su proporción real (longitud vs altura)
/// y se centra en el canvas disponible con padding uniforme.
///
/// CSL: X = longitud (0 → wallLength), Y = altura (0 → wallHeight, Y arriba)
///
/// Soporta transformación de usuario ([userScale], [userPan]) para pan/zoom
/// interactivo en el editor integrado (EditorViewMode.wallElevation).
class ElevationViewport {
  final double wallLength;
  final double wallHeight;
  final Size canvasSize;

  /// Escala adicional del usuario (1.0 = sin zoom adicional).
  final double userScale;

  /// Desplazamiento adicional del usuario en pixels de canvas.
  final Offset userPan;

  static const double kPadding = 40.0;
  static const double kHandleRadius = 6.0;
  static const double kNodeHandleRadius = 8.0;

  const ElevationViewport({
    required this.wallLength,
    required this.wallHeight,
    required this.canvasSize,
    this.userScale = 1.0,
    this.userPan = Offset.zero,
  });

  double get _availW => canvasSize.width - kPadding * 2;
  double get _availH => canvasSize.height - kPadding * 2;

  double get _rawScaleX => _availW / (wallLength > 0 ? wallLength : 1.0);
  double get _rawScaleY => _availH / (wallHeight > 0 ? wallHeight : 1.0);

  /// Escala base (auto-fit): mantiene proporción real longitud/altura.
  double get baseScale => math.min(_rawScaleX, _rawScaleY);

  /// Escala efectiva (base × usuario).
  double get scale => baseScale * userScale;

  double get drawWidth => wallLength * scale;
  double get drawHeight => wallHeight * scale;

  /// Origen X del muro en canvas (centrado + pan de usuario).
  double get originX => (canvasSize.width - drawWidth) / 2 + userPan.dx;

  /// Origen Y del borde inferior del muro en canvas (centrado + pan de usuario).
  double get originY => (canvasSize.height - drawHeight) / 2 + userPan.dy;

  // CSL → canvas
  double toCanvasX(double localX) => originX + localX * scale;

  /// Y=0 (suelo) → parte inferior del muro; Y=wallHeight → parte superior.
  double toCanvasY(double localY) => originY + drawHeight - localY * scale;

  // Canvas → CSL (sin clamp, el caller valida)
  double toLocalX(double canvasX) => (canvasX - originX) / scale;
  double toLocalY(double canvasY) => (originY + drawHeight - canvasY) / scale;

  Rect toCanvasRect(WallOpening opening) {
    final left = toCanvasX(opening.xOffset);
    final top = toCanvasY(opening.sillHeight + opening.height);
    final right = toCanvasX(opening.xOffset + opening.width);
    final bottom = toCanvasY(opening.sillHeight);
    return Rect.fromLTRB(left, top, right, bottom);
  }

  /// Posición canvas del nodo izquierdo (inicio del muro, altura izquierda).
  Offset leftNodeCanvas(WallElevation elevation) =>
      Offset(toCanvasX(0), toCanvasY(elevation.levels.effectiveLeftHeight));

  /// Posición canvas del nodo derecho (fin del muro, altura derecha).
  Offset rightNodeCanvas(WallElevation elevation, double wl) =>
      Offset(toCanvasX(wl), toCanvasY(elevation.levels.effectiveRightHeight));

  /// Posición canvas del nodo central (punto medio del muro, altura promedio).
  Offset centerNodeCanvas(WallElevation elevation, double wl) {
    final avgH = (elevation.levels.effectiveLeftHeight +
            elevation.levels.effectiveRightHeight) /
        2;
    return Offset(toCanvasX(wl / 2), toCanvasY(avgH));
  }
}

// ── Painter ───────────────────────────────────────────────────────────────────

/// CustomPainter para la vista frontal de elevación de un muro (WEP).
///
/// Vista 2D local:
///   X izq → inicio del muro (CSL X=0)
///   X der → fin del muro   (CSL X=wall.length)
///   Y arr → coronación     (CSL Y=wall.height)
///   Y abj → base           (CSL Y=0)
///
/// Soporta:
///   - Perfil de altura variable (culatas): techo interpolado izquierda↔derecha
///   - Handles de resize en el opening seleccionado
///   - Handles de nodo: izquierdo, derecho y central (para editar culatas)
///   - Overlay de validación (borde/relleno rojo en openings con overlap inválido)
///   - Eje de suelo negro persistente (representación arquitectónica base)
class WallElevationPainter extends CustomPainter {
  final Wall wall;
  final WallElevation elevation;
  final String? selectedOpeningId;
  final UnitSystem unitSystem;
  final LengthPrecision precision;
  final Map<String, ValidationSeverity>? validationState;
  final ElevationHandle activeHandle;
  final bool showHandles;

  /// Viewport con transformación de usuario (pan/zoom). Si no se pasa,
  /// se crea un viewport auto-fit sin transformación adicional.
  final ElevationViewport? viewport;

  WallElevationPainter({
    required this.wall,
    required this.elevation,
    this.selectedOpeningId,
    this.unitSystem = UnitSystem.m,
    this.precision = LengthPrecision.mm10,
    this.validationState,
    this.activeHandle = ElevationHandle.none,
    this.showHandles = true,
    this.viewport,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final maxH = math.max(
      elevation.levels.effectiveLeftHeight,
      elevation.levels.effectiveRightHeight,
    );
    final vp = viewport ??
        ElevationViewport(
          wallLength: wall.length,
          wallHeight: maxH > 0 ? maxH : elevation.levels.coronacion,
          canvasSize: size,
        );

    _drawBackground(canvas, size);
    _drawGroundAxis(canvas, vp);
    _drawWallBody(canvas, vp);
    _drawNmsLevels(canvas, vp);
    _drawOpenings(canvas, vp);
    _drawCornerHandles(canvas, vp);
    _drawDimensions(canvas, vp);
  }

  void _drawBackground(Canvas canvas, Size size) {
    canvas.drawRect(
      Rect.fromLTWH(0, 0, size.width, size.height),
      Paint()..color = LevonColors.canvasBg,
    );
  }

  /// Eje de suelo negro: línea horizontal sólida al nivel Y=0 del CSL.
  /// Representa la base arquitectónica; se renderiza detrás del muro.
  void _drawGroundAxis(Canvas canvas, ElevationViewport vp) {
    final y = vp.toCanvasY(0);
    final groundPaint = Paint()
      ..color = Colors.black87
      ..strokeWidth = 2.5;
    canvas.drawLine(
      Offset(vp.originX - 24, y),
      Offset(vp.originX + vp.drawWidth + 24, y),
      groundPaint,
    );
  }

  /// Dibuja el cuerpo del muro. Para culatas, el techo es una línea inclinada.
  void _drawWallBody(Canvas canvas, ElevationViewport vp) {
    final path = Path()
      ..moveTo(vp.toCanvasX(0), vp.toCanvasY(0))
      ..lineTo(vp.toCanvasX(wall.length), vp.toCanvasY(0))
      ..lineTo(
        vp.toCanvasX(wall.length),
        vp.toCanvasY(elevation.levels.effectiveRightHeight),
      )
      ..lineTo(
        vp.toCanvasX(0),
        vp.toCanvasY(elevation.levels.effectiveLeftHeight),
      )
      ..close();

    canvas.drawPath(
      path,
      Paint()..color = LevonColors.wallStroke.withValues(alpha: 0.08),
    );
    canvas.drawPath(
      path,
      Paint()
        ..color = LevonColors.wallStroke
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0,
    );
  }

  void _drawNmsLevels(Canvas canvas, ElevationViewport vp) {
    final dashPaint = Paint()
      ..color = LevonColors.navy.withValues(alpha: 0.35)
      ..strokeWidth = 1.0
      ..style = PaintingStyle.stroke;

    // Base (siempre horizontal)
    _drawDashedHLine(canvas, vp, 0.0, dashPaint);
    _drawSmallLabel(canvas, 'Base', Offset(2, vp.toCanvasY(0) - 12));

    // Coronación: línea inclinada si hay perfil, horizontal si es rectangular
    if (elevation.levels.hasHeightProfile) {
      _drawDashedLine(
        canvas,
        Offset(
          vp.toCanvasX(0),
          vp.toCanvasY(elevation.levels.effectiveLeftHeight),
        ),
        Offset(
          vp.toCanvasX(wall.length),
          vp.toCanvasY(elevation.levels.effectiveRightHeight),
        ),
        dashPaint,
      );
      _drawSmallLabel(
        canvas,
        'Cor.',
        Offset(
          2,
          vp.toCanvasY(math.max(
                elevation.levels.effectiveLeftHeight,
                elevation.levels.effectiveRightHeight,
              )) -
              12,
        ),
      );
    } else {
      _drawDashedHLine(canvas, vp, elevation.levels.coronacion, dashPaint);
      _drawSmallLabel(
        canvas,
        'Cor.',
        Offset(2, vp.toCanvasY(elevation.levels.coronacion) - 12),
      );
    }

    // Umbral (línea horizontal al nivel de sill mínimo)
    final umbral = elevation.umbral;
    if (umbral != null && umbral > 0.0) {
      _drawDashedHLine(canvas, vp, umbral, dashPaint);
      _drawSmallLabel(
        canvas,
        'Umb.',
        Offset(2, vp.toCanvasY(umbral) - 12),
      );
    }

    // Dintel (línea horizontal al nivel de cima máxima)
    final dintel = elevation.dintel;
    if (dintel != null && dintel < elevation.levels.coronacion) {
      _drawDashedHLine(canvas, vp, dintel, dashPaint);
      _drawSmallLabel(
        canvas,
        'Din.',
        Offset(2, vp.toCanvasY(dintel) - 12),
      );
    }
  }

  void _drawDashedHLine(
    Canvas canvas,
    ElevationViewport vp,
    double localY,
    Paint paint,
  ) {
    _drawDashedLine(
      canvas,
      Offset(vp.toCanvasX(0), vp.toCanvasY(localY)),
      Offset(vp.toCanvasX(wall.length), vp.toCanvasY(localY)),
      paint,
    );
  }

  void _drawDashedLine(Canvas canvas, Offset start, Offset end, Paint paint) {
    const dashLen = 6.0;
    const gapLen = 4.0;
    final dir = end - start;
    final total = dir.distance;
    if (total < 1e-6) return;
    final unit = dir / total;
    double dist = 0;
    bool drawing = true;
    while (dist < total) {
      final segEnd = (dist + (drawing ? dashLen : gapLen)).clamp(0.0, total);
      if (drawing) {
        canvas.drawLine(start + unit * dist, start + unit * segEnd, paint);
      }
      dist = segEnd;
      drawing = !drawing;
    }
  }

  void _drawOpenings(Canvas canvas, ElevationViewport vp) {
    for (final opening in elevation.openings) {
      final rect = vp.toCanvasRect(opening);
      final isSelected = opening.id == selectedOpeningId;
      final severity = validationState?[opening.id];
      final isInvalidOverlap = severity == ValidationSeverity.error;

      // Fill — rojo translúcido si hay overlap inválido, color normal si no
      final fillColor = isInvalidOverlap
          ? LevonColors.errorRed.withValues(alpha: 0.25)
          : _openingFill(opening.type);
      canvas.drawRect(rect, Paint()..color = fillColor);

      // Border — color según validación y selección
      final borderColor = isSelected
          ? LevonColors.selectStroke
          : isInvalidOverlap
              ? LevonColors.errorRed
              : severity == ValidationSeverity.warning
                  ? LevonColors.warnOrange
                  : _openingStroke(opening.type);

      canvas.drawRect(
        rect,
        Paint()
          ..color = borderColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = isSelected ? 2.5 : 1.5,
      );

      _drawOpeningLabel(canvas, opening.type, rect, isInvalidOverlap);

      // Resize handles en el opening seleccionado
      if (isSelected && showHandles) {
        _drawResizeHandles(canvas, rect);
      }
    }
  }

  void _drawResizeHandles(Canvas canvas, Rect rect) {
    final positions = [
      (ElevationHandle.topLeft, rect.topLeft),
      (ElevationHandle.topRight, rect.topRight),
      (ElevationHandle.bottomLeft, rect.bottomLeft),
      (ElevationHandle.bottomRight, rect.bottomRight),
      (ElevationHandle.left, rect.centerLeft),
      (ElevationHandle.right, rect.centerRight),
      (ElevationHandle.top, rect.topCenter),
      (ElevationHandle.bottom, rect.bottomCenter),
    ];

    const r = ElevationViewport.kHandleRadius;
    for (final (handle, pos) in positions) {
      final isActive = handle == activeHandle;
      canvas.drawCircle(
        pos,
        r,
        Paint()..color = isActive ? LevonColors.navy : Colors.white,
      );
      canvas.drawCircle(
        pos,
        r,
        Paint()
          ..color = LevonColors.navy
          ..style = PaintingStyle.stroke
          ..strokeWidth = 1.5,
      );
    }
  }

  /// Dibuja handles de nodo del cuerpo del muro para editar culatas.
  /// Nodo izquierdo: arista superior izquierda.
  /// Nodo derecho: arista superior derecha.
  /// Nodo central: desplaza ambas aristas simultáneamente (ligeramente alargado).
  void _drawCornerHandles(Canvas canvas, ElevationViewport vp) {
    if (!showHandles) return;
    const r = ElevationViewport.kNodeHandleRadius;

    final leftPos = vp.leftNodeCanvas(elevation);
    final rightPos = vp.rightNodeCanvas(elevation, wall.length);
    final centerPos = vp.centerNodeCanvas(elevation, wall.length);

    // Nodo izquierdo (círculo)
    _drawCircleNode(canvas, leftPos, r, ElevationHandle.nodeLeft);
    // Nodo derecho (círculo)
    _drawCircleNode(canvas, rightPos, r, ElevationHandle.nodeRight);
    // Nodo central (rectángulo alargado — indica que mueve ambas aristas)
    _drawRectNode(canvas, centerPos, r * 2.5, r * 1.3, ElevationHandle.nodeCenter);
  }

  void _drawCircleNode(Canvas canvas, Offset pos, double r, ElevationHandle handle) {
    final isActive = handle == activeHandle;
    canvas.drawCircle(
      pos, r,
      Paint()..color = isActive ? LevonColors.navy : LevonColors.surface.withValues(alpha: 0.9),
    );
    canvas.drawCircle(
      pos, r,
      Paint()
        ..color = LevonColors.navy
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0,
    );
  }

  void _drawRectNode(Canvas canvas, Offset pos, double w, double h, ElevationHandle handle) {
    final isActive = handle == activeHandle;
    final rect = Rect.fromCenter(center: pos, width: w, height: h);
    final rrect = RRect.fromRectAndRadius(rect, const Radius.circular(4));
    canvas.drawRRect(
      rrect,
      Paint()..color = isActive ? LevonColors.navy : LevonColors.surface.withValues(alpha: 0.9),
    );
    canvas.drawRRect(
      rrect,
      Paint()
        ..color = LevonColors.navy
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0,
    );
  }

  Color _openingFill(OpeningType type) => switch (type) {
        OpeningType.door => const Color(0xFF4CAF50).withValues(alpha: 0.20),
        OpeningType.window => const Color(0xFF2196F3).withValues(alpha: 0.20),
        OpeningType.opening => const Color(0xFFFF9800).withValues(alpha: 0.20),
      };

  Color _openingStroke(OpeningType type) => switch (type) {
        OpeningType.door => const Color(0xFF388E3C),
        OpeningType.window => const Color(0xFF1565C0),
        OpeningType.opening => const Color(0xFFE65100),
      };

  void _drawOpeningLabel(Canvas canvas, OpeningType type, Rect rect, bool isInvalid) {
    if (rect.width < 18 || rect.height < 12) return;
    final label = switch (type) {
      OpeningType.door => 'P',
      OpeningType.window => 'V',
      OpeningType.opening => 'H',
    };
    final color = isInvalid ? LevonColors.errorRed : _openingStroke(type);
    final tp = TextPainter(
      text: TextSpan(
        text: label,
        style: TextStyle(
          color: color,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(
      canvas,
      Offset(
        (rect.center.dx - tp.width / 2).roundToDouble(),
        (rect.center.dy - tp.height / 2).roundToDouble(),
      ),
    );
  }

  void _drawDimensions(Canvas canvas, ElevationViewport vp) {
    final lenLabel =
        UnitFormatter.length(wall.length, unitSystem, precision: precision);
    final hLabel = UnitFormatter.length(
      elevation.levels.coronacion,
      unitSystem,
      precision: precision,
    );

    // Cota horizontal (longitud) — debajo del muro
    _drawSmallLabel(
      canvas,
      lenLabel,
      Offset(
        (vp.toCanvasX(0) + vp.toCanvasX(wall.length)) / 2 - 16,
        vp.toCanvasY(0) + 14,
      ),
    );
    // Cota vertical (altura) — a la derecha
    _drawSmallLabel(
      canvas,
      hLabel,
      Offset(
        vp.toCanvasX(wall.length) + 6,
        (vp.toCanvasY(0) + vp.toCanvasY(elevation.levels.effectiveRightHeight)) /
            2,
      ),
    );

    // Para culatas: mostrar altura izquierda y derecha si son distintas
    if (elevation.levels.hasHeightProfile) {
      final lhLabel = UnitFormatter.length(
        elevation.levels.effectiveLeftHeight,
        unitSystem,
        precision: precision,
      );
      final rhLabel = UnitFormatter.length(
        elevation.levels.effectiveRightHeight,
        unitSystem,
        precision: precision,
      );
      _drawSmallLabel(
        canvas,
        lhLabel,
        Offset(
          vp.toCanvasX(0) - 2,
          vp.toCanvasY(elevation.levels.effectiveLeftHeight) - 14,
        ),
      );
      _drawSmallLabel(
        canvas,
        rhLabel,
        Offset(
          vp.toCanvasX(wall.length) + 4,
          vp.toCanvasY(elevation.levels.effectiveRightHeight) - 14,
        ),
      );
    }
  }

  void _drawSmallLabel(Canvas canvas, String text, Offset pos) {
    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: const TextStyle(
          color: LevonColors.textSecondary,
          fontSize: 10,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(pos.dx.roundToDouble(), pos.dy.roundToDouble()));
  }

  @override
  bool shouldRepaint(WallElevationPainter old) {
    return old.wall != wall ||
        old.elevation != elevation ||
        old.selectedOpeningId != selectedOpeningId ||
        old.unitSystem != unitSystem ||
        old.precision != precision ||
        old.validationState != validationState ||
        old.activeHandle != activeHandle ||
        old.showHandles != showHandles ||
        old.viewport != viewport;
  }
}
