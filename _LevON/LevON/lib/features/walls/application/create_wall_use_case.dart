import 'package:vector_math/vector_math.dart';
import 'package:levon/shared/domain/shapes.dart';
import 'package:levon/features/walls/domain/wall.dart';

/// Caso de uso: crea una entidad [Wall] a partir de parámetros geométricos.
///
/// Es una función pura sin estado: no recibe un proyecto, no lo modifica.
/// El caller (EditorController) es responsable de insertar el muro resultante
/// en el provider correspondiente y registrar el snapshot de historial.
///
/// DISEÑO: Mantener el caso de uso sin dependencia de Riverpod o Flutter
/// permite ejecutarlo también en tests unitarios sin contexto de widget.
class CreateWallUseCase {
  const CreateWallUseCase();

  /// Crea y retorna un [Wall] recto entre [start] y [end].
  ///
  /// Retorna `null` si la longitud del segmento es menor a [minLength]
  /// para evitar muros degenerados que rompen la detección de habitaciones.
  Wall? executeStraightWall({
    required Vector2 start,
    required Vector2 end,
    double thickness = 0.15,
    double height = 2.80,
    String material = 'Generic',
    bool isStructural = true,
    double minLength = 0.1,
  }) {
    if (start.distanceTo(end) < minLength) return null;

    return Wall(
      geometry: LineShape(start, end),
      thickness: thickness,
      height: height,
      material: material,
      isStructural: isStructural,
    );
  }
}
