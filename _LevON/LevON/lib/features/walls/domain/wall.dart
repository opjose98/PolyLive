import 'package:uuid/uuid.dart';
import 'package:levon/shared/domain/shapes.dart';

/// Entidad BIM que representa un muro arquitectónico.
///
/// Un muro NO es simplemente una línea en pantalla: es un elemento semántico
/// con propiedades físicas (espesor, altura, material) y geometría polimórfica
/// ([LineShape], [ArcShape] o [PolygonShape]).
///
/// DISEÑO: Entidad inmutable — toda modificación produce una nueva instancia
/// mediante [copyWith]. El campo [id] identifica al muro de forma única y
/// persiste entre sesiones para mantener referencias de puertas y ventanas.
///
/// JERARQUÍA SEMÁNTICA:
///   isStructural = true  → muro portante (cierra habitaciones en TopologyGraph)
///   isStructural = false → partición ligera (no participa en detección de rooms)
class Wall {
  /// Identificador único inmutable del muro (UUID v4).
  final String id;

  /// Espesor del muro en metros (eje perpendicular al eje del muro).
  /// Valor típico: 0.15 m (mampostería), 0.10 m (tabique).
  final double thickness;

  /// Altura del muro en metros (dimensión vertical Z).
  /// Valor típico: 2.80 m (altura libre estándar).
  final double height;

  /// Material del muro en texto libre (e.g. 'Ladrillo', 'Hormigón').
  /// Usado para exportación IFC y anotaciones.
  final String material;

  /// Indica si el muro es estructural (portante) o una partición no estructural.
  ///
  /// Solo los muros estructurales participan en la detección de habitaciones
  /// ([DetectRoomsUseCase]) y en la validación de superposición.
  final bool isStructural;

  /// Geometría del eje central del muro.
  ///
  /// Puede ser [LineShape] (muro recto), [ArcShape] (muro curvo) o
  /// [PolygonShape] (muro de forma libre). El renderizado aplica [thickness]
  /// como desplazamiento perpendicular a esta línea axial.
  final Shape geometry;

  /// Observaciones libres de campo o levantamiento (máx. 500 caracteres).
  final String? notes;

  Wall({
    String? id,
    required this.geometry,
    required this.thickness,
    required this.height,
    required this.material,
    this.isStructural = true,
    this.notes,
  }) : id = id ?? const Uuid().v4();

  /// Longitud total del muro en metros (delega a la geometría).
  double get length => geometry.length;

  /// Crea una copia del muro con los campos especificados reemplazados.
  ///
  /// El [id] se preserva salvo que se pase explícitamente un nuevo valor.
  Wall copyWith({
    String? id,
    Shape? geometry,
    double? thickness,
    double? height,
    String? material,
    bool? isStructural,
    Object? notes = _wallNotSet,
  }) {
    return Wall(
      id: id ?? this.id,
      geometry: geometry ?? this.geometry,
      thickness: thickness ?? this.thickness,
      height: height ?? this.height,
      material: material ?? this.material,
      isStructural: isStructural ?? this.isStructural,
      notes: identical(notes, _wallNotSet) ? this.notes : notes as String?,
    );
  }
}

const _wallNotSet = Object();
