import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/features/editor/ui/static_layer_painter.dart';

/// Genera una miniatura PNG del canvas BIM sin necesidad de un widget en pantalla.
///
/// Utiliza [ui.PictureRecorder] + [Canvas] para ejecutar [StaticLayerPainter]
/// fuera del árbol de widgets, produciendo bytes PNG listos para embeberse
/// en el contenedor .levon como `preview.png`.
///
/// Decisión de diseño: se reutiliza [StaticLayerPainter] directamente para
/// garantizar que la preview sea visualmente idéntica al canvas real, sin
/// duplicar lógica de renderizado.
///
/// La grilla se omite en la preview (ruido visual innecesario en miniaturas).
class PreviewGenerator {
  const PreviewGenerator._();

  /// Renderiza el estado BIM actual y retorna los bytes PNG.
  ///
  /// [outputSize] controla las dimensiones del PNG generado (por defecto 512×512).
  /// [scale] es píxeles por metro; valores más altos centran más detalle.
  ///
  /// Retorna null si no hay elementos para renderizar (canvas vacío).
  static Future<Uint8List?> generate({
    required List<Wall> walls,
    required List<ArchitecturalColumn> columns,
    required List<Room> rooms,
    Size outputSize = const Size(512, 512),
    double scale = 40.0,
  }) async {
    // Sin elementos no tiene sentido generar una preview en blanco.
    if (walls.isEmpty && columns.isEmpty && rooms.isEmpty) return null;

    // Calcular el centro de masa del modelo para centrar la preview.
    final panOffset = _computeCenterOffset(walls, columns, outputSize, scale);

    // Configuración mínima de settings sin grilla para preview limpia.
    const settings = ProjectSettings(
      grid: GridSettings(showGrid: false),
    );

    final recorder = ui.PictureRecorder();
    final canvas = Canvas(recorder);

    // Fondo blanco para la miniatura.
    canvas.drawRect(
      Rect.fromLTWH(0, 0, outputSize.width, outputSize.height),
      Paint()..color = Colors.white,
    );

    final painter = StaticLayerPainter(
      walls: walls,
      rooms: rooms,
      columns: columns,
      wallElevations: const [],
      validationIssues: const [],
      settings: settings,
      mode: EditorMode.view,
      scale: scale,
      panOffset: panOffset,
    );
    painter.paint(canvas, outputSize);

    final picture = recorder.endRecording();
    final image = await picture.toImage(
      outputSize.width.toInt(),
      outputSize.height.toInt(),
    );
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    return byteData?.buffer.asUint8List();
  }

  /// Calcula el desplazamiento necesario para centrar el modelo en la preview.
  ///
  /// Promedia los puntos de inicio y fin de todos los muros y columnas para
  /// obtener el centroide geométrico aproximado del proyecto.
  static Offset _computeCenterOffset(
    List<Wall> walls,
    List<ArchitecturalColumn> columns,
    Size outputSize,
    double scale,
  ) {
    if (walls.isEmpty && columns.isEmpty) return Offset.zero;

    double sumX = 0;
    double sumY = 0;
    int count = 0;

    for (final wall in walls) {
      final s = wall.geometry.startPoint;
      final e = wall.geometry.endPoint;
      sumX += s.x + e.x;
      sumY += s.y + e.y;
      count += 2;
    }

    for (final col in columns) {
      sumX += col.position.x;
      sumY += col.position.y;
      count += 1;
    }

    if (count == 0) return Offset.zero;

    final centerX = sumX / count;
    final centerY = sumY / count;

    // Invertir para mover el centroide al centro del canvas.
    return Offset(-centerX * scale, -centerY * scale);
  }
}
