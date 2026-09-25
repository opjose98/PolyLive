import 'dart:math' as math;
import 'package:vector_math/vector_math.dart';
import 'package:levon/shared/domain/shapes.dart';

/// Utilidades de geometría poligonal 2D: área, centroide, orientación y más.
///
/// Todos los métodos son estáticos y puros. Operan en coordenadas mundo (metros).
/// En el sistema de coordenadas Y-down de Flutter, área positiva = orientación CW.
class PolygonUtils {
  PolygonUtils._();

  // ── Área ──────────────────────────────────────────────────────────────────

  /// Área con signo usando la fórmula de Shoelace canónica.
  ///
  /// Resultado positivo = orientación horaria (CW) en Y-down.
  /// Resultado negativo = orientación antihoraria (CCW) en Y-down.
  /// Retorna 0.0 si hay menos de 3 vértices.
  static double signedArea(List<Vector2> vertices) {
    final n = vertices.length;
    if (n < 3) return 0.0;
    double area = 0.0;
    for (int i = 0; i < n; i++) {
      final j = (i + 1) % n;
      area += vertices[i].x * vertices[j].y;
      area -= vertices[j].x * vertices[i].y;
    }
    return area / 2.0;
  }

  /// Área absoluta. Siempre positiva. Retorna 0.0 si hay menos de 3 vértices.
  static double area(List<Vector2> vertices) => signedArea(vertices).abs();

  // ── Centroide ─────────────────────────────────────────────────────────────

  /// Centroide matemático real del polígono.
  ///
  /// Usa la fórmula exacta basada en el área:
  ///   Cx = (1/6A) × Σ (xi + xi+1)(xi·yi+1 − xi+1·yi)
  ///   Cy = (1/6A) × Σ (yi + yi+1)(xi·yi+1 − xi+1·yi)
  ///
  /// NUNCA es el promedio de vértices (incorrecto para polígonos irregulares).
  /// Para polígonos degenerados (área ≈ 0) retorna el promedio de vértices como fallback.
  static Vector2 centroid(List<Vector2> vertices) {
    final n = vertices.length;
    if (n == 0) return Vector2.zero();
    if (n < 3) {
      return vertices.fold(Vector2.zero(), (acc, v) => acc + v) / n.toDouble();
    }

    final a = signedArea(vertices);
    if (a.abs() < 1e-10) {
      // Polígono degenerado: promedio como fallback
      final sum = vertices.fold(Vector2.zero(), (acc, v) => acc + v);
      return sum / n.toDouble();
    }

    double cx = 0.0, cy = 0.0;
    for (int i = 0; i < n; i++) {
      final j = (i + 1) % n;
      final cross =
          vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
      cx += (vertices[i].x + vertices[j].x) * cross;
      cy += (vertices[i].y + vertices[j].y) * cross;
    }
    final factor = 1.0 / (6.0 * a);
    return Vector2(cx * factor, cy * factor);
  }

  // ── Orientación ───────────────────────────────────────────────────────────

  /// Retorna true si los vértices están en orientación horaria (CW) en Y-down.
  static bool isClockwise(List<Vector2> vertices) => signedArea(vertices) > 0;

  /// Garantiza orientación horaria (CW). Invierte si es necesario.
  static List<Vector2> ensureClockwise(List<Vector2> vertices) {
    return isClockwise(vertices)
        ? List.of(vertices)
        : vertices.reversed.toList();
  }

  // ── Arcos ─────────────────────────────────────────────────────────────────

  /// Aproxima un [ArcShape] como polilínea de [segments] segmentos.
  ///
  /// Incluye tanto el punto inicial como el final del arco.
  /// Para polígonos, excluir el último punto antes de concatenar con el siguiente segmento.
  static List<Vector2> approximateArc(ArcShape arc, {int segments = 24}) {
    final points = <Vector2>[];
    for (int i = 0; i <= segments; i++) {
      final angle = arc.startAngle + arc.sweepAngle * i / segments;
      points.add(Vector2(
        arc.center.x + arc.radius * math.cos(angle),
        arc.center.y + arc.radius * math.sin(angle),
      ));
    }
    return points;
  }

  // ── Distancia punto-segmento ──────────────────────────────────────────────

  /// Distancia perpendicular mínima desde [p] al segmento [a]→[b].
  ///
  /// Clampea el parámetro t en [0,1] para no extender el segmento como recta.
  /// Retorna `p.distanceTo(a)` si el segmento es degenerado (longitud ≈ 0).
  static double distanceToSegment(Vector2 p, Vector2 a, Vector2 b) {
    final ab = b - a;
    final lenSq = ab.dot(ab);
    if (lenSq < 1e-10) return p.distanceTo(a);
    final t = ((p - a).dot(ab) / lenSq).clamp(0.0, 1.0);
    return p.distanceTo(a + ab * t);
  }

  // ── Point-in-polygon ──────────────────────────────────────────────────────

  /// Determina si [point] está dentro del polígono por ray-casting.
  ///
  /// Comportamiento en borde no garantizado (depende de precisión flotante).
  static bool isPointInPolygon(Vector2 point, List<Vector2> vertices) {
    bool inside = false;
    final n = vertices.length;
    for (int i = 0, j = n - 1; i < n; j = i++) {
      final xi = vertices[i].x, yi = vertices[i].y;
      final xj = vertices[j].x, yj = vertices[j].y;
      final intersect = ((yi > point.y) != (yj > point.y)) &&
          (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
