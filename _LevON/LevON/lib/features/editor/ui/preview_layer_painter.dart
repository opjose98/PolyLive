import 'package:flutter/material.dart';
import 'package:vector_math/vector_math.dart' as vmath;
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/project_settings.dart';

/// Capa dinámica del canvas: línea de preview + nodos snap + medida en tiempo real.
/// Se repinta en cada evento de drag — mantenerla barata es crítico.
class PreviewLayerPainter extends CustomPainter {
  final vmath.Vector2? previewStart;
  final vmath.Vector2? previewEnd;
  final DrawSubMode subMode;
  final double scale;
  final Offset panOffset;
  final ProjectSettings settings;
  final bool isCircular;

  const PreviewLayerPainter({
    required this.subMode,
    required this.scale,
    required this.panOffset,
    required this.settings,
    this.previewStart,
    this.previewEnd,
    this.isCircular = false,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (previewStart == null || previewEnd == null) return;

    canvas.save();
    canvas.translate(
      size.width / 2 + panOffset.dx,
      size.height / 2 + panOffset.dy,
    );
    canvas.scale(scale, scale);

    final start = Offset(previewStart!.x, previewStart!.y);
    final end = Offset(previewEnd!.x, previewEnd!.y);

    if (subMode == DrawSubMode.wall || subMode == DrawSubMode.partition) {
      _drawPreviewLine(canvas, start, end, settings.defaults.wallThickness);
      _drawSnapNode(canvas, start);
      _drawSnapNode(canvas, end);
      _drawSnapNode(canvas, end);
    } else if (subMode == DrawSubMode.column) {
      _drawColumnPreview(canvas, end);
      _drawSnapNode(canvas, end);
    }

    canvas.restore();
  }

  void _drawColumnPreview(Canvas canvas, Offset position) {
    final paint = Paint()
      ..color = LevonColors.wallPreview
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.05;

    if (isCircular) {
      canvas.drawCircle(position, settings.defaults.columnWidth / 2, paint);
    } else {
      canvas.drawRect(
        Rect.fromCenter(
          center: position,
          width: settings.defaults.columnWidth,
          height: settings.defaults.columnDepth,
        ),
        paint,
      );
    }
  }

  void _drawPreviewLine(Canvas canvas, Offset start, Offset end, double thickness) {
    canvas.drawLine(
      start,
      end,
      Paint()
        ..color = LevonColors.wallPreview
        ..style = PaintingStyle.stroke
        ..strokeWidth = thickness > 0 ? thickness : 0.15
        ..strokeCap = StrokeCap.round,
    );
  }

  void _drawSnapNode(Canvas canvas, Offset point) {
    // Anillo exterior semitransparente
    canvas.drawCircle(
      point,
      12.0 / scale,
      Paint()
        ..color = LevonColors.snapRing
        ..style = PaintingStyle.fill,
    );
    // Dot interior sólido
    canvas.drawCircle(
      point,
      4.0 / scale,
      Paint()
        ..color = LevonColors.snapNode
        ..style = PaintingStyle.fill,
    );
  }

  @override
  bool shouldRepaint(covariant PreviewLayerPainter old) {
    return old.previewStart != previewStart ||
        old.previewEnd != previewEnd ||
        old.subMode != subMode ||
        old.scale != scale ||
        old.panOffset != panOffset ||
        old.settings.defaults != settings.defaults ||
        old.isCircular != isCircular;
  }
}
