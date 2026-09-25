import 'package:vector_math/vector_math.dart';
import 'package:levon/core/geometry/polygons/polygon_utils.dart';

/// Resultado sellado de la validación de un polígono.
sealed class PolygonValidationResult {}

/// El polígono es válido. Los [vertices] están normalizados en orientación CW.
class PolygonValid extends PolygonValidationResult {
  final List<Vector2> vertices;
  PolygonValid(this.vertices);
}

/// El polígono es inválido. [reason] describe el paso que falló.
class PolygonInvalid extends PolygonValidationResult {
  final String reason;
  PolygonInvalid(this.reason);
}

/// Pipeline de 5 pasos para validar y normalizar polígonos BIM.
///
/// Orden: mínimo vértices → cierre → área mínima → auto-intersección → CW.
class PolygonValidator {
  /// Área mínima aceptable en m². Por debajo se descarta como micro-habitación.
  final double minArea;

  /// Distancia mínima para considerar dos vértices como duplicados.
  final double epsilon;

  const PolygonValidator({
    this.minArea = 0.01,
    this.epsilon = 0.001,
  });

  /// Valida [vertices] ejecutando el pipeline de 5 pasos.
  PolygonValidationResult validate(List<Vector2> vertices) {
    // Paso 1: mínimo 3 vértices
    if (vertices.length < 3) {
      return PolygonInvalid('Menos de 3 vértices (${vertices.length})');
    }

    // Paso 2: quitar duplicado de cierre si existe
    var verts = vertices;
    if (verts.length > 3 && verts.first.distanceTo(verts.last) < epsilon) {
      verts = verts.sublist(0, verts.length - 1);
      if (verts.length < 3) {
        return PolygonInvalid('Menos de 3 vértices únicos tras quitar cierre');
      }
    }

    // Paso 3: área > minArea
    final a = PolygonUtils.area(verts);
    if (a < minArea) {
      return PolygonInvalid(
          'Área insuficiente: ${a.toStringAsFixed(4)} m² < ${minArea.toStringAsFixed(4)} m²');
    }

    // Paso 4: sin auto-intersección O(n²)
    if (_hasSelfIntersection(verts)) {
      return PolygonInvalid('El polígono se auto-intersecta');
    }

    // Paso 5: normalizar orientación CW
    return PolygonValid(PolygonUtils.ensureClockwise(verts));
  }

  // ── Internos ───────────────────────────────────────────────────────────────

  bool _hasSelfIntersection(List<Vector2> v) {
    final n = v.length;
    for (int i = 0; i < n; i++) {
      final a1 = v[i];
      final a2 = v[(i + 1) % n];
      for (int j = i + 2; j < n; j++) {
        // Saltar par adyacente al cierre: (n-1, 0) y (0, 1) son adyacentes
        if (i == 0 && j == n - 1) continue;
        final b1 = v[j];
        final b2 = v[(j + 1) % n];
        if (_segmentsIntersect(a1, a2, b1, b2)) return true;
      }
    }
    return false;
  }

  bool _segmentsIntersect(Vector2 a1, Vector2 a2, Vector2 b1, Vector2 b2) {
    final d1 = _cross2d(b2 - b1, a1 - b1);
    final d2 = _cross2d(b2 - b1, a2 - b1);
    final d3 = _cross2d(a2 - a1, b1 - a1);
    final d4 = _cross2d(a2 - a1, b2 - a1);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  double _cross2d(Vector2 a, Vector2 b) => a.x * b.y - a.y * b.x;
}
