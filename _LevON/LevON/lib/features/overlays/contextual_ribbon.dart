import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/features/photos/ui/widgets/photo_viewer_dialog.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/core/utils/unit_service.dart';
import 'package:levon/core/utils/precision_service.dart';

/// Barra contextual dinámica posicionada en la parte superior del canvas.
/// Muestra información y controles distintos según el modo activo del editor.
/// Recibe [scale] (px/m) para mostrar información de zoom en modo vista.
class ContextualRibbon extends ConsumerWidget {
  final double scale;

  const ContextualRibbon({super.key, required this.scale});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(editorModeProvider);
    final viewMode = ref.watch(editorViewModeProvider);
    final subMode = ref.watch(drawSubModeProvider);
    final method = ref.watch(creationMethodProvider);
    final selected = ref.watch(selectedObjectProvider);
    final isMarkerPending = ref.watch(pendingMarkerPendingProvider);

    Widget content;

    switch (mode) {
      case EditorMode.view:
        content = _ViewRibbon(scale: scale);
      case EditorMode.draw:
        content = _CreationRibbon(subMode: subMode, method: method);
      case EditorMode.select:
        content = selected != null
            ? _SelectionRibbon(selected: selected)
            : _ViewRibbon(scale: scale);
      case EditorMode.delete:
        content = const _DeleteRibbon();
    }

    return Positioned(
      top: 8,
      left: 16,
      right: 16,
      child: Center(
        child: AnimatedSwitcher(
          duration: LevonDuration.fast,
          child: Container(
            key: ValueKey(
                'ribbon_${mode.name}_${viewMode.name}_${subMode.name}_${selected?.runtimeType}_$isMarkerPending'),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.95),
              borderRadius: BorderRadius.circular(LevonRadius.sm),
              boxShadow: LevonShadow.card,
              border: Border.all(color: LevonColors.divider),
            ),
            child: content,
          ),
        ),
      ),
    );
  }
}

// ─── MODO VISTA ──────────────────────────────────────────────────────────────

/// Muestra escala actual y nivel de zoom. Reemplaza los viejos contadores.
class _ViewRibbon extends StatelessWidget {
  final double scale;
  const _ViewRibbon({required this.scale});

  @override
  Widget build(BuildContext context) {
    final zoomPercent = (scale / 60.0 * 100).round(); // 60px/m = 100%
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.straighten,
            size: 14, color: LevonColors.textSecondary),
        const SizedBox(width: 5),
        Text(
          '${scale.toStringAsFixed(0)} px/m',
          style: const TextStyle(fontSize: 12, color: LevonColors.textPrimary),
        ),
        const SizedBox(width: 14),
        const Icon(Icons.zoom_in, size: 14, color: LevonColors.textSecondary),
        const SizedBox(width: 5),
        Text(
          '$zoomPercent%',
          style: const TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w600,
            color: LevonColors.textPrimary,
          ),
        ),
      ],
    );
  }
}

// ─── MODO CREACIÓN ───────────────────────────────────────────────────────────

/// Muestra los parámetros editables del elemento que se va a crear.
/// Los valores numéricos son ajustables con drag vertical.
class _CreationRibbon extends ConsumerWidget {
  final DrawSubMode subMode;
  final CreationMethod method;

  const _CreationRibbon({required this.subMode, required this.method});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(projectSettingsProvider);
    final notifier = ref.read(projectSettingsProvider.notifier);
    final unitSystem = settings.defaults.baseUnit;
    final precision = settings.precision.lengthPrecision;

    if (subMode == DrawSubMode.wall || subMode == DrawSubMode.partition) {
      final isPtToPt = method == CreationMethod.pointToPoint;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _RibbonDivider(),
          _NumericDragChip(
            label: 'Espesor',
            value: settings.defaults.wallThickness,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.05,
            max: 2.0,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(
                defaults: settings.defaults.copyWith(wallThickness: v),
              ),
            ),
          ),
          _NumericDragChip(
            label: 'Altura',
            value: settings.defaults.wallHeight,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.5,
            max: 20.0,
            step: PrecisionService.stepMeters(precision).clamp(0.001, 0.05),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(
                defaults: settings.defaults.copyWith(wallHeight: v),
              ),
            ),
          ),
          _RibbonChip(
            label: 'Modo',
            value: isPtToPt ? 'Punto a Punto' : 'Arrastre',
            isHighlighted: true,
          ),
        ],
      );
    }

    if (subMode == DrawSubMode.column) {
      final isCircular = method == CreationMethod.circular;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _RibbonDivider(),
          _RibbonChip(
            label: 'Tipo',
            value: isCircular ? 'Circular' : 'Rectangular',
            isHighlighted: true,
          ),
          _NumericDragChip(
            key: const ValueKey('col_dimX'),
            label: isCircular ? 'Diámetro' : 'Base X',
            value: settings.defaults.columnWidth,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.10,
            max: 5.0,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) {
              final s = ref.read(projectSettingsProvider);
              notifier.updateSettings(
                s.copyWith(defaults: s.defaults.copyWith(columnWidth: v)),
              );
            },
          ),
          if (!isCircular)
            _NumericDragChip(
              key: const ValueKey('col_dimY'),
              label: 'Base Y',
              value: settings.defaults.columnDepth,
              unitSystem: unitSystem,
              precision: precision,
              min: 0.10,
              max: 5.0,
              step: PrecisionService.stepMeters(precision),
              onChanged: (v) {
                final s = ref.read(projectSettingsProvider);
                notifier.updateSettings(
                  s.copyWith(defaults: s.defaults.copyWith(columnDepth: v)),
                );
              },
            ),
          _NumericDragChip(
            label: 'Altura',
            value: settings.defaults.wallHeight,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.5,
            max: 20.0,
            step: PrecisionService.stepMeters(precision).clamp(0.001, 0.05),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(
                defaults: settings.defaults.copyWith(wallHeight: v),
              ),
            ),
          ),
        ],
      );
    }

    if (subMode == DrawSubMode.door) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.door_front_door_outlined, size: 14, color: LevonColors.navy),
          const SizedBox(width: 6),
          _RibbonDivider(),
          _NumericDragChip(
            label: 'Ancho',
            value: settings.defaults.doorWidth,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.4,
            max: 3.0,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(defaults: settings.defaults.copyWith(doorWidth: v)),
            ),
          ),
          _NumericDragChip(
            label: 'Alto',
            value: settings.defaults.doorHeight,
            unitSystem: unitSystem,
            precision: precision,
            min: 1.5,
            max: 4.0,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(defaults: settings.defaults.copyWith(doorHeight: v)),
            ),
          ),
        ],
      );
    }

    if (subMode == DrawSubMode.window) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.window_outlined, size: 14, color: LevonColors.navy),
          const SizedBox(width: 6),
          _RibbonDivider(),
          _NumericDragChip(
            label: 'Ancho',
            value: settings.defaults.windowWidth,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.3,
            max: 5.0,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(defaults: settings.defaults.copyWith(windowWidth: v)),
            ),
          ),
          _NumericDragChip(
            label: 'Alto',
            value: settings.defaults.windowHeight,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.3,
            max: 3.5,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(defaults: settings.defaults.copyWith(windowHeight: v)),
            ),
          ),
          _NumericDragChip(
            label: 'Sill',
            value: settings.defaults.windowSillHeight,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.0,
            max: 2.5,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(defaults: settings.defaults.copyWith(windowSillHeight: v)),
            ),
          ),
        ],
      );
    }

    if (subMode == DrawSubMode.opening) {
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.crop_square_outlined, size: 14, color: LevonColors.navy),
          const SizedBox(width: 6),
          _RibbonDivider(),
          _NumericDragChip(
            label: 'Ancho',
            value: settings.defaults.openingWidth,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.3,
            max: 5.0,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(defaults: settings.defaults.copyWith(openingWidth: v)),
            ),
          ),
          _NumericDragChip(
            label: 'Alto',
            value: settings.defaults.openingHeight,
            unitSystem: unitSystem,
            precision: precision,
            min: 0.3,
            max: 4.0,
            step: PrecisionService.stepMeters(precision),
            onChanged: (v) => notifier.updateSettings(
              settings.copyWith(defaults: settings.defaults.copyWith(openingHeight: v)),
            ),
          ),
        ],
      );
    }

    if (subMode == DrawSubMode.photo) {
      final isPending = ref.watch(pendingMarkerPendingProvider);
      return isPending ? const _PendingMarkerRibbon() : const _PhotoInsertRibbon();
    }

    return const SizedBox.shrink();
  }
}

// ─── PHOTO INSERT RIBBON ─────────────────────────────────────────────────────

class _PhotoInsertRibbon extends ConsumerWidget {
  const _PhotoInsertRibbon();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final collections = ref.watch(photoCollectionsProvider);
    final selectedId = ref.watch(selectedPhotoCollectionIdProvider);
    final source = ref.watch(photoInsertSourceProvider);

    if (collections.isEmpty) {
      return const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.add_a_photo_outlined, size: 14, color: LevonColors.textSecondary),
          SizedBox(width: 6),
          Text(
            'Sin colecciones — créa una desde el Workspace',
            style: TextStyle(fontSize: 12, color: LevonColors.textSecondary),
          ),
        ],
      );
    }

    final active = collections.where((c) => c.id == selectedId).firstOrNull ??
        collections.first;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.add_a_photo_outlined, size: 14, color: LevonColors.navy),
        const SizedBox(width: 6),
        _RibbonDivider(),
        // Collection selector
        GestureDetector(
          onTap: () async {
            final picked = await showMenu<PhotoCollection>(
              context: context,
              position: RelativeRect.fromLTRB(
                  MediaQuery.of(context).size.width / 2 - 80, 60, 0, 0),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(LevonRadius.sm)),
              items: [
                for (final c in collections)
                  PopupMenuItem(
                    value: c,
                    child: Text(
                      '${c.bimCode} · ${c.name}',
                      style: TextStyle(
                        fontWeight: c.id == active.id
                            ? FontWeight.bold
                            : FontWeight.normal,
                        color: c.id == active.id
                            ? LevonColors.navy
                            : LevonColors.textPrimary,
                      ),
                    ),
                  ),
              ],
            );
            if (picked != null) {
              ref.read(selectedPhotoCollectionIdProvider.notifier).state =
                  picked.id;
            }
          },
          child: Container(
            margin: const EdgeInsets.only(right: 8),
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: LevonColors.surface2,
              borderRadius: BorderRadius.circular(LevonRadius.xs),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Colección: ',
                    style: TextStyle(
                        fontSize: 11,
                        color: LevonColors.textSecondary)),
                Text(
                  active.name,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: LevonColors.navy),
                ),
                const SizedBox(width: 4),
                const Icon(Icons.arrow_drop_down,
                    size: 14, color: LevonColors.navy),
              ],
            ),
          ),
        ),
        _RibbonDivider(),
        Icon(
          source == 'camera'
              ? Icons.camera_alt_outlined
              : Icons.photo_library_outlined,
          size: 13,
          color: LevonColors.textSecondary,
        ),
        const SizedBox(width: 4),
        Text(
          source == 'camera' ? 'Cámara' : 'Galería',
          style: const TextStyle(
              fontSize: 11, color: LevonColors.textSecondary),
        ),
        const SizedBox(width: 10),
        const Text(
          '· Toca la planta para colocar',
          style: TextStyle(fontSize: 10, color: LevonColors.textDisabled),
        ),
      ],
    );
  }
}

// ─── PENDING MARKER RIBBON ───────────────────────────────────────────────────

/// Ribbon shown while a captured photo is awaiting spatial placement confirmation.
/// Lets the user set the camera azimuth before committing.
class _PendingMarkerRibbon extends ConsumerWidget {
  const _PendingMarkerRibbon();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final az = ref.watch(pendingMarkerOrientationProvider);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        const Icon(Icons.add_a_photo_outlined,
            size: 14, color: LevonColors.okGreen),
        const SizedBox(width: 6),
        _RibbonDivider(),
        _AzimuthChip(
          value: az,
          onChanged: (v) =>
              ref.read(pendingMarkerOrientationProvider.notifier).state = v,
        ),
        const SizedBox(width: 8),
        _RibbonDivider(),
        const Icon(Icons.touch_app_outlined,
            size: 12, color: LevonColors.textSecondary),
        const SizedBox(width: 4),
        const Text(
          'Toca para confirmar',
          style: TextStyle(fontSize: 11, color: LevonColors.textSecondary),
        ),
        const SizedBox(width: 4),
        const Text(
          '· mantén para cancelar',
          style: TextStyle(fontSize: 10, color: LevonColors.textDisabled),
        ),
      ],
    );
  }
}

// ─── AZIMUTH CHIP ─────────────────────────────────────────────────────────────

/// Drag horizontally to change camera azimuth (0–360°). 2°/px sensitivity.
class _AzimuthChip extends StatefulWidget {
  final double value;
  final ValueChanged<double> onChanged;

  const _AzimuthChip({required this.value, required this.onChanged});

  @override
  State<_AzimuthChip> createState() => _AzimuthChipState();
}

class _AzimuthChipState extends State<_AzimuthChip> {
  double _dragStartX = 0;
  double _valueAtDragStart = 0;

  static String _formatAz(double az) {
    final v = az % 360;
    if (v < 22.5 || v >= 337.5) return 'N ${v.round()}°';
    if (v < 67.5) return 'NE ${v.round()}°';
    if (v < 112.5) return 'E ${v.round()}°';
    if (v < 157.5) return 'SE ${v.round()}°';
    if (v < 202.5) return 'S ${v.round()}°';
    if (v < 247.5) return 'SO ${v.round()}°';
    if (v < 292.5) return 'O ${v.round()}°';
    return 'NO ${v.round()}°';
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onHorizontalDragStart: (d) {
        _dragStartX = d.globalPosition.dx;
        _valueAtDragStart = widget.value;
      },
      onHorizontalDragUpdate: (d) {
        final delta = (d.globalPosition.dx - _dragStartX) * 2.0;
        widget.onChanged((_valueAtDragStart + delta) % 360);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: LevonColors.surface2,
          borderRadius: BorderRadius.circular(LevonRadius.xs),
          border: Border.all(color: LevonColors.navy.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.explore_outlined, size: 11, color: LevonColors.navy),
            const SizedBox(width: 4),
            Text(
              _formatAz(widget.value),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: LevonColors.navy,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.drag_indicator,
                size: 11, color: LevonColors.textDisabled),
          ],
        ),
      ),
    );
  }
}

// ─── MODO SELECCIÓN ──────────────────────────────────────────────────────────

/// Muestra propiedades resumidas del elemento seleccionado.
/// El panel completo se abre con long press sobre el elemento.
class _SelectionRibbon extends ConsumerWidget {
  final Object selected;
  const _SelectionRibbon({required this.selected});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(projectSettingsProvider);
    final unit = settings.defaults.baseUnit;
    final precision = settings.precision.lengthPrecision;

    if (selected is Wall) {
      final wall = selected as Wall;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.horizontal_rule, size: 16, color: LevonColors.navy),
          const SizedBox(width: 6),
          Text(
            wall.isStructural ? 'Muro' : 'Partición',
            style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: LevonColors.navy,
                fontSize: 13),
          ),
          _RibbonDivider(),
          _RibbonChip(
              label: 'Largo',
              value: UnitFormatter.length(wall.length, unit,
                  precision: precision)),
          _RibbonChip(
              label: 'Espesor',
              value: UnitFormatter.length(wall.thickness, unit,
                  precision: precision)),
        ],
      );
    }
    if (selected is Room) {
      final room = selected as Room;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.meeting_room_outlined,
              size: 16, color: LevonColors.navy),
          const SizedBox(width: 6),
          Text(room.name,
              style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: LevonColors.navy,
                  fontSize: 13)),
          _RibbonDivider(),
          _RibbonChip(
              label: 'Área',
              value: UnitFormatter.area(room.area, unit,
                  decimals: settings.precision.areaPrecision)),
        ],
      );
    }
    if (selected is ArchitecturalColumn) {
      final col = selected as ArchitecturalColumn;
      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.architecture, size: 16, color: LevonColors.navy),
          const SizedBox(width: 6),
          Text(
            col.isCircular ? 'Columna Circular' : 'Columna Rect.',
            style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: LevonColors.navy,
                fontSize: 13),
          ),
          _RibbonDivider(),
          if (col.isCircular)
            _RibbonChip(
                label: 'Ø',
                value:
                    UnitFormatter.length(col.width, unit, precision: precision))
          else
            _RibbonChip(
              label: 'B×H',
              value:
                  '${UnitFormatter.rawLength(col.width, unit, precision: precision)}×${UnitFormatter.rawLength(col.depth, unit, precision: precision)} ${UnitFormatter.unitLabel(unit)}',
            ),
          Text(
            '  Long press → propiedades',
            style: TextStyle(
                fontSize: 10,
                color: LevonColors.textSecondary.withValues(alpha: 0.7)),
          ),
        ],
      );
    }
    if (selected is WallOpening) {
      final opening = selected as WallOpening;
      final elevations = ref.watch(wallElevationsProvider);
      const uc = EditWallElevationUseCase();

      // Find the elevation containing this opening (works in both plan and elevation mode)
      final elevation = elevations.where(
        (e) => e.openings.any((o) => o.id == opening.id),
      ).firstOrNull;
      if (elevation == null) return const SizedBox.shrink();

      final walls = ref.watch(wallsProvider);
      final wall = walls.where((w) => w.id == elevation.wallId).firstOrNull;
      if (wall == null) return const SizedBox.shrink();

      final activeWallId = ref.watch(activeElevationWallIdProvider);
      final isElevationMode = activeWallId != null;

      void update(WallOpening updated) {
        ref.read(wallElevationsProvider.notifier).upsertElevation(
              uc.updateOpening(elevation, updated),
            );
        ref.read(selectedObjectProvider.notifier).state = updated;
      }

      final label = switch (opening.type) {
        OpeningType.door => 'Puerta',
        OpeningType.window => 'Ventana',
        OpeningType.opening => 'Hueco',
      };

      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            opening.type == OpeningType.door
                ? Icons.door_front_door_outlined
                : opening.type == OpeningType.window
                    ? Icons.window_outlined
                    : Icons.crop_square_outlined,
            size: 16,
            color: LevonColors.navy,
          ),
          const SizedBox(width: 6),
          Text(label,
              style: const TextStyle(
                  fontWeight: FontWeight.bold,
                  color: LevonColors.navy,
                  fontSize: 13)),
          _RibbonDivider(),
          if (isElevationMode) ...[
            _NumericDragChip(
              label: 'Ancho',
              value: opening.width,
              unitSystem: unit,
              precision: precision,
              min: 0.1,
              max: wall.length - opening.xOffset,
              step: 0.01,
              onChanged: (v) => update(opening.copyWith(width: v)),
            ),
            _NumericDragChip(
              label: 'Alto',
              value: opening.height,
              unitSystem: unit,
              precision: precision,
              min: 0.1,
              max: elevation.levels.coronacion - opening.sillHeight,
              step: 0.01,
              onChanged: (v) => update(opening.copyWith(height: v)),
            ),
            _NumericDragChip(
              label: 'Sill',
              value: opening.sillHeight,
              unitSystem: unit,
              precision: precision,
              min: 0.0,
              max: elevation.levels.coronacion - opening.height,
              step: 0.01,
              onChanged: (v) => update(opening.copyWith(sillHeight: v)),
            ),
          ] else ...[
            _RibbonChip(
              label: 'Ancho',
              value: UnitFormatter.length(opening.width, unit, precision: precision),
            ),
            _RibbonChip(
              label: 'Alto',
              value: UnitFormatter.length(opening.height, unit, precision: precision),
            ),
            if (opening.sillHeight > 0)
              _RibbonChip(
                label: 'Sill',
                value: UnitFormatter.length(opening.sillHeight, unit, precision: precision),
              ),
          ],
          if (opening.type == OpeningType.door) ...[
            _RibbonDivider(),
            SizedBox(
              width: 28,
              height: 28,
              child: IconButton(
                padding: EdgeInsets.zero,
                tooltip: 'Girar sentido de apertura',
                icon: const Icon(Icons.flip, size: 16, color: LevonColors.navy),
                onPressed: () => update(opening.copyWith(isFlipped: !opening.isFlipped)),
              ),
            ),
          ],
        ],
      );
    }
    if (selected is PhotoMarkerEntity) {
      final marker = selected as PhotoMarkerEntity;
      final collections = ref.watch(photoCollectionsProvider);
      final photo = collections
          .where((c) => c.id == marker.collectionId)
          .firstOrNull
          ?.photos
          .where((p) => p.id == marker.linkedPhotoId)
          .firstOrNull;

      return Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.add_a_photo_outlined,
              size: 16, color: LevonColors.navy),
          const SizedBox(width: 6),
          Text(
            photo?.bimCode ?? 'Marcador',
            style: const TextStyle(
                fontWeight: FontWeight.bold,
                color: LevonColors.navy,
                fontSize: 13),
          ),
          _RibbonDivider(),
          _RibbonChip(
            label: 'Orientación',
            value: '${marker.orientation.toStringAsFixed(0)}°',
          ),
          _RibbonChip(
            label: 'Cono',
            value: '${marker.cameraCone.angle.toStringAsFixed(0)}°',
          ),
          _RibbonDivider(),
          if (photo != null)
            Builder(
              builder: (ctx) => InkWell(
                onTap: () => showPhotoViewerDialog(ctx, photo),
                borderRadius: BorderRadius.circular(LevonRadius.xs),
                child: const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.visibility_outlined,
                          size: 13, color: LevonColors.navy),
                      SizedBox(width: 4),
                      Text(
                        'Ver foto',
                        style: TextStyle(
                            fontSize: 12,
                            color: LevonColors.navy,
                            fontWeight: FontWeight.w600),
                      ),
                    ],
                  ),
                ),
              ),
            )
          else
            Text(
              'Long press → propiedades',
              style: TextStyle(
                  fontSize: 10,
                  color: LevonColors.textSecondary.withValues(alpha: 0.7)),
            ),
        ],
      );
    }
    return const SizedBox.shrink();
  }
}

// ─── MODO ELIMINAR ───────────────────────────────────────────────────────────

class _DeleteRibbon extends StatelessWidget {
  const _DeleteRibbon();

  @override
  Widget build(BuildContext context) {
    return const Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.delete_sweep_outlined,
            size: 16, color: LevonColors.errorRed),
        SizedBox(width: 8),
        Text(
          'Toca un elemento para eliminarlo',
          style: TextStyle(
            fontSize: 13,
            color: LevonColors.errorRed,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

// ─── WIDGET: ALERTA DE VALIDACIÓN FLOTANTE ────────────────────────────────────

/// Badge flotante de alertas de validación. Independiente del ribbon.
/// Coloca encima del canvas (top-right) para no interferir con el ribbon central.
class ValidationAlertBadge extends ConsumerWidget {
  const ValidationAlertBadge({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final issues = ref.watch(validationProvider);
    if (issues.isEmpty) return const SizedBox.shrink();

    return Positioned(
      key: const Key('validation_alert_badge'),
      top: 58,
      right: 16,
      child: GestureDetector(
        onTap: () => _showIssues(context, issues),
        child: Container(
          key: const Key('validation_badge_container'),
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            color: LevonColors.warnOrange,
            borderRadius: BorderRadius.circular(LevonRadius.pill),
            boxShadow: LevonShadow.card,
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.warning_amber_rounded,
                  size: 14, color: Colors.white),
              const SizedBox(width: 4),
              Text(
                '${issues.length}',
                style: const TextStyle(
                    fontSize: 12,
                    color: Colors.white,
                    fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showIssues(BuildContext context, List issues) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Alertas de validación'),
        content: SizedBox(
          width: 320,
          child: ListView.separated(
            shrinkWrap: true,
            itemCount: issues.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, i) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(issues[i].toString(),
                  style: const TextStyle(fontSize: 13)),
            ),
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cerrar')),
        ],
      ),
    );
  }
}

// ─── HELPERS ────────────────────────────────────────────────────────────────

class _RibbonDivider extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      child: Container(width: 1, height: 20, color: LevonColors.divider),
    );
  }
}

/// Chip de solo lectura para mostrar un par label: valor.
class _RibbonChip extends StatelessWidget {
  final String label;
  final String value;
  final bool isHighlighted;

  const _RibbonChip({
    required this.label,
    required this.value,
    this.isHighlighted = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 12),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text('$label: ',
              style: const TextStyle(
                  fontSize: 11, color: LevonColors.textSecondary)),
          Text(
            value,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: isHighlighted ? LevonColors.navy : LevonColors.textPrimary,
            ),
          ),
        ],
      ),
    );
  }
}

/// Chip numérico editable por teclado o drag vertical (tipo CAD).
/// Tap: abre TextField inline. Long press + drag: ajuste rápido.
/// [value], [min], [max] y [step] están SIEMPRE en metros (world-space interno).
/// La conversión a [unitSystem] / [precision] ocurre solo en display e input.
class _NumericDragChip extends StatefulWidget {
  final String label;
  final double value;
  final UnitSystem unitSystem;
  final LengthPrecision precision;
  final double min;
  final double max;
  final double step; // incremento por pixel de drag, en metros
  final void Function(double) onChanged; // recibe metros

  const _NumericDragChip({
    super.key,
    required this.label,
    required this.value,
    required this.unitSystem,
    required this.precision,
    required this.min,
    required this.max,
    required this.step,
    required this.onChanged,
  });

  @override
  State<_NumericDragChip> createState() => _NumericDragChipState();
}

class _NumericDragChipState extends State<_NumericDragChip> {
  bool _editing = false;
  bool _dragging = false;
  double _dragStartY = 0;
  double _dragStartValue = 0;
  late TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(
      text: UnitFormatter.rawLength(widget.value, widget.unitSystem,
          precision: widget.precision),
    );
  }

  @override
  void didUpdateWidget(_NumericDragChip old) {
    super.didUpdateWidget(old);
    if (!_editing && !_dragging) {
      _ctrl.text = UnitFormatter.rawLength(widget.value, widget.unitSystem,
          precision: widget.precision);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _commit() {
    // El usuario escribe en unidades de display; convertir a metros antes de guardar.
    final displayVal = double.tryParse(_ctrl.text);
    if (displayVal != null) {
      final meters = UnitConverter.toMeters(displayVal, widget.unitSystem);
      widget.onChanged(meters.clamp(widget.min, widget.max));
    }
    setState(() => _editing = false);
  }

  void _onLongPressStart(LongPressStartDetails d) {
    setState(() {
      _dragging = true;
      _dragStartY = d.globalPosition.dy;
      _dragStartValue = widget.value;
    });
    HapticFeedback.selectionClick();
  }

  void _onLongPressMoveUpdate(LongPressMoveUpdateDetails d) {
    final deltaY = _dragStartY - d.globalPosition.dy; // arriba = positivo
    final newVal =
        (_dragStartValue + deltaY * widget.step).clamp(widget.min, widget.max);
    // Redondear al paso de precisión — evita flotantes sucios sin perder mm.
    widget.onChanged(PrecisionService.roundToStep(newVal, widget.precision));
  }

  void _onLongPressEnd(LongPressEndDetails d) {
    setState(() => _dragging = false);
    HapticFeedback.lightImpact();
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => setState(() {
        _editing = true;
        _ctrl.text = UnitFormatter.rawLength(widget.value, widget.unitSystem,
            precision: widget.precision);
      }),
      onLongPressStart: _onLongPressStart,
      onLongPressMoveUpdate: _onLongPressMoveUpdate,
      onLongPressEnd: _onLongPressEnd,
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: _dragging
              ? LevonColors.navy.withValues(alpha: 0.12)
              : LevonColors.surface2,
          borderRadius: BorderRadius.circular(LevonRadius.xs),
          border: Border.all(
            color:
                _editing || _dragging ? LevonColors.navy : Colors.transparent,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('${widget.label}: ',
                style: const TextStyle(
                    fontSize: 11, color: LevonColors.textSecondary)),
            if (_editing)
              SizedBox(
                width: 48,
                child: TextField(
                  controller: _ctrl,
                  autofocus: true,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  style: const TextStyle(fontSize: 12, color: LevonColors.navy),
                  decoration: const InputDecoration(
                    isDense: true,
                    contentPadding:
                        EdgeInsets.symmetric(horizontal: 2, vertical: 0),
                    border: InputBorder.none,
                  ),
                  onSubmitted: (_) => _commit(),
                  onTapOutside: (_) => _commit(),
                ),
              )
            else
              Text(
                UnitFormatter.length(widget.value, widget.unitSystem,
                    precision: widget.precision),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: _dragging ? LevonColors.navy : LevonColors.textPrimary,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
