import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/features/photos/ui/widgets/photo_viewer_dialog.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/shared/state/history_notifier.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/core/utils/unit_service.dart';

/// Panel de propiedades compartido entre mobile (bottom sheet) y desktop (side panel).
/// Aplica padding extra cuando el teclado está visible para que los campos
/// no queden tapados.
class PropertiesPanel extends ConsumerWidget {
  final Object selected;
  final ScrollController? scrollController;

  const PropertiesPanel({
    super.key,
    required this.selected,
    this.scrollController,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final keyboardBottom = MediaQuery.viewInsetsOf(context).bottom;

    return ListView(
      key: const Key('properties_panel_list'),
      controller: scrollController,
      padding: EdgeInsets.fromLTRB(16, 8, 16, 32 + keyboardBottom),
      children: [
        if (selected is Wall)
          _WallProperties(key: const Key('seccion_muro'), wall: selected as Wall),
        if (selected is Room)
          _RoomProperties(key: const Key('seccion_habitacion'), room: selected as Room),
        if (selected is ArchitecturalColumn)
          _ColumnProperties(key: const Key('seccion_columna'), col: selected as ArchitecturalColumn),
        if (selected is WallOpening)
          _WallOpeningProperties(key: const Key('seccion_opening'), opening: selected as WallOpening),
        if (selected is PhotoMarkerEntity)
          _PhotoMarkerProperties(key: const Key('seccion_marker'), marker: selected as PhotoMarkerEntity),
      ],
    );
  }
}

// ─── WALL PROPERTIES ─────────────────────────────────────────────────────────

class _WallProperties extends ConsumerWidget {
  final Wall wall;
  const _WallProperties({super.key, required this.wall});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(projectSettingsProvider);
    final unit = settings.defaults.baseUnit;
    final precision = settings.precision.lengthPrecision;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _PropHeader(
          icon: wall.isStructural ? Icons.horizontal_rule : Icons.border_clear,
          label: wall.isStructural ? 'Muro' : 'Partición',
        ),
        const SizedBox(height: 12),
        _PropField(
          label: 'Longitud',
          displayValue: UnitFormatter.length(wall.length, unit,
              precision: precision),
          rawValue: UnitFormatter.rawLength(wall.length, unit,
              precision: precision),
          editable: false,
        ),
        _PropField(
          label: 'Altura',
          displayValue: UnitFormatter.length(wall.height, unit,
              precision: precision),
          rawValue: UnitFormatter.rawLength(wall.height, unit,
              precision: precision),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final displayVal = double.tryParse(v);
            if (displayVal != null) {
              final h = UnitConverter.toMeters(displayVal, unit);
              if (h > 0) {
                ref
                    .read(historyProvider.notifier)
                    .record(ref.read(workspaceSnapshotProvider));
                ref
                    .read(wallsProvider.notifier)
                    .updateWall(wall.copyWith(height: h));
              }
            }
          },
        ),
        _PropField(
          label: 'Espesor',
          displayValue: UnitFormatter.length(wall.thickness, unit,
              precision: precision),
          rawValue: UnitFormatter.rawLength(wall.thickness, unit,
              precision: precision),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final displayVal = double.tryParse(v);
            if (displayVal != null) {
              final t = UnitConverter.toMeters(displayVal, unit);
              if (t > 0) {
                ref
                    .read(historyProvider.notifier)
                    .record(ref.read(workspaceSnapshotProvider));
                ref
                    .read(wallsProvider.notifier)
                    .updateWall(wall.copyWith(thickness: t));
              }
            }
          },
        ),
        _PropField(
          label: 'Material',
          displayValue: wall.material,
          rawValue: wall.material,
          onSave: (v) {
            if (v.trim().isNotEmpty) {
              ref
                  .read(historyProvider.notifier)
                  .record(ref.read(workspaceSnapshotProvider));
              ref
                  .read(wallsProvider.notifier)
                  .updateWall(wall.copyWith(material: v.trim()));
            }
          },
        ),
        _NotesField(
          notes: wall.notes,
          onSave: (v) => ref.read(wallsProvider.notifier).updateWall(
                wall.copyWith(notes: v.isEmpty ? null : v),
              ),
        ),
        const SizedBox(height: 12),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text(
              'Es estructural',
              style: TextStyle(fontSize: 12, color: LevonColors.textSecondary),
            ),
            Switch(
              value: wall.isStructural,
              activeThumbColor: LevonColors.navy,
              onChanged: (val) {
                ref
                    .read(wallsProvider.notifier)
                    .updateWall(wall.copyWith(isStructural: val));
              },
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: LevonColors.errorRed),
            onPressed: () {
              ref.read(wallsProvider.notifier).removeWall(wall.id);
              ref.read(selectedObjectProvider.notifier).state = null;
              ref.read(propertiesPanelVisibleProvider.notifier).state = false;
            },
            icon: const Icon(Icons.delete_outline, size: 16),
            label: const Text('Eliminar'),
          ),
        ),
      ],
    );
  }
}

// ─── ROOM PROPERTIES ─────────────────────────────────────────────────────────

class _RoomProperties extends ConsumerWidget {
  final Room room;
  const _RoomProperties({super.key, required this.room});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(projectSettingsProvider);
    final unit = settings.defaults.baseUnit;
    final precision = settings.precision.lengthPrecision;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PropHeader(
            icon: Icons.meeting_room_outlined, label: 'Habitación'),
        const SizedBox(height: 12),
        _PropField(
            label: 'Nombre',
            displayValue: room.name,
            rawValue: room.name,
            editable: false),
        _PropField(
            label: 'Área',
            displayValue: UnitFormatter.area(room.area, unit,
                decimals: settings.precision.areaPrecision),
            rawValue: UnitFormatter.area(room.area, unit,
                decimals: settings.precision.areaPrecision),
            editable: false),
        _PropField(
            label: 'Perímetro',
            displayValue: UnitFormatter.length(room.estimatedPerimeter, unit,
                precision: precision),
            rawValue: UnitFormatter.rawLength(room.estimatedPerimeter, unit,
                precision: precision),
            editable: false),
        _PropField(
            label: 'Muros',
            displayValue: '${room.boundary.length}',
            rawValue: '${room.boundary.length}',
            editable: false),
        _NotesField(
          notes: room.notes,
          onSave: (v) {
            // Room is derived/computed — notes not persisted (rooms have no notifier)
          },
        ),
      ],
    );
  }
}

// ─── COLUMN PROPERTIES ───────────────────────────────────────────────────────

class _ColumnProperties extends ConsumerWidget {
  final ArchitecturalColumn col;
  const _ColumnProperties({super.key, required this.col});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(projectSettingsProvider);
    final unit = settings.defaults.baseUnit;
    final precision = settings.precision.lengthPrecision;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PropHeader(icon: Icons.architecture, label: 'Columna'),
        const SizedBox(height: 12),
        _PropField(
          label: 'Forma',
          displayValue:
              col.shape == ColumnShape.circular ? 'Circular' : 'Rectangular',
          rawValue:
              col.shape == ColumnShape.circular ? 'Circular' : 'Rectangular',
          editable: false,
        ),
        _PropField(
          label: col.shape == ColumnShape.circular ? 'Diámetro' : 'Ancho (X)',
          displayValue: UnitFormatter.length(col.dimensionX, unit,
              precision: precision),
          rawValue: UnitFormatter.rawLength(col.dimensionX, unit,
              precision: precision),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final displayVal = double.tryParse(v);
            if (displayVal != null) {
              final val = UnitConverter.toMeters(displayVal, unit);
              if (val > 0) {
                ref
                    .read(historyProvider.notifier)
                    .record(ref.read(workspaceSnapshotProvider));
                ref
                    .read(columnsProvider.notifier)
                    .updateColumn(col.copyWith(dimensionX: val));
              }
            }
          },
        ),
        if (col.shape == ColumnShape.rectangular)
          _PropField(
            label: 'Largo (Y)',
            displayValue: UnitFormatter.length(col.dimensionY, unit,
                precision: precision),
            rawValue: UnitFormatter.rawLength(col.dimensionY, unit,
                precision: precision),
            keyboardType: TextInputType.number,
            onSave: (v) {
              final displayVal = double.tryParse(v);
              if (displayVal != null) {
                final val = UnitConverter.toMeters(displayVal, unit);
                if (val > 0) {
                  ref
                      .read(historyProvider.notifier)
                      .record(ref.read(workspaceSnapshotProvider));
                  ref
                      .read(columnsProvider.notifier)
                      .updateColumn(col.copyWith(dimensionY: val));
                }
              }
            },
          ),
        _PropField(
          label: 'Altura',
          displayValue: UnitFormatter.length(col.height, unit,
              precision: precision),
          rawValue: UnitFormatter.rawLength(col.height, unit,
              precision: precision),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final displayVal = double.tryParse(v);
            if (displayVal != null) {
              final h = UnitConverter.toMeters(displayVal, unit);
              if (h > 0) {
                ref
                    .read(historyProvider.notifier)
                    .record(ref.read(workspaceSnapshotProvider));
                ref
                    .read(columnsProvider.notifier)
                    .updateColumn(col.copyWith(height: h));
              }
            }
          },
        ),
        _PropField(
          label: 'Material',
          displayValue: col.material,
          rawValue: col.material,
          onSave: (v) {
            if (v.trim().isNotEmpty) {
              ref
                  .read(historyProvider.notifier)
                  .record(ref.read(workspaceSnapshotProvider));
              ref
                  .read(columnsProvider.notifier)
                  .updateColumn(col.copyWith(material: v.trim()));
            }
          },
        ),
        _NotesField(
          notes: col.notes,
          onSave: (v) => ref.read(columnsProvider.notifier).updateColumn(
                col.copyWith(notes: v.isEmpty ? null : v),
              ),
        ),
        const SizedBox(height: 20),
        const Divider(),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: LevonColors.errorRed),
            onPressed: () {
              ref.read(columnsProvider.notifier).removeColumn(col.id);
              ref.read(selectedObjectProvider.notifier).state = null;
              ref.read(propertiesPanelVisibleProvider.notifier).state = false;
            },
            icon: const Icon(Icons.delete_outline, size: 16),
            label: const Text('Eliminar'),
          ),
        ),
      ],
    );
  }
}

// ─── WALL OPENING PROPERTIES ─────────────────────────────────────────────────

class _WallOpeningProperties extends ConsumerWidget {
  final WallOpening opening;
  const _WallOpeningProperties({super.key, required this.opening});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(projectSettingsProvider);
    final unit = settings.defaults.baseUnit;
    final precision = settings.precision.lengthPrecision;
    final elevations = ref.watch(wallElevationsProvider);

    final elevation = elevations.where(
      (e) => e.openings.any((o) => o.id == opening.id),
    ).firstOrNull;
    if (elevation == null) return const SizedBox.shrink();

    const uc = EditWallElevationUseCase();

    void update(WallOpening updated) {
      ref.read(wallElevationsProvider.notifier).upsertElevation(
            uc.updateOpening(elevation, updated),
          );
      ref.read(selectedObjectProvider.notifier).state = updated;
    }

    final typeLabel = switch (opening.type) {
      OpeningType.door => 'Puerta',
      OpeningType.window => 'Ventana',
      OpeningType.opening => 'Hueco',
    };
    final typeIcon = switch (opening.type) {
      OpeningType.door => Icons.door_front_door_outlined,
      OpeningType.window => Icons.window_outlined,
      OpeningType.opening => Icons.crop_square_outlined,
    };

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _PropHeader(icon: typeIcon, label: typeLabel),
        const SizedBox(height: 12),
        _PropField(
          label: 'Ancho',
          displayValue: UnitFormatter.length(opening.width, unit, precision: precision),
          rawValue: UnitFormatter.rawLength(opening.width, unit, precision: precision),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final val = double.tryParse(v);
            if (val != null && val > 0) {
              update(opening.copyWith(width: UnitConverter.toMeters(val, unit)));
            }
          },
        ),
        _PropField(
          label: 'Alto',
          displayValue: UnitFormatter.length(opening.height, unit, precision: precision),
          rawValue: UnitFormatter.rawLength(opening.height, unit, precision: precision),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final val = double.tryParse(v);
            if (val != null && val > 0) {
              update(opening.copyWith(height: UnitConverter.toMeters(val, unit)));
            }
          },
        ),
        _PropField(
          label: 'Sill',
          displayValue: UnitFormatter.length(opening.sillHeight, unit, precision: precision),
          rawValue: UnitFormatter.rawLength(opening.sillHeight, unit, precision: precision),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final val = double.tryParse(v);
            if (val != null && val >= 0) {
              update(opening.copyWith(sillHeight: UnitConverter.toMeters(val, unit)));
            }
          },
        ),
        if (opening.type == OpeningType.door) ...[
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Giro invertido',
                style: TextStyle(fontSize: 12, color: LevonColors.textSecondary),
              ),
              Switch(
                value: opening.isFlipped,
                activeThumbColor: LevonColors.navy,
                onChanged: (val) => update(opening.copyWith(isFlipped: val)),
              ),
            ],
          ),
        ],
        _NotesField(
          notes: opening.notes,
          onSave: (v) => update(opening.copyWith(notes: v.isEmpty ? null : v)),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: LevonColors.errorRed),
            onPressed: () {
              ref.read(wallElevationsProvider.notifier).upsertElevation(
                    uc.removeOpening(elevation, opening.id),
                  );
              ref.read(selectedObjectProvider.notifier).state = null;
              ref.read(propertiesPanelVisibleProvider.notifier).state = false;
            },
            icon: const Icon(Icons.delete_outline, size: 16),
            label: const Text('Eliminar'),
          ),
        ),
      ],
    );
  }
}

// ─── PHOTO MARKER PROPERTIES ─────────────────────────────────────────────────

class _PhotoMarkerProperties extends ConsumerWidget {
  final PhotoMarkerEntity marker;
  const _PhotoMarkerProperties({super.key, required this.marker});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final collections = ref.watch(photoCollectionsProvider);
    final collection = collections
        .where((c) => c.id == marker.collectionId)
        .firstOrNull;
    final photo = collection?.photos
        .where((p) => p.id == marker.linkedPhotoId)
        .firstOrNull;

    void update(PhotoMarkerEntity updated) {
      ref.read(photoMarkersProvider.notifier).updateMarker(updated);
      ref.read(selectedObjectProvider.notifier).state = updated;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _PropHeader(
            icon: Icons.add_a_photo_outlined, label: 'Marcador Fotográfico'),
        const SizedBox(height: 12),
        if (photo != null) ...[
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              PhotoThumbnailButton(photo: photo, size: 72),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      photo.bimCode,
                      style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11,
                        letterSpacing: 1.0,
                        color: LevonColors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      photo.name,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 6),
                    Builder(
                      builder: (ctx) => GestureDetector(
                        onTap: () => showPhotoViewerDialog(ctx, photo),
                        child: const Row(
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
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
        ],
        if (collection != null)
          _PropField(
            label: 'Colección',
            displayValue: collection.name,
            rawValue: collection.name,
            editable: false,
          ),
        _PropField(
          label: 'Orientación',
          displayValue: '${marker.orientation.toStringAsFixed(1)}°',
          rawValue: marker.orientation.toStringAsFixed(1),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final val = double.tryParse(v);
            if (val != null) update(marker.copyWith(orientation: val % 360));
          },
        ),
        _PropField(
          label: 'Cono (°)',
          displayValue: '${marker.cameraCone.angle.toStringAsFixed(0)}°',
          rawValue: marker.cameraCone.angle.toStringAsFixed(0),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final val = double.tryParse(v);
            if (val != null && val > 0 && val <= 360) {
              update(marker.copyWith(
                  cameraCone: marker.cameraCone.copyWith(angle: val)));
            }
          },
        ),
        _PropField(
          label: 'Alcance',
          displayValue: '${marker.cameraCone.range.toStringAsFixed(1)} m',
          rawValue: marker.cameraCone.range.toStringAsFixed(1),
          keyboardType: TextInputType.number,
          onSave: (v) {
            final val = double.tryParse(v);
            if (val != null && val > 0) {
              update(marker.copyWith(
                  cameraCone: marker.cameraCone.copyWith(range: val)));
            }
          },
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            const Text('Visible',
                style:
                    TextStyle(fontSize: 12, color: LevonColors.textSecondary)),
            Switch(
              value: marker.visible,
              activeThumbColor: LevonColors.navy,
              onChanged: (val) => update(marker.copyWith(visible: val)),
            ),
          ],
        ),
        _NotesField(
          notes: marker.notes.isEmpty ? null : marker.notes,
          onSave: (v) => update(marker.copyWith(notes: v)),
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: LevonColors.errorRed),
            onPressed: () {
              ref.read(photoMarkersProvider.notifier).removeMarker(marker.id);
              ref.read(selectedObjectProvider.notifier).state = null;
              ref.read(propertiesPanelVisibleProvider.notifier).state = false;
            },
            icon: const Icon(Icons.delete_outline, size: 16),
            label: const Text('Eliminar marcador'),
          ),
        ),
      ],
    );
  }
}

// ─── SHARED WIDGETS ──────────────────────────────────────────────────────────

class _NotesField extends StatefulWidget {
  final String? notes;
  final void Function(String) onSave;
  const _NotesField({required this.notes, required this.onSave});

  @override
  State<_NotesField> createState() => _NotesFieldState();
}

class _NotesFieldState extends State<_NotesField> {
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.notes ?? '');
  }

  @override
  void didUpdateWidget(_NotesField old) {
    super.didUpdateWidget(old);
    if (old.notes != widget.notes) {
      _ctrl.text = widget.notes ?? '';
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Notas',
            style: TextStyle(color: LevonColors.textSecondary, fontSize: 12),
          ),
          const SizedBox(height: 4),
          TextField(
            controller: _ctrl,
            maxLines: 3,
            maxLength: 500,
            keyboardType: TextInputType.multiline,
            style: const TextStyle(fontSize: 13),
            decoration: InputDecoration(
              isDense: true,
              hintText: 'Observaciones…',
              contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              filled: true,
              fillColor: LevonColors.surface2,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(LevonRadius.xs),
                borderSide: BorderSide.none,
              ),
              counterStyle: const TextStyle(fontSize: 10, color: LevonColors.textDisabled),
            ),
            onSubmitted: widget.onSave,
            onTapOutside: (_) => widget.onSave(_ctrl.text),
          ),
        ],
      ),
    );
  }
}

class _PropHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  const _PropHeader({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 18, color: LevonColors.navy),
        const SizedBox(width: 8),
        Text(
          label,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
            fontSize: 15,
            color: LevonColors.navy,
          ),
        ),
      ],
    );
  }
}

/// Campo de propiedad editable.
/// [displayValue] es lo que se muestra en reposo (con unidades).
/// [rawValue] es lo que se carga en el editor (solo número o texto limpio).
class _PropField extends StatefulWidget {
  final String label;
  final String displayValue;
  final String rawValue;
  final bool editable;
  final TextInputType keyboardType;
  final void Function(String)? onSave;

  const _PropField({
    required this.label,
    required this.displayValue,
    required this.rawValue,
    this.editable = true,
    this.keyboardType = TextInputType.text,
    this.onSave,
  });

  @override
  State<_PropField> createState() => _PropFieldState();
}

class _PropFieldState extends State<_PropField> {
  bool _editing = false;
  late TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.rawValue);
  }

  @override
  void didUpdateWidget(_PropField old) {
    super.didUpdateWidget(old);
    if (!_editing && old.rawValue != widget.rawValue) {
      _ctrl.text = widget.rawValue;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _commit() {
    widget.onSave?.call(_ctrl.text);
    setState(() => _editing = false);
  }

  void _startEditing() {
    setState(() {
      _ctrl.text = widget.rawValue;
      _editing = true;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          SizedBox(
            width: 76,
            child: Text(
              widget.label,
              style: const TextStyle(
                color: LevonColors.textSecondary,
                fontSize: 12,
              ),
            ),
          ),
          Expanded(
            child: _editing
                ? TextField(
                    controller: _ctrl,
                    autofocus: true,
                    keyboardType: widget.keyboardType,
                    style: const TextStyle(fontSize: 14),
                    decoration: const InputDecoration(
                      isDense: true,
                      contentPadding:
                          EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    ),
                    onSubmitted: (_) => _commit(),
                    onTapOutside: (_) => _commit(),
                  )
                : GestureDetector(
                    onTap: widget.editable && widget.onSave != null
                        ? _startEditing
                        : null,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 6),
                      decoration: BoxDecoration(
                        color: widget.editable
                            ? LevonColors.surface2
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(LevonRadius.xs),
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              widget.displayValue,
                              style: const TextStyle(fontSize: 14),
                            ),
                          ),
                          if (widget.editable && widget.onSave != null)
                            const Icon(
                              Icons.edit_outlined,
                              size: 12,
                              color: LevonColors.textDisabled,
                            ),
                        ],
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
