import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/core/validators/validation_pipeline.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/ui/theme/levon_tokens.dart';

/// Capa estática del canvas: grid, rooms y walls.
/// Solo se repinta cuando cambia walls/rooms/selection/scale/pan.
/// Separada de PreviewLayerPainter para evitar repaints innecesarios durante el dibujo.
class StaticLayerPainter extends CustomPainter {
  final List<Wall> walls;
  final List<Room> rooms;
  final List<ArchitecturalColumn> columns;
  final List<WallElevation> wallElevations;
  final List<PhotoMarkerEntity> photoMarkers;
  final PhotoMarkerEntity? pendingMarker;
  final List<ValidationIssue> validationIssues;
  final ProjectSettings settings;
  final String? selectedId;
  final String? selectedOpeningId;
  final String? selectedMarkerId;
  final EditorMode mode;
  final double scale;
  final Offset panOffset;

  const StaticLayerPainter({
    required this.walls,
    required this.rooms,
    required this.columns,
    required this.wallElevations,
    required this.validationIssues,
    required this.settings,
    required this.mode,
    required this.scale,
    required this.panOffset,
    this.photoMarkers = const [],
    this.pendingMarker,
    this.selectedId,
    this.selectedOpeningId,
    this.selectedMarkerId,
  });

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.translate(
      size.width / 2 + panOffset.dx,
      size.height / 2 + panOffset.dy,
    );
    canvas.scale(scale, scale);

    if (settings.grid.showGrid) {
      _drawGrid(canvas, size);
    }
    if (settings.visual.showRooms) {
      _drawRoomFills(canvas);
    }
    _drawWalls(canvas);
    _drawColumns(canvas);
    _drawOpenings(canvas);
    _drawPhotoMarkers(canvas);

    canvas.restore();
  }

  // ── GRID ──────────────────────────────────────────────────────────────────

  void _drawGrid(Canvas canvas, Size size) {
    final baseStep = settings.grid.gridSize; // tamaño de celda en metros

    // LOD adaptativo: cuando la celda base es demasiado pequeña en pantalla,
    // escalar la cuadrícula automáticamente para mantenerla visible y no densa.
    // Umbral mínimo: 6px en pantalla; máximo razonable: 60px (evita densidad extrema).
    double gridStep = baseStep;
    const double minPx = 6.0;
    const double maxPx = 60.0;
    while (gridStep * scale < minPx) {
      gridStep *= 10; // zoom out extremo: saltar a cuadrícula 10× más gruesa
    }
    while (gridStep * scale > maxPx && gridStep > baseStep) {
      gridStep /= 10; // no sobre-escalar si volvemos a hacer zoom in
    }

    final halfW = size.width / 2 / scale;
    final halfH = size.height / 2 / scale;
    final panX = panOffset.dx / scale;
    final panY = panOffset.dy / scale;

    final left = -halfW - panX;
    final right = halfW - panX;
    final top = -halfH - panY;
    final bottom = halfH - panY;

    final minorPaint = Paint()
      ..color = LevonColors.grid
      ..strokeWidth = 0.5 / scale;

    final majorPaint = Paint()
      ..color = LevonColors.gridMajor
      ..strokeWidth = 1.0 / scale;

    // Línea mayor cada 5 celdas del nivel LOD actual
    final majorStep = gridStep * 5;

    final startX = (left / gridStep).floor() * gridStep;
    final startY = (top / gridStep).floor() * gridStep;

    double x = startX;
    while (x <= right + gridStep) {
      final isMajor = ((x / majorStep) - (x / majorStep).round()).abs() < 0.001;
      canvas.drawLine(
        Offset(x, top),
        Offset(x, bottom),
        isMajor ? majorPaint : minorPaint,
      );
      x += gridStep;
    }

    double y = startY;
    while (y <= bottom + gridStep) {
      final isMajor = ((y / majorStep) - (y / majorStep).round()).abs() < 0.001;
      canvas.drawLine(
        Offset(left, y),
        Offset(right, y),
        isMajor ? majorPaint : minorPaint,
      );
      y += gridStep;
    }

    // Ejes de origen
    final originPaint = Paint()
      ..color = LevonColors.navy.withValues(alpha: 0.15)
      ..strokeWidth = 1.5 / scale;
    canvas.drawLine(Offset(left, 0), Offset(right, 0), originPaint);
    canvas.drawLine(Offset(0, top), Offset(0, bottom), originPaint);
  }

  // ── ROOMS ─────────────────────────────────────────────────────────────────

  void _drawRoomFills(Canvas canvas) {
    if (!settings.visual.showRooms) return;
    final fillPaint = Paint()
      ..color = LevonColors.roomFill
      ..style = PaintingStyle.fill;

    final strokePaint = Paint()
      ..color = LevonColors.roomStroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.5 / scale;

    for (final room in rooms) {
      if (room.polygon.length < 3) continue;
      final path = _buildRoomPath(room);
      canvas.drawPath(path, fillPaint);
      canvas.drawPath(path, strokePaint);
    }
  }

  // ── WALLS ─────────────────────────────────────────────────────────────────

  void _drawWalls(Canvas canvas) {
    for (final wall in walls) {
      final isSelected = wall.id == selectedId;
      final hasError =
          validationIssues.any((v) => v.relatedEntityIds.contains(wall.id));

      final start =
          Offset(wall.geometry.startPoint.x, wall.geometry.startPoint.y);
      final end = Offset(wall.geometry.endPoint.x, wall.geometry.endPoint.y);

      // Glow de selección
      if (isSelected) {
        canvas.drawLine(
          start,
          end,
          Paint()
            ..color = LevonColors.selectGlow
            ..style = PaintingStyle.stroke
            ..strokeWidth = (wall.thickness > 0 ? wall.thickness : 0.15) * 2.5
            ..strokeCap = StrokeCap.round,
        );
      }

      // En modo eliminar los muros se tiñen de rojo para señalizar peligro.
      final isDeleteMode = mode == EditorMode.delete;
      final wallColor = hasError
          ? LevonColors.errorRed
          : isSelected
              ? (isDeleteMode ? LevonColors.errorRed : LevonColors.selectStroke)
              : isDeleteMode
                  ? LevonColors.errorRed.withValues(alpha: 0.55)
                  : wall.isStructural
                      ? LevonColors.wallStroke
                      : LevonColors.wallStroke.withValues(alpha: 0.4);

      canvas.drawLine(
        start,
        end,
        Paint()
          ..color = wallColor
          ..style = PaintingStyle.stroke
          ..strokeWidth = wall.thickness > 0 ? wall.thickness : 0.15
          ..strokeCap = StrokeCap.round,
      );

      // Nodos en extremos — rosado para contraste táctil
      final nodeRadius =
          settings.visual.annotativeScaling ? (3.5 / scale) : 0.15;
      final nodePaint = Paint()
        ..color = LevonColors.nodeColor
        ..style = PaintingStyle.fill;
      if (settings.visual.showNodes) {
        canvas.drawCircle(start, nodeRadius, nodePaint);
        canvas.drawCircle(end, nodeRadius, nodePaint);
      }

      if (isSelected && mode == EditorMode.select) {
        _drawWallHandles(canvas, start, end);
      }
    }
  }

  void _drawWallHandles(Canvas canvas, Offset start, Offset end) {
    final r = 8.0 / scale;
    final sw = 2.0 / scale;
    final mid = (start + end) / 2;
    final fill = Paint()
      ..color = Colors.white
      ..style = PaintingStyle.fill;
    final stroke = Paint()
      ..color = LevonColors.selectStroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = sw;

    for (final pos in [start, end]) {
      canvas.drawCircle(pos, r, fill);
      canvas.drawCircle(pos, r, stroke);
    }
    // Handle de movimiento (punto medio): ligeramente más pequeño y con fondo tintado
    final midFill = Paint()
      ..color = LevonColors.selectStroke.withValues(alpha: 0.15)
      ..style = PaintingStyle.fill;
    canvas.drawCircle(mid, r * 0.85, midFill);
    canvas.drawCircle(mid, r * 0.85, stroke);
  }

  // ── COLUMNS ───────────────────────────────────────────────────────────────

  void _drawColumns(Canvas canvas) {
    for (final col in columns) {
      final isSelected = col.id == selectedId;
      final pos = Offset(col.position.x, col.position.y);

      final isDeleteMode = mode == EditorMode.delete;
      final colColor = isSelected
          ? (isDeleteMode ? LevonColors.errorRed : LevonColors.selectStroke)
          : isDeleteMode
              ? LevonColors.errorRed.withValues(alpha: 0.55)
              : LevonColors.navy;

      final paint = Paint()
        ..color = colColor
        ..style = PaintingStyle.fill;

      if (col.shape == ColumnShape.circular) {
        canvas.drawCircle(pos, col.dimensionX / 2, paint);
      } else {
        final rect = Rect.fromCenter(
          center: pos,
          width: col.dimensionX,
          height: col.dimensionY,
        );
        canvas.drawRect(rect, paint);
      }

      if (isSelected && mode == EditorMode.select) {
        _drawColumnHandle(canvas, pos);
      }
    }
  }

  void _drawColumnHandle(Canvas canvas, Offset pos) {
    final r = 9.0 / scale;
    final sw = 2.0 / scale;
    canvas.drawCircle(
        pos,
        r,
        Paint()
          ..color = Colors.white
          ..style = PaintingStyle.fill);
    canvas.drawCircle(
        pos,
        r,
        Paint()
          ..color = LevonColors.selectStroke
          ..style = PaintingStyle.stroke
          ..strokeWidth = sw);
    // Cruz interior para indicar "mover"
    final arm = r * 0.55;
    final cross = Paint()
      ..color = LevonColors.selectStroke
      ..strokeWidth = sw * 0.8
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(
        Offset(pos.dx - arm, pos.dy), Offset(pos.dx + arm, pos.dy), cross);
    canvas.drawLine(
        Offset(pos.dx, pos.dy - arm), Offset(pos.dx, pos.dy + arm), cross);
  }

  // ── OPENINGS (plan-mode representation) ──────────────────────────────────

  void _drawOpenings(Canvas canvas) {
    final wallById = {for (final w in walls) w.id: w};

    for (final elev in wallElevations) {
      final wall = wallById[elev.wallId];
      if (wall == null) { continue; }

      final s = wall.geometry.startPoint;
      final e = wall.geometry.endPoint;
      final len = s.distanceTo(e);
      if (len < 1e-9) { continue; }
      final dir = (e - s) / len;
      // Perpendicular 90° clockwise
      final perp = Offset(dir.y, -dir.x);
      final dirOff = Offset(dir.x, dir.y);

      for (final op in elev.openings) {
        final isSelected = op.id == selectedOpeningId;
        if (op.type == OpeningType.door) {
          _drawDoorPlan(canvas, s, dirOff, perp, op, wall.thickness, isSelected);
        } else if (op.type == OpeningType.window) {
          _drawWindowPlan(canvas, s, dirOff, perp, op, wall.thickness, isSelected);
        }
        // OpeningType.opening: no plan symbol (generic opening, no arch representation)
      }
    }
  }

  void _drawDoorPlan(
    Canvas canvas,
    dynamic wallStart, // Vector2
    Offset dir,
    Offset perp,
    WallOpening op,
    double wallThickness,
    bool isSelected,
  ) {
    final side = op.isFlipped ? -1.0 : 1.0;
    final sx = (wallStart.x as double) + dir.dx * op.xOffset;
    final sy = (wallStart.y as double) + dir.dy * op.xOffset;
    final hinge = Offset(sx, sy);
    final leafEnd = Offset(
      hinge.dx + perp.dx * op.width * side,
      hinge.dy + perp.dy * op.width * side,
    );

    final strokeW = 1.2 / scale;
    final color = isSelected
        ? LevonColors.selectStroke
        : LevonColors.navy.withValues(alpha: 0.75);
    final paint = Paint()
      ..color = color
      ..strokeWidth = strokeW
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;

    // Hoja de puerta
    canvas.drawLine(hinge, leafEnd, paint);

    // Arco de apertura (quarter-circle)
    final arcRect = Rect.fromCircle(center: hinge, radius: op.width);
    final baseAngle = math.atan2(perp.dy * side, perp.dx * side);
    final sweepAngle = -math.pi / 2 * side;
    final arcPaint = Paint()
      ..color = color.withValues(alpha: 0.45)
      ..strokeWidth = strokeW
      ..style = PaintingStyle.stroke;
    canvas.drawArc(arcRect, baseAngle, sweepAngle, false, arcPaint);

    if (isSelected) {
      _drawOpeningSelectionRect(canvas, hinge, leafEnd, op.width, wallThickness);
    }
  }

  void _drawWindowPlan(
    Canvas canvas,
    dynamic wallStart,
    Offset dir,
    Offset perp,
    WallOpening op,
    double wallThickness,
    bool isSelected,
  ) {
    final offset = wallThickness * 0.35;
    final x0 = (wallStart.x as double) + dir.dx * op.xOffset;
    final y0 = (wallStart.y as double) + dir.dy * op.xOffset;
    final x1 = (wallStart.x as double) + dir.dx * op.xEnd;
    final y1 = (wallStart.y as double) + dir.dy * op.xEnd;

    final color = isSelected
        ? LevonColors.selectStroke
        : LevonColors.navy.withValues(alpha: 0.6);
    final paint = Paint()
      ..color = color
      ..strokeWidth = 1.0 / scale
      ..style = PaintingStyle.stroke;

    // Marco: dos líneas paralelas al eje del muro
    for (final sign in [-1.0, 1.0]) {
      canvas.drawLine(
        Offset(x0 + perp.dx * offset * sign, y0 + perp.dy * offset * sign),
        Offset(x1 + perp.dx * offset * sign, y1 + perp.dy * offset * sign),
        paint,
      );
    }
    // Línea central (vidrio)
    final centerPaint = Paint()
      ..color = color.withValues(alpha: 0.35)
      ..strokeWidth = (wallThickness * 0.3).clamp(0.01, 0.08)
      ..style = PaintingStyle.stroke;
    canvas.drawLine(Offset(x0, y0), Offset(x1, y1), centerPaint);

    if (isSelected) {
      final hinge = Offset(x0, y0);
      final leafEnd = Offset(x1, y1);
      _drawOpeningSelectionRect(canvas, hinge, leafEnd, op.width, wallThickness);
    }
  }

  void _drawOpeningSelectionRect(
    Canvas canvas,
    Offset a,
    Offset b,
    double width,
    double wallThickness,
  ) {
    final mid = (a + b) / 2;
    final selPaint = Paint()
      ..color = LevonColors.selectGlow
      ..strokeWidth = 1.5 / scale
      ..style = PaintingStyle.stroke;
    canvas.drawRect(
      Rect.fromCenter(center: mid, width: width, height: wallThickness * 1.4),
      selPaint,
    );
  }

  // ── PHOTO MARKERS ─────────────────────────────────────────────────────────

  void _drawPhotoMarkers(Canvas canvas) {
    for (final marker in photoMarkers) {
      if (!marker.visible) continue;
      final pos = Offset(marker.x, marker.y);
      final isSelected = marker.id == selectedMarkerId;
      _drawCameraCone(canvas, pos, marker, isSelected);
      _drawCameraBody(canvas, pos, isSelected);
    }

    // Ghost preview for a pending (not-yet-confirmed) marker
    final pending = pendingMarker;
    if (pending != null) {
      canvas.saveLayer(null, Paint()..color = const Color(0x7FFFFFFF));
      final pos = Offset(pending.x, pending.y);
      _drawCameraCone(canvas, pos, pending, false);
      _drawCameraBody(canvas, pos, false);
      canvas.restore();
    }
  }

  void _drawCameraCone(
    Canvas canvas,
    Offset pos,
    PhotoMarkerEntity marker,
    bool isSelected,
  ) {
    final cone = marker.cameraCone;
    if (cone.angle <= 0 || cone.range <= 0) return;

    final azRad = marker.orientation * math.pi / 180.0;
    final halfConeRad = (cone.angle / 2.0) * math.pi / 180.0;

    // Canvas angles: 0 = East (+X), clockwise positive.
    // Azimuth 0 (North/-Y) → canvas angle -π/2.
    final coneCenter = azRad - math.pi / 2.0;
    final startAngle = coneCenter - halfConeRad;

    final rect = Rect.fromCircle(center: pos, radius: cone.range);
    final coneColor = isSelected
        ? LevonColors.selectStroke.withValues(alpha: 0.18)
        : LevonColors.navy.withValues(alpha: 0.10);
    final outlineColor = isSelected
        ? LevonColors.selectStroke.withValues(alpha: 0.55)
        : LevonColors.navy.withValues(alpha: 0.30);

    // Filled cone sector
    final path = Path()
      ..moveTo(pos.dx, pos.dy)
      ..arcTo(rect, startAngle, cone.angle * math.pi / 180.0, false)
      ..close();
    canvas.drawPath(path, Paint()..color = coneColor..style = PaintingStyle.fill);

    // Cone outline (two radial edges + arc)
    final outlinePaint = Paint()
      ..color = outlineColor
      ..strokeWidth = 0.8 / scale
      ..style = PaintingStyle.stroke;
    canvas.drawPath(path, outlinePaint);
  }

  void _drawCameraBody(Canvas canvas, Offset pos, bool isSelected) {
    // Annotative radius: constant 8px on screen regardless of zoom.
    final r = 8.0 / scale;
    final lensR = 4.0 / scale;

    final bodyColor =
        isSelected ? LevonColors.selectStroke : LevonColors.navy.withValues(alpha: 0.85);

    // Selection glow ring
    if (isSelected) {
      canvas.drawCircle(
        pos,
        r * 1.6,
        Paint()
          ..color = LevonColors.selectGlow
          ..style = PaintingStyle.fill,
      );
    }

    // Camera body — filled circle
    canvas.drawCircle(pos, r, Paint()..color = bodyColor..style = PaintingStyle.fill);

    // Lens — white circle at center
    canvas.drawCircle(pos, lensR, Paint()..color = Colors.white..style = PaintingStyle.fill);

    // Lens outline
    canvas.drawCircle(
      pos,
      lensR,
      Paint()
        ..color = bodyColor.withValues(alpha: 0.5)
        ..strokeWidth = 0.6 / scale
        ..style = PaintingStyle.stroke,
    );
  }

  // ── HELPERS ───────────────────────────────────────────────────────────────

  Path _buildRoomPath(Room room) {
    final path = Path();
    if (room.polygon.isEmpty) return path;
    path.moveTo(room.polygon.first.x, room.polygon.first.y);
    for (var i = 1; i < room.polygon.length; i++) {
      path.lineTo(room.polygon[i].x, room.polygon[i].y);
    }
    path.close();
    return path;
  }

  @override
  bool shouldRepaint(covariant StaticLayerPainter old) {
    return old.walls != walls ||
        old.rooms != rooms ||
        old.columns != columns ||
        old.wallElevations != wallElevations ||
        old.photoMarkers != photoMarkers ||
        old.pendingMarker != pendingMarker ||
        old.validationIssues != validationIssues ||
        old.settings != settings ||
        old.selectedId != selectedId ||
        old.selectedOpeningId != selectedOpeningId ||
        old.selectedMarkerId != selectedMarkerId ||
        old.mode != mode ||
        old.scale != scale ||
        old.panOffset != panOffset;
  }
}
