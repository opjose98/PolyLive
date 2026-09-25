import 'dart:math' as math;
import 'package:vector_math/vector_math.dart';

/// Clase base abstracta para cualquier forma geométrica BIM.
///
/// Define la interfaz mínima que toda geometría debe exponer:
/// - [length]: longitud lineal total.
/// - [startPoint] / [endPoint]: anclajes para conexiones entre elementos.
///
/// Las formas son inmutables por diseño. Modificar la geometría de un muro
/// implica reemplazar su [Shape] con una nueva instancia.
abstract class Shape {
  const Shape();

  /// Longitud lineal total de la forma en metros.
  double get length;

  /// Punto de inicio del segmento (anclaje para conexiones topológicas).
  Vector2 get startPoint;

  /// Punto de fin del segmento (anclaje para conexiones topológicas).
  Vector2 get endPoint;
}

/// Segmento recto entre dos puntos: la forma más común en BIM arquitectónico.
///
/// Representa muros, particiones y cualquier elemento lineal.
class LineShape extends Shape {
  final Vector2 start;
  final Vector2 end;

  const LineShape(this.start, this.end);

  @override
  double get length => start.distanceTo(end);

  @override
  Vector2 get startPoint => start;

  @override
  Vector2 get endPoint => end;
}

/// Arco circular definido por centro, radio, ángulo inicial y barrido.
///
/// Usado para muros curvos y elementos circulares en planta.
/// Los ángulos se expresan en radianes.
class ArcShape extends Shape {
  final Vector2 center;
  final double radius;

  /// Ángulo inicial en radianes (medido desde el eje X positivo).
  final double startAngle;

  /// Barrido angular en radianes. Positivo = antihorario, negativo = horario.
  final double sweepAngle;

  const ArcShape({
    required this.center,
    required this.radius,
    required this.startAngle,
    required this.sweepAngle,
  });

  /// Longitud del arco: radio × |ángulo de barrido|.
  @override
  double get length => radius * sweepAngle.abs();

  @override
  Vector2 get startPoint => Vector2(
        center.x + radius * math.cos(startAngle),
        center.y + radius * math.sin(startAngle),
      );

  @override
  Vector2 get endPoint => Vector2(
        center.x + radius * math.cos(startAngle + sweepAngle),
        center.y + radius * math.sin(startAngle + sweepAngle),
      );
}

/// Polilínea o spline de múltiples vértices.
///
/// Usado para muros irregulares o contornos de formas libres.
/// La longitud es la suma de todos los segmentos consecutivos.
class PolygonShape extends Shape {
  final List<Vector2> vertices;

  const PolygonShape(this.vertices);

  /// Suma de longitudes de todos los segmentos consecutivos.
  @override
  double get length {
    if (vertices.length < 2) return 0.0;
    double total = 0.0;
    for (int i = 0; i < vertices.length - 1; i++) {
      total += vertices[i].distanceTo(vertices[i + 1]);
    }
    return total;
  }

  @override
  Vector2 get startPoint =>
      vertices.isNotEmpty ? vertices.first : Vector2.zero();

  @override
  Vector2 get endPoint => vertices.isNotEmpty ? vertices.last : Vector2.zero();
}
