/// Re-export de compatibilidad. Toda lógica nueva vive en [PolygonUtils].
///
/// Los callers existentes que importan 'geometry/polygons.dart' siguen funcionando.
/// Migrar a [PolygonUtils] en Beta y eliminar este archivo.
library;

export 'polygons/polygon_utils.dart';

import 'package:vector_math/vector_math.dart';
import 'package:levon/core/geometry/polygons/polygon_utils.dart';

/// Alias de compatibilidad para callers que usen [Polygons] directamente.
///
/// Deprecated: usar [PolygonUtils] en código nuevo.
class Polygons {
  Polygons._();

  @Deprecated('Usar PolygonUtils.area()')
  static double calculateArea(List<Vector2> vertices) =>
      PolygonUtils.area(vertices);

  @Deprecated('Usar PolygonUtils.isPointInPolygon()')
  static bool isPointInPolygon(Vector2 point, List<Vector2> vertices) =>
      PolygonUtils.isPointInPolygon(point, vertices);
}
