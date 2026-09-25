import 'package:uuid/uuid.dart';

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/photos/domain/photo.dart';
import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';

/// Entidad raíz del dominio BIM.
///
/// Representa un proyecto completo con todas sus plantas y elementos.
/// Es inmutable por diseño: toda modificación produce una nueva instancia mediante [copyWith].
/// Las mutaciones se gestionan en la capa de aplicación a través de los providers de Riverpod.
///
/// NOTA ARQUITECTÓNICA: La lista [rooms] se excluye de [copyWith] porque las habitaciones
/// son entidades derivadas (calculadas a partir de [walls] por [DetectRoomsUseCase]),
/// no datos primarios que persistan directamente.
class Project {
  final String id;
  final String title;

  // ── BIM IDENTITY ────────────────────────────────────────────────────────────

  /// Código BIM corto único del proyecto. Ej: BIM001, ARC042.
  ///
  /// Generado automáticamente al crear el proyecto, editable por el usuario.
  /// Compatible con nomenclatura IFC/BIM estándar.
  /// Null en proyectos legacy (schema v2.0 anterior a v0.9.2).
  final String? bimCode;

  /// Descripción breve del proyecto. Campo libre.
  final String description;

  /// Disciplina BIM principal. Ej: 'Arquitectura', 'Estructuras', 'MEP'.
  final String discipline;

  /// Autor o responsable del levantamiento.
  final String author;

  // ── MULTI-SPACE ARCHITECTURE ────────────────────────────────────────────────

  /// Mapa de geometrías por ID de espacio (Storey/Level).
  /// Permite que cada espacio sea un "dibujo nuevo" independiente.
  final Map<String, SpaceGeometry> spaces;

  // ── ELEMENTOS BIM (Backward Compatibility) ──────────────────────────────────
  // Estos getters redirigen al espacio 'ground' para no romper el resto de la app.

  List<Wall> get walls => spaces['ground']?.walls ?? const [];
  List<ArchitecturalColumn> get columns => spaces['ground']?.columns ?? const [];
  List<WallElevation> get wallElevations => spaces['ground']?.wallElevations ?? const [];
  List<Room> get rooms => spaces['ground']?.rooms ?? const [];

  /// Fotografías de campo adjuntas al levantamiento (legacy).
  final List<Photo> photos;

  /// Colecciones fotográficas BIM del SPDS (v0.10.0+).
  final List<PhotoCollection> photoCollections;

  /// Marcadores espaciales de fotos en planta (v0.10.1+).
  final List<PhotoMarkerEntity> photoMarkers;

  final DateTime createdAt;
  final DateTime updatedAt;

  Project({
    String? id,
    required this.title,
    this.bimCode,
    this.description = '',
    this.discipline = 'Arquitectura',
    this.author = '',
    Map<String, SpaceGeometry>? spaces,
    // Legacy support for constructor:
    List<Wall>? walls,
    List<Room>? rooms,
    List<Photo>? photos,
    List<ArchitecturalColumn>? columns,
    List<WallElevation>? wallElevations,
    List<PhotoCollection>? photoCollections,
    List<PhotoMarkerEntity>? photoMarkers,
    DateTime? createdAt,
    DateTime? updatedAt,
  })  : id = id ?? const Uuid().v4(),
        spaces = spaces ?? {
          'ground': SpaceGeometry(
            id: 'ground',
            name: 'Planta Baja',
            walls: walls ?? const [],
            rooms: rooms ?? const [],
            columns: columns ?? const [],
            wallElevations: wallElevations ?? const [],
          ),
        },
        photos = List.unmodifiable(photos ?? const []),
        photoCollections = List.unmodifiable(photoCollections ?? const []),
        photoMarkers = List.unmodifiable(photoMarkers ?? const []),
        createdAt = createdAt ?? DateTime.now(),
        updatedAt = updatedAt ?? DateTime.now();

  /// Genera una copia del proyecto con los campos indicados reemplazados.
  /// Actualiza [updatedAt] automáticamente si se modifican datos estructurales.
  Project copyWith({
    String? title,
    String? bimCode,
    String? description,
    String? discipline,
    String? author,
    Map<String, SpaceGeometry>? spaces,
    List<Photo>? photos,
    List<PhotoCollection>? photoCollections,
    List<PhotoMarkerEntity>? photoMarkers,
    // Legacy support for copyWith:
    List<Wall>? walls,
    List<Room>? rooms,
    List<ArchitecturalColumn>? columns,
    List<WallElevation>? wallElevations,
  }) {
    final Map<String, SpaceGeometry> nextSpaces = Map.from(spaces ?? this.spaces);
    if (walls != null || columns != null || wallElevations != null) {
      final ground = nextSpaces['ground'] ?? SpaceGeometry.empty('ground', 'Planta Baja');
      nextSpaces['ground'] = ground.copyWith(
        walls: walls,
        columns: columns,
        wallElevations: wallElevations,
      );
    }

    return Project(
      id: id,
      title: title ?? this.title,
      bimCode: bimCode ?? this.bimCode,
      description: description ?? this.description,
      discipline: discipline ?? this.discipline,
      author: author ?? this.author,
      spaces: nextSpaces,
      photos: photos ?? this.photos,
      photoCollections: photoCollections ?? this.photoCollections,
      photoMarkers: photoMarkers ?? this.photoMarkers,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }

  /// Actualiza o crea un espacio con nueva geometría.
  Project updateSpace(String spaceId, SpaceGeometry geometry) {
    final nextSpaces = Map<String, SpaceGeometry>.from(spaces);
    nextSpaces[spaceId] = geometry;
    return copyWith(spaces: nextSpaces);
  }
}

/// Representa la geometría y elementos contenidos en un espacio/nivel específico.
class SpaceGeometry {
  final String id;
  final String name;
  final List<Wall> walls;
  final List<ArchitecturalColumn> columns;
  final List<WallElevation> wallElevations;
  final List<Room> rooms;

  SpaceGeometry({
    required this.id,
    required this.name,
    List<Wall>? walls,
    List<ArchitecturalColumn>? columns,
    List<WallElevation>? wallElevations,
    List<Room>? rooms,
  })  : walls = List.unmodifiable(walls ?? const []),
        columns = List.unmodifiable(columns ?? const []),
        wallElevations = List.unmodifiable(wallElevations ?? const []),
        rooms = List.unmodifiable(rooms ?? const []);

  factory SpaceGeometry.empty(String id, String name) => SpaceGeometry(id: id, name: name);

  SpaceGeometry copyWith({
    String? name,
    List<Wall>? walls,
    List<ArchitecturalColumn>? columns,
    List<WallElevation>? wallElevations,
    List<Room>? rooms,
  }) {
    return SpaceGeometry(
      id: id,
      name: name ?? this.name,
      walls: walls ?? this.walls,
      columns: columns ?? this.columns,
      wallElevations: wallElevations ?? this.wallElevations,
      rooms: rooms ?? this.rooms,
    );
  }
}
