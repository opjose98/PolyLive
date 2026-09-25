import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';

/// Calcula los bounds de la geometría de un espacio BIM.
class SpaceBounds {
  final double minX, minY, maxX, maxY;

  const SpaceBounds({
    required this.minX,
    required this.minY,
    required this.maxX,
    required this.maxY,
  });

  double get width => maxX - minX;
  double get height => maxY - minY;
  Offset get center => Offset((minX + maxX) / 2, (minY + maxY) / 2);

  /// Calcula la escala de fit para un canvas de [canvasSize] con [padding].
  double fitScale(Size canvasSize, {double padding = 60}) {
    if (width <= 0 || height <= 0) return 1.0;
    final availW = canvasSize.width - padding * 2;
    final availH = canvasSize.height - padding * 2;
    final scaleX = availW / width;
    final scaleY = availH / height;
    
    // Limitar la escala máxima para que no haga un zoom excesivo en elementos pequeños
    return math.min(math.min(scaleX, scaleY), 50.0);
  }

  static SpaceBounds? fromGeometry({
    required List<Wall> walls,
    required List<ArchitecturalColumn> columns,
  }) {
    double? minX, minY, maxX, maxY;

    void expand(double x, double y) {
      minX = minX == null ? x : math.min(minX!, x);
      minY = minY == null ? y : math.min(minY!, y);
      maxX = maxX == null ? x : math.max(maxX!, x);
      maxY = maxY == null ? y : math.max(maxY!, y);
    }

    for (final w in walls) {
      expand(w.geometry.startPoint.x, w.geometry.startPoint.y);
      expand(w.geometry.endPoint.x, w.geometry.endPoint.y);
    }
    for (final c in columns) {
      expand(c.position.x - c.dimensionX / 2, c.position.y - c.dimensionY / 2);
      expand(c.position.x + c.dimensionX / 2, c.position.y + c.dimensionY / 2);
    }

    if (minX == null) return null;
    return SpaceBounds(minX: minX!, minY: minY!, maxX: maxX!, maxY: maxY!);
  }
}
