import 'package:uuid/uuid.dart';
import 'package:vector_math/vector_math.dart';

/// Forma geométrica de la sección transversal de una columna.
enum ColumnShape {
  /// Sección circular: el diámetro se almacena en [ArchitecturalColumn.dimensionX].
  circular,

  /// Sección rectangular: ancho en [dimensionX], profundidad en [dimensionY].
  rectangular,
}

/// Entidad BIM que representa una columna arquitectónica.
///
/// Se nombra [ArchitecturalColumn] (en lugar de [Column]) para evitar conflicto
/// con la clase [Column] de Flutter que es un widget de layout.
///
/// La columna se posiciona por su centroide ([position]) y admite rotación
/// para columnas rectangulares no alineadas con los ejes del plano.
///
/// SISTEMA DE DIMENSIONES:
///   Circular   → [dimensionX] = diámetro (el radio para hit-test es dimensionX / 2)
///   Rectangular → [dimensionX] = ancho (eje X local), [dimensionY] = profundidad (eje Y local)
class ArchitecturalColumn {
  /// Identificador único inmutable de la columna (UUID v4).
  final String id;

  /// Posición del centroide de la columna en coordenadas mundo (metros).
  final Vector2 position;

  /// Forma de la sección transversal.
  final ColumnShape shape;

  /// Dimensión primaria en metros:
  ///   - Circular: diámetro total.
  ///   - Rectangular: ancho (dimensión en el eje X local, antes de rotar).
  final double dimensionX;

  /// Dimensión secundaria en metros.
  /// Solo relevante para [ColumnShape.rectangular] (profundidad en el eje Y local).
  /// Ignorado para columnas circulares; almacenado como 0.0.
  final double dimensionY;

  /// Altura de la columna en metros (dimensión Z de extrusión).
  final double height;

  /// Material en texto libre (e.g. 'Hormigón armado', 'Acero').
  final String material;

  /// Rotación de la sección en radianes, sentido horario desde el eje X positivo.
  /// 0.0 = sin rotación (columna alineada con ejes del plano).
  final double rotation;

  /// Observaciones libres de campo o levantamiento (máx. 500 caracteres).
  final String? notes;

  ArchitecturalColumn({
    String? id,
    required this.position,
    required this.shape,
    required this.dimensionX,
    this.dimensionY = 0.0,
    required this.height,
    required this.material,
    this.rotation = 0.0,
    this.notes,
  }) : id = id ?? const Uuid().v4();

  /// Retorna `true` si la sección es circular.
  bool get isCircular => shape == ColumnShape.circular;

  /// Alias legible de [dimensionX] para columnas rectangulares.
  double get width => dimensionX;

  /// Alias legible de [dimensionY] para columnas rectangulares.
  double get depth => dimensionY;

  /// Crea una copia de la columna con los campos especificados reemplazados.
  ArchitecturalColumn copyWith({
    String? id,
    Vector2? position,
    ColumnShape? shape,
    double? dimensionX,
    double? dimensionY,
    double? height,
    String? material,
    double? rotation,
    Object? notes = _colNotSet,
  }) {
    return ArchitecturalColumn(
      id: id ?? this.id,
      position: position ?? this.position,
      shape: shape ?? this.shape,
      dimensionX: dimensionX ?? this.dimensionX,
      dimensionY: dimensionY ?? this.dimensionY,
      height: height ?? this.height,
      material: material ?? this.material,
      rotation: rotation ?? this.rotation,
      notes: identical(notes, _colNotSet) ? this.notes : notes as String?,
    );
  }
}

const _colNotSet = Object();
