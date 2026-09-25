import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/core/math_utils.dart';

/// Caso de uso: valida condiciones geométricas de bajo nivel sobre muros.
///
/// Complementa a [ValidationPipeline] (que opera sobre el [Project] completo)
/// con validaciones que necesitan acceso a subconjuntos de muros,
/// como la comprobación de cierre topológico para crear habitaciones manualmente.
class ValidateGeometryUseCase {
  /// Verifica si una secuencia de muros forma un polígono cerrado topológicamente.
  ///
  /// Un polígono válido requiere:
  ///   1. Al menos 3 muros.
  ///   2. El endPoint de wall[i] coincide con el startPoint de wall[i+1] (encadenamiento).
  ///   3. El endPoint del último muro coincide con el startPoint del primero (cierre).
  ///
  /// La comparación usa [Vector2Precision.isAlmostEqual] con tolerancia 1 mm
  /// para admitir errores de punto flotante acumulados.
  bool isClosedPolygon(List<Wall> walls) {
    if (walls.length < 3) return false;

    // Verificar encadenamiento consecutivo
    for (int i = 0; i < walls.length - 1; i++) {
      if (!walls[i]
          .geometry
          .endPoint
          .isAlmostEqual(walls[i + 1].geometry.startPoint)) {
        return false;
      }
    }

    // Verificar cierre: el último muro conecta con el primero
    return walls.last.geometry.endPoint
        .isAlmostEqual(walls.first.geometry.startPoint);
  }
}
