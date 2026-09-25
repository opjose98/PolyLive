import 'package:vector_math/vector_math.dart';
import 'package:levon/core/constants.dart';

/// Extensiones de precisión sobre [Vector2].
///
/// Añade comparación con tolerancia BIM al tipo vector de la librería
/// `vector_math` sin necesidad de subclasificarla.
extension Vector2Precision on Vector2 {
  /// Retorna `true` si [other] está dentro de [epsilon] (1 mm) de este vector.
  ///
  /// Usar en lugar de `==` para coordenadas de mundo BIM, donde los errores
  /// de punto flotante acumulados pueden separar puntos que deben ser idénticos.
  bool isAlmostEqual(Vector2 other) {
    return isCloseEnough(x, other.x) && isCloseEnough(y, other.y);
  }
}
