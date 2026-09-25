import 'package:flutter/material.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/viewport/space_bounds.dart';

// ─── SPACE PREVIEW PAINTER ────────────────────────────────────────────────────

/// CustomPainter semántico y lightweight para previews de espacios BIM.
///
/// Renderiza: muros (estructurales en trazo sólido, particiones en trazo fino),
/// columnas (cuadradas o circulares), rooms (polígono relleno).
///
/// Auto-fit: calcula automáticamente escala y centrado desde [SpaceBounds].
/// NO incluye: grid, overlays, snapping, handles de selección, debug layers.
///
/// Uso principal: [SpaceCard] en [SpaceListScreen].
class SpacePreviewPainter extends CustomPainter {
  final List<Wall> walls;
  final List<Room> rooms;
  final List<ArchitecturalColumn> columns;
  final SpaceBounds? bounds;

  const SpacePreviewPainter({
    required this.walls,
    required this.rooms,
    required this.columns,
    this.bounds,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final b = bounds;
    if (b == null || (walls.isEmpty && columns.isEmpty)) {
      _drawEmptyPlaceholder(canvas, size);
      return;
    }

    canvas.save();

    // ── Auto-fit transform ─────────────────────────────────────────────────
    final scale = b.fitScale(size, padding: 12);
    final cx = size.width / 2;
    final cy = size.height / 2;

    canvas.translate(cx, cy);
    canvas.scale(scale, scale);
    canvas.translate(-b.center.dx, -b.center.dy);

    // ── Render ────────────────────────────────────────────────────────────
    _drawRooms(canvas, scale);
    _drawWalls(canvas, scale);
    _drawColumns(canvas, scale);

    canvas.restore();
  }

  void _drawRooms(Canvas canvas, double scale) {
    final fill = Paint()
      ..color = LevonColors.roomFill
      ..style = PaintingStyle.fill;

    final stroke = Paint()
      ..color = LevonColors.roomStroke
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0 / scale;

    for (final room in rooms) {
      if (room.polygon.length < 3) continue;
      final path = Path();
      path.moveTo(room.polygon.first.x, room.polygon.first.y);
      for (int i = 1; i < room.polygon.length; i++) {
        path.lineTo(room.polygon[i].x, room.polygon[i].y);
      }
      path.close();
      canvas.drawPath(path, fill);
      canvas.drawPath(path, stroke);
    }
  }

  void _drawWalls(Canvas canvas, double scale) {
    for (final wall in walls) {
      final start = Offset(wall.geometry.startPoint.x, wall.geometry.startPoint.y);
      final end = Offset(wall.geometry.endPoint.x, wall.geometry.endPoint.y);

      final paint = Paint()
        ..color = wall.isStructural
            ? LevonColors.wallStroke
            : LevonColors.wallStroke.withValues(alpha: 0.4)
        ..strokeWidth = wall.isStructural
            ? (wall.thickness > 0 ? wall.thickness : 0.15)
            : (0.07)
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;

      canvas.drawLine(start, end, paint);
    }
  }

  void _drawColumns(Canvas canvas, double scale) {
    final paint = Paint()
      ..color = LevonColors.navy.withValues(alpha: 0.85)
      ..style = PaintingStyle.fill;

    for (final col in columns) {
      final pos = Offset(col.position.x, col.position.y);
      if (col.shape == ColumnShape.circular) {
        canvas.drawCircle(pos, col.dimensionX / 2, paint);
      } else {
        canvas.drawRect(
          Rect.fromCenter(
            center: pos,
            width: col.dimensionX,
            height: col.dimensionY,
          ),
          paint,
        );
      }
    }
  }

  void _drawEmptyPlaceholder(Canvas canvas, Size size) {
    // Grid ligero de referencia para espacios vacíos
    final gridPaint = Paint()
      ..color = LevonColors.divider.withValues(alpha: 0.8)
      ..strokeWidth = 0.5;

    const step = 16.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }
  }

  @override
  bool shouldRepaint(covariant SpacePreviewPainter old) {
    return old.walls != walls ||
        old.rooms != rooms ||
        old.columns != columns ||
        old.bounds != bounds;
  }
}
