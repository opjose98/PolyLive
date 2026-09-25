import 'package:flutter/material.dart';
import 'package:vector_math/vector_math.dart' as vmath;
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/core/utils/unit_service.dart';

/// Capa superior del canvas: dibuja todas las etiquetas (muros, rooms, preview)
/// Asegura que los textos siempre estén por encima de cualquier otro elemento 
/// geométrico (estático o de preview).
class LabelsLayerPainter extends CustomPainter {
  final List<Wall> walls;
  final List<Room> rooms;
  final ProjectSettings settings;
  final String? selectedId;
  final EditorMode mode;
  final DrawSubMode subMode;
  final vmath.Vector2? previewStart;
  final vmath.Vector2? previewEnd;
  final double scale;
  final Offset panOffset;

  const LabelsLayerPainter({
    required this.walls,
    required this.rooms,
    required this.settings,
    required this.mode,
    required this.subMode,
    this.previewStart,
    this.previewEnd,
    required this.scale,
    required this.panOffset,
    this.selectedId,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final screenCenter = Offset(
      size.width / 2 + panOffset.dx,
      size.height / 2 + panOffset.dy,
    );

    Offset toScreen(Offset p) {
      return screenCenter + (p * scale);
    }

    if (settings.visual.showRooms) {
      _drawRoomLabels(canvas, toScreen);
    }
    _drawWallLabels(canvas, toScreen);
    _drawPreviewMeasure(canvas, toScreen);
  }

  void _drawRoomLabels(Canvas canvas, Offset Function(Offset) toScreen) {
    for (final room in rooms) {
      if (room.polygon.length < 3) continue;
      final centroid = Offset(room.centroid.x, room.centroid.y);
      final areaStr = UnitFormatter.area(room.area, settings.defaults.baseUnit,
          decimals: settings.precision.areaPrecision.clamp(0, 2));
      _drawLabel(
        canvas,
        toScreen(centroid),
        '${room.name}\n$areaStr',
        color: LevonColors.navy,
        bgOpacity: 0.92,
        bgRadius: 5.0,
      );
    }
  }

  void _drawWallLabels(Canvas canvas, Offset Function(Offset) toScreen) {
    if (selectedId == null || mode != EditorMode.select) return;
    for (final wall in walls) {
      if (wall.id != selectedId) continue;
      final start = Offset(wall.geometry.startPoint.x, wall.geometry.startPoint.y);
      final end = Offset(wall.geometry.endPoint.x, wall.geometry.endPoint.y);
      final length = wall.geometry.startPoint.distanceTo(wall.geometry.endPoint);
      final mid = (start + end) / 2;
      final dir = end - start;
      final wallDist = dir.distance;
      final perp = wallDist > 1e-9
          ? Offset(-dir.dy, dir.dx) / wallDist
          : const Offset(0, -1);
      final labelPosWorld = mid + perp * (32.0 / scale);
      
      _drawLabel(
        canvas,
        toScreen(labelPosWorld),
        UnitFormatter.length(length, settings.defaults.baseUnit,
            precision: settings.precision.lengthPrecision),
        color: LevonColors.selectStroke,
      );
      break;
    }
  }

  void _drawPreviewMeasure(Canvas canvas, Offset Function(Offset) toScreen) {
    if (previewStart == null || previewEnd == null) return;
    if (mode != EditorMode.draw) return;
    if (subMode != DrawSubMode.wall && subMode != DrawSubMode.partition) return;

    final start = Offset(previewStart!.x, previewStart!.y);
    final end = Offset(previewEnd!.x, previewEnd!.y);
    final length = previewStart!.distanceTo(previewEnd!);
    if (length < 0.05) return;

    final mid = (start + end) / 2;
    final label = UnitFormatter.length(length, settings.defaults.baseUnit,
        precision: settings.precision.lengthPrecision);

    _drawLabel(
      canvas,
      toScreen(mid),
      label,
      color: LevonColors.wallPreview,
      bgOpacity: 0.92,
      bgRadius: 3.0,
    );
  }

  void _drawLabel(Canvas canvas, Offset position, String text,
      {required Color color, double offsetY = 0, double bgOpacity = 0.88, double bgRadius = 3.0}) {
    canvas.save();
    canvas.translate(position.dx.roundToDouble(), (position.dy + offsetY).roundToDouble());

    final fontSize = settings.visual.annotativeScaling
        ? 12.0
        : (0.25 * scale).clamp(10.0, 18.0);

    final tp = TextPainter(
      text: TextSpan(
        text: text,
        style: TextStyle(
          color: color,
          fontSize: fontSize,
          fontWeight: FontWeight.w600,
          height: 1.3,
        ),
      ),
      textDirection: TextDirection.ltr,
      textAlign: TextAlign.center,
    )..layout();

    final bgRect = Rect.fromCenter(
      center: Offset.zero,
      width: tp.width + 8,
      height: tp.height + 4,
    );

    canvas.drawRRect(
      RRect.fromRectAndRadius(bgRect, Radius.circular(bgRadius)),
      Paint()..color = Colors.white.withValues(alpha: bgOpacity),
    );

    tp.paint(
      canvas,
      Offset(-tp.width / 2, -tp.height / 2),
    );

    canvas.restore();
  }

  @override
  bool shouldRepaint(covariant LabelsLayerPainter old) {
    return old.walls != walls ||
        old.rooms != rooms ||
        old.settings != settings ||
        old.selectedId != selectedId ||
        old.mode != mode ||
        old.subMode != subMode ||
        old.previewStart != previewStart ||
        old.previewEnd != previewEnd ||
        old.scale != scale ||
        old.panOffset != panOffset;
  }
}
