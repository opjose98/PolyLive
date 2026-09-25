import 'dart:math' as math;
import 'package:vector_math/vector_math.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/core/constants.dart';

/// Motor de intersecciones geométricas 2D para primitivas BIM.
///
/// Todos los métodos son estáticos y puros (sin estado).
/// Operan en coordenadas mundo (metros) con tolerancia [epsilon] (1 mm).
///
/// Primitivas soportadas:
///   - Línea × Línea   → [getLineIntersection]
///   - Línea × Arco    → [getLineArcIntersection]
///   - Arco  × Arco    → [getArcArcIntersection]
///   - Shape × Shape   → [doShapesIntersect] (dispatcher polimórfico)
class GeometryEngine {
  // ── LÍNEA × LÍNEA ──────────────────────────────────────────────────────────

  /// Calcula el punto de intersección entre dos segmentos de recta.
  ///
  /// Usa la formulación algebraica 2D con determinantes:
  ///   t = [(p1×p2)·(p3−p4) − (p3×p4)·(p1−p2)] / D
  ///   donde p×q = p.x·q.y − p.y·q.x (producto cruzado 2D) y D = denominador común.
  ///
  /// Retorna `null` si los segmentos son paralelos (D ≈ 0) o si el punto de
  /// intersección de las rectas cae fuera de alguno de los dos segmentos.
  static Vector2? getLineIntersection(
      Vector2 p1, Vector2 p2, Vector2 p3, Vector2 p4) {
    final denominator =
        (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);

    // D ≈ 0: rectas paralelas o colineales → sin intersección puntual
    if (isCloseEnough(denominator, 0.0)) return null;

    final x = ((p1.x * p2.y - p1.y * p2.x) * (p3.x - p4.x) -
            (p1.x - p2.x) * (p3.x * p4.y - p3.y * p4.x)) /
        denominator;
    final y = ((p1.x * p2.y - p1.y * p2.x) * (p3.y - p4.y) -
            (p1.y - p2.y) * (p3.x * p4.y - p3.y * p4.x)) /
        denominator;

    final intersection = Vector2(x, y);

    // Verificar que el punto de intersección cae sobre ambos segmentos
    if (_isPointOnSegment(intersection, p1, p2) &&
        _isPointOnSegment(intersection, p3, p4)) {
      return intersection;
    }
    return null;
  }

  /// Verifica si [p] está sobre el segmento [a]→[b] con tolerancia [epsilon].
  static bool _isPointOnSegment(Vector2 p, Vector2 a, Vector2 b) {
    return p.x >= math.min(a.x, b.x) - epsilon &&
        p.x <= math.max(a.x, b.x) + epsilon &&
        p.y >= math.min(a.y, b.y) - epsilon &&
        p.y <= math.max(a.y, b.y) + epsilon;
  }

  // ── LÍNEA × ARCO ───────────────────────────────────────────────────────────

  /// Calcula los puntos de intersección entre un segmento de recta y un arco.
  ///
  /// Método: sustitución paramétrica.
  ///   Sea p = p1 + t·(p2 − p1) un punto en la recta, t ∈ [0,1].
  ///   Sustituir en la ecuación del círculo (x−cx)² + (y−cy)² = r²
  ///   da una ecuación cuadrática en t: a·t² + b·t + c = 0.
  ///   discriminante < 0 → sin intersección.
  ///   discriminante = 0 → tangente (1 punto).
  ///   discriminante > 0 → 2 puntos candidatos.
  ///
  /// Retorna 0, 1 o 2 puntos que estén sobre el segmento Y dentro del barrido del arco.
  static List<Vector2> getLineArcIntersection(LineShape line, ArcShape arc) {
    final d = line.end - line.start;
    final f = line.start - arc.center;

    final a = d.dot(d);
    final b = 2 * f.dot(d);
    final c = f.dot(f) - arc.radius * arc.radius;

    final discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return const [];

    final sqrtDisc = math.sqrt(discriminant);
    final t1 = (-b - sqrtDisc) / (2 * a);
    final t2 = (-b + sqrtDisc) / (2 * a);

    final intersections = <Vector2>[];

    if (t1 >= 0 && t1 <= 1) {
      final p1 = line.start + d * t1;
      if (_isPointOnArc(p1, arc)) intersections.add(p1);
    }

    // Solo agregar t2 si es un punto distinto (discriminante > 0)
    if (discriminant > 0 && t2 >= 0 && t2 <= 1) {
      final p2 = line.start + d * t2;
      if (_isPointOnArc(p2, arc)) intersections.add(p2);
    }

    return intersections;
  }

  // ── ARCO × ARCO ────────────────────────────────────────────────────────────

  /// Calcula los puntos de intersección entre dos arcos circulares.
  ///
  /// Método: geometría de círculos concéntricos.
  ///   d = distancia entre centros.
  ///   Si d > r1+r2: círculos demasiado separados, sin intersección.
  ///   Si d < |r1−r2|: un círculo contiene al otro, sin intersección.
  ///   Si d ≈ 0 y r1 ≈ r2: círculos coincidentes (infinitos puntos → sin intersección puntual).
  ///
  ///   Para d válido:
  ///     a = (r1² − r2² + d²) / (2·d)
  ///     h = √(r1² − a²)
  ///   Los puntos candidatos se proyectan y se verifica que pertenezcan a ambos arcos.
  static List<Vector2> getArcArcIntersection(ArcShape arc1, ArcShape arc2) {
    final d = arc1.center.distanceTo(arc2.center);

    if (d > arc1.radius + arc2.radius) return const [];
    if (d < (arc1.radius - arc2.radius).abs()) return const [];
    if (d < epsilon && (arc1.radius - arc2.radius).abs() < epsilon) {
      return const [];
    }

    final a = (arc1.radius * arc1.radius - arc2.radius * arc2.radius + d * d) /
        (2 * d);
    final h = math.sqrt(arc1.radius * arc1.radius - a * a);

    final p2 = arc1.center + (arc2.center - arc1.center) * (a / d);

    final rx = -(arc2.center.y - arc1.center.y) * (h / d);
    final ry = (arc2.center.x - arc1.center.x) * (h / d);

    final candidate1 = Vector2(p2.x + rx, p2.y + ry);
    final candidate2 = Vector2(p2.x - rx, p2.y - ry);

    final intersections = <Vector2>[];
    if (_isPointOnArc(candidate1, arc1) && _isPointOnArc(candidate1, arc2)) {
      intersections.add(candidate1);
    }
    // Solo agregar si h > 0 (evita duplicar el punto de tangencia)
    if (h > 0 &&
        _isPointOnArc(candidate2, arc1) &&
        _isPointOnArc(candidate2, arc2)) {
      intersections.add(candidate2);
    }

    return intersections;
  }

  /// Verifica si [p] está contenido dentro del barrido angular del [arc].
  ///
  /// Normaliza el ángulo del punto a [0, 2π] y verifica si cae dentro del
  /// rango [startAngle, startAngle + sweepAngle], teniendo en cuenta
  /// barridos positivos (CCW) y negativos (CW).
  static bool _isPointOnArc(Vector2 p, ArcShape arc) {
    double angle = math.atan2(p.y - arc.center.y, p.x - arc.center.x);
    if (angle < 0) angle += 2 * math.pi;

    double startAngle = arc.startAngle;
    double endAngle = arc.startAngle + arc.sweepAngle;

    if (startAngle < 0) startAngle += 2 * math.pi;
    if (endAngle < 0) endAngle += 2 * math.pi;

    if (arc.sweepAngle > 0) {
      if (startAngle <= endAngle) {
        return angle >= startAngle - epsilon && angle <= endAngle + epsilon;
      } else {
        // El arco cruza el eje 0/2π
        return angle >= startAngle - epsilon || angle <= endAngle + epsilon;
      }
    } else {
      if (endAngle <= startAngle) {
        return angle >= endAngle - epsilon && angle <= startAngle + epsilon;
      } else {
        return angle >= endAngle - epsilon || angle <= startAngle + epsilon;
      }
    }
  }

  // ── DISPATCHER POLIMÓRFICO ─────────────────────────────────────────────────

  /// Determina los puntos de intersección entre dos formas BIM cualesquiera.
  ///
  /// Despacha al método especializado según los tipos concretos de [a] y [b].
  /// Retorna lista vacía si las formas no se intersectan o su combinación no
  /// está soportada (e.g., [PolygonShape] vs [ArcShape]).
  static List<Vector2> doShapesIntersect(Shape a, Shape b) {
    if (a is LineShape && b is LineShape) {
      final p = getLineIntersection(a.start, a.end, b.start, b.end);
      return p != null ? [p] : const [];
    } else if (a is LineShape && b is ArcShape) {
      return getLineArcIntersection(a, b);
    } else if (a is ArcShape && b is LineShape) {
      return getLineArcIntersection(b, a);
    } else if (a is ArcShape && b is ArcShape) {
      return getArcArcIntersection(a, b);
    }
    return const [];
  }

  /// Alias de compatibilidad que delega a [doShapesIntersect].
  ///
  /// Retorna el primer punto de intersección o null si no hay ninguno.
  /// Uso en código nuevo: preferir [doShapesIntersect] directamente.
  static Vector2? wallIntersection(Wall a, Wall b) {
    final pts = doShapesIntersect(a.geometry, b.geometry);
    return pts.isNotEmpty ? pts.first : null;
  }
}
