import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Sistema de unidades utilizado para mostrar y exportar medidas.
///
/// El sistema interno siempre trabaja en metros (world-space).
/// Esta configuración solo afecta la visualización de cotas y la exportación.
enum UnitSystem { mm, cm, m, inch, foot }

/// Nivel de precisión de longitud: controla decimales en display, ribbons,
/// labels de canvas y tolerancia de snap geométrico.
///
/// Los valores representan el paso mínimo en metros.
enum LengthPrecision {
  m1,    // 1.000 m — topografía / planeamiento urbano
  mm100, // 0.100 m = 10 cm — anteproyecto de referencia
  mm10,  // 0.010 m = 1 cm  — construcción estándar
  mm1,   // 0.001 m = 1 mm  — detalle BIM (default)
}

// ─── SUBCATEGORÍAS DE CONFIGURACIÓN ──────────────────────────────────────────

/// Metadatos básicos identificativos del proyecto.
class ProjectInfo {
  final String projectName;
  const ProjectInfo({this.projectName = 'Proyecto sin título'});

  ProjectInfo copyWith({String? projectName}) {
    return ProjectInfo(projectName: projectName ?? this.projectName);
  }
}

/// Configuración del sistema de snap (imán) del editor.
///
/// DISTINCIÓN IMPORTANTE entre dos tolerancias:
///   [snapRadius] / [snapSensitivity]: tolerancia VISUAL en píxeles, usada por el
///     canvas para decidir si un toque del usuario "activa" el snap visual.
///   [geometricSnapTolerance]: tolerancia en METROS en world-space, usada por
///     [TopologyGraph] para fusionar nodos que están muy próximos entre sí.
///
/// Ambas tolerancias deben ser consistentes: si el usuario ve el snap activado
/// visualmente, también debe ocurrir la fusión geométrica.
class SnapSettings {
  final bool snapToNodes;
  final bool snapToLines;
  final bool snapToIntersections;
  final bool snapToGrid;
  final bool angleSnapping;
  final bool snapToNMS; // Solo elevación: Niveles de muro
  final bool snapToOpenings; // Solo elevación: Huecos existentes
  final double snapSensitivity; // px
  final double snapRadius; // px
  /// Paso del snap angular en grados. Opciones: 10, 15, 30, 45, 60, 90.
  final int snapAngleStepDegrees;

  /// Tolerancia de fusión geométrica de nodos en metros (world-space).
  /// Distinto de [snapRadius] que es tolerancia visual en píxeles.
  /// Dos nodos a distancia < [geometricSnapTolerance] se fusionan en el grafo.
  final double geometricSnapTolerance;

  const SnapSettings({
    this.snapToNodes = true,
    this.snapToLines = true,
    this.snapToIntersections = true,
    this.snapToGrid = true,
    this.angleSnapping = false,
    this.snapToNMS = true,
    this.snapToOpenings = true,
    this.snapSensitivity = 24.0,
    this.snapRadius = 24.0,
    this.snapAngleStepDegrees = 45,
    this.geometricSnapTolerance = 0.005,
  });

  SnapSettings copyWith({
    bool? snapToNodes,
    bool? snapToLines,
    bool? snapToIntersections,
    bool? snapToGrid,
    bool? angleSnapping,
    bool? snapToNMS,
    bool? snapToOpenings,
    double? snapSensitivity,
    double? snapRadius,
    int? snapAngleStepDegrees,
    double? geometricSnapTolerance,
  }) {
    return SnapSettings(
      snapToNodes: snapToNodes ?? this.snapToNodes,
      snapToLines: snapToLines ?? this.snapToLines,
      snapToIntersections: snapToIntersections ?? this.snapToIntersections,
      snapToGrid: snapToGrid ?? this.snapToGrid,
      angleSnapping: angleSnapping ?? this.angleSnapping,
      snapToNMS: snapToNMS ?? this.snapToNMS,
      snapToOpenings: snapToOpenings ?? this.snapToOpenings,
      snapSensitivity: snapSensitivity ?? this.snapSensitivity,
      snapRadius: snapRadius ?? this.snapRadius,
      snapAngleStepDegrees: snapAngleStepDegrees ?? this.snapAngleStepDegrees,
      geometricSnapTolerance:
          geometricSnapTolerance ?? this.geometricSnapTolerance,
    );
  }
}

/// Configuración de la cuadrícula del canvas.
///
/// La cuadrícula es solo visual: no afecta la geometría ni el snap geométrico.
/// El snap a la cuadrícula se controla independientemente en [SnapSettings.snapToGrid].
class GridSettings {
  final bool showGrid;
  final double gridSize;
  final bool visibleByZoom;

  const GridSettings({
    this.showGrid = true,
    this.gridSize = 0.25,
    this.visibleByZoom = true,
  });

  GridSettings copyWith({
    bool? showGrid,
    double? gridSize,
    bool? visibleByZoom,
  }) {
    return GridSettings(
      showGrid: showGrid ?? this.showGrid,
      gridSize: gridSize ?? this.gridSize,
      visibleByZoom: visibleByZoom ?? this.visibleByZoom,
    );
  }
}

/// Valores por defecto que se usan al crear nuevos elementos BIM.
///
/// Evitan que el usuario deba introducir los parámetros más comunes
/// (espesor de muro, altura de piso) en cada operación de dibujo.
class DefaultParameters {
  final double wallThickness;
  final double wallHeight;
  final double columnWidth;
  final double columnDepth;
  final UnitSystem baseUnit;

  // Dimensiones por defecto de openings — editables desde el ribbon de creación.
  final double doorWidth;
  final double doorHeight;
  final double windowWidth;
  final double windowHeight;
  final double windowSillHeight;
  final double openingWidth;
  final double openingHeight;
  final double openingSillHeight;

  const DefaultParameters({
    this.wallThickness = 0.15,
    this.wallHeight = 2.80,
    this.columnWidth = 0.30,
    this.columnDepth = 0.30,
    this.baseUnit = UnitSystem.m,
    this.doorWidth = 0.90,
    this.doorHeight = 2.10,
    this.windowWidth = 1.00,
    this.windowHeight = 1.20,
    this.windowSillHeight = 0.90,
    this.openingWidth = 0.80,
    this.openingHeight = 2.10,
    this.openingSillHeight = 0.00,
  });

  DefaultParameters copyWith({
    double? wallThickness,
    double? wallHeight,
    double? columnWidth,
    double? columnDepth,
    UnitSystem? baseUnit,
    double? doorWidth,
    double? doorHeight,
    double? windowWidth,
    double? windowHeight,
    double? windowSillHeight,
    double? openingWidth,
    double? openingHeight,
    double? openingSillHeight,
  }) {
    return DefaultParameters(
      wallThickness: wallThickness ?? this.wallThickness,
      wallHeight: wallHeight ?? this.wallHeight,
      columnWidth: columnWidth ?? this.columnWidth,
      columnDepth: columnDepth ?? this.columnDepth,
      baseUnit: baseUnit ?? this.baseUnit,
      doorWidth: doorWidth ?? this.doorWidth,
      doorHeight: doorHeight ?? this.doorHeight,
      windowWidth: windowWidth ?? this.windowWidth,
      windowHeight: windowHeight ?? this.windowHeight,
      windowSillHeight: windowSillHeight ?? this.windowSillHeight,
      openingWidth: openingWidth ?? this.openingWidth,
      openingHeight: openingHeight ?? this.openingHeight,
      openingSillHeight: openingSillHeight ?? this.openingSillHeight,
    );
  }
}

/// Configuración de la representación visual del canvas.
///
/// Controla qué elementos se muestran y cómo (etiquetas, nodos, habitaciones,
/// escala anotativa). No afecta la geometría almacenada.
class VisualizationSettings {
  final bool showLengthLabels;
  final bool showNodes;
  final bool showRooms;
  final bool darkMode;
  final double lineThicknessMultiplier;
  final bool annotativeScaling;

  const VisualizationSettings({
    this.showLengthLabels = true,
    this.showNodes = true,
    this.showRooms = true,
    this.darkMode = false,
    this.lineThicknessMultiplier = 1.0,
    this.annotativeScaling = true,
  });

  VisualizationSettings copyWith({
    bool? showLengthLabels,
    bool? showNodes,
    bool? showRooms,
    bool? darkMode,
    double? lineThicknessMultiplier,
    bool? annotativeScaling,
  }) {
    return VisualizationSettings(
      showLengthLabels: showLengthLabels ?? this.showLengthLabels,
      showNodes: showNodes ?? this.showNodes,
      showRooms: showRooms ?? this.showRooms,
      darkMode: darkMode ?? this.darkMode,
      lineThicknessMultiplier:
          lineThicknessMultiplier ?? this.lineThicknessMultiplier,
      annotativeScaling: annotativeScaling ?? this.annotativeScaling,
    );
  }
}

/// Configuración del comportamiento interactivo del editor.
///
/// Controla funcionalidades como la lupa de dibujo, la previsualización
/// de muros en tiempo real y la confirmación antes de eliminar.
class EditorBehaviorSettings {
  final bool showDrawingPreview;
  final bool magnifierEnabled;
  final bool autoRoomDetection;
  final bool deleteConfirmation;

  const EditorBehaviorSettings({
    this.showDrawingPreview = true,
    this.magnifierEnabled = true,
    this.autoRoomDetection = true,
    this.deleteConfirmation = true,
  });

  EditorBehaviorSettings copyWith({
    bool? showDrawingPreview,
    bool? magnifierEnabled,
    bool? autoRoomDetection,
    bool? deleteConfirmation,
  }) {
    return EditorBehaviorSettings(
      showDrawingPreview: showDrawingPreview ?? this.showDrawingPreview,
      magnifierEnabled: magnifierEnabled ?? this.magnifierEnabled,
      autoRoomDetection: autoRoomDetection ?? this.autoRoomDetection,
      deleteConfirmation: deleteConfirmation ?? this.deleteConfirmation,
    );
  }
}

/// Configuración de precisión numérica del proyecto.
///
/// Controla decimales en display, ribbons y labels (vía [PrecisionService]),
/// tolerancia de snap geométrico derivada de [lengthPrecision],
/// y cantidad de decimales en exportación DXF/IFC.
///
/// IMPORTANTE: cambiar precisión NUNCA modifica geometría ni coordenadas.
/// Solo afecta la capa de representación visual y exportación.
class PrecisionSettings {
  /// Precisión de longitud — determina decimales y snap visual.
  final LengthPrecision lengthPrecision;

  /// Decimales para áreas (m² / ft²). Default: 2.
  final int areaPrecision;

  /// Decimales para coordenadas en DXF/IFC. Default: 4 (≈ 0.1 mm).
  final int exportPrecision;

  const PrecisionSettings({
    this.lengthPrecision = LengthPrecision.mm1,
    this.areaPrecision = 2,
    this.exportPrecision = 4,
  });

  PrecisionSettings copyWith({
    LengthPrecision? lengthPrecision,
    int? areaPrecision,
    int? exportPrecision,
  }) {
    return PrecisionSettings(
      lengthPrecision: lengthPrecision ?? this.lengthPrecision,
      areaPrecision: areaPrecision ?? this.areaPrecision,
      exportPrecision: exportPrecision ?? this.exportPrecision,
    );
  }
}

/// Configuración de rutas de almacenamiento por proyecto y global.
///
/// Permite al usuario definir carpetas por defecto para exportación
/// y guardado de proyectos. Null indica que se usa el directorio del sistema.
class StorageSettings {
  /// Carpeta por defecto para archivos exportados (DXF, IFC, .levon).
  final String? defaultExportPath;

  /// Carpeta por defecto para proyectos editables (.levon internos).
  final String? defaultProjectPath;

  const StorageSettings({
    this.defaultExportPath,
    this.defaultProjectPath,
  });

  StorageSettings copyWith({
    String? defaultExportPath,
    String? defaultProjectPath,
    // Permite borrar una ruta pasando explícitamente null via clearExportPath
    bool clearExportPath = false,
    bool clearProjectPath = false,
  }) {
    return StorageSettings(
      defaultExportPath: clearExportPath
          ? null
          : (defaultExportPath ?? this.defaultExportPath),
      defaultProjectPath: clearProjectPath
          ? null
          : (defaultProjectPath ?? this.defaultProjectPath),
    );
  }
}

// ─── ESTADO GLOBAL ──────────────────────────────────────────────────────────

class ProjectSettings {
  final ProjectInfo info;
  final SnapSettings snap;
  final GridSettings grid;
  final DefaultParameters defaults;
  final VisualizationSettings visual;
  final EditorBehaviorSettings behavior;
  final StorageSettings storage;

  /// Precisión numérica: display decimals, snap tolerance, export decimals.
  final PrecisionSettings precision;

  const ProjectSettings({
    this.info = const ProjectInfo(),
    this.snap = const SnapSettings(),
    this.grid = const GridSettings(),
    this.defaults = const DefaultParameters(),
    this.visual = const VisualizationSettings(),
    this.behavior = const EditorBehaviorSettings(),
    this.storage = const StorageSettings(),
    this.precision = const PrecisionSettings(),
  });

  ProjectSettings copyWith({
    ProjectInfo? info,
    SnapSettings? snap,
    GridSettings? grid,
    DefaultParameters? defaults,
    VisualizationSettings? visual,
    EditorBehaviorSettings? behavior,
    StorageSettings? storage,
    PrecisionSettings? precision,
  }) {
    return ProjectSettings(
      info: info ?? this.info,
      snap: snap ?? this.snap,
      grid: grid ?? this.grid,
      defaults: defaults ?? this.defaults,
      visual: visual ?? this.visual,
      behavior: behavior ?? this.behavior,
      storage: storage ?? this.storage,
      precision: precision ?? this.precision,
    );
  }
}

/// Notifier que gestiona el estado reactivo de [ProjectSettings] vía Riverpod.
///
/// Los componentes de UI que necesiten leer o modificar la configuración
/// deben hacerlo a través de [projectSettingsProvider] para garantizar que
/// los cambios se propaguen automáticamente a todos los consumidores.
class ProjectSettingsNotifier extends StateNotifier<ProjectSettings> {
  ProjectSettingsNotifier() : super(const ProjectSettings());

  void updateSettings(ProjectSettings newSettings) {
    state = newSettings;
  }

  void reset() {
    state = const ProjectSettings();
  }
}

final projectSettingsProvider =
    StateNotifierProvider<ProjectSettingsNotifier, ProjectSettings>(
  (ref) => ProjectSettingsNotifier(),
);
