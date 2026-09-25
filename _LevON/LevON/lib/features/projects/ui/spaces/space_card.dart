import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/viewport/space_bounds.dart';
import 'package:levon/features/projects/ui/spaces/space_preview_painter.dart';

// ─── SPACE CARD ───────────────────────────────────────────────────────────────

/// Tarjeta visual principal de un espacio BIM.
///
/// Diseño: preview del canvas real como elemento dominante, código BIM,
/// nombre del espacio y metadata secundaria (elementos, habitaciones, fecha).
///
/// La miniatura se renderiza con [SpacePreviewPainter] usando auto-fit BBox.
/// Geometry viene de [SpaceData.walls/rooms/columns] — NO del editor global.
class SpaceCard extends StatelessWidget {
  final SpaceData space;
  final String projectId;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  const SpaceCard({
    super.key,
    required this.space,
    required this.projectId,
    this.onTap,
    this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final bounds = SpaceBounds.fromGeometry(
      walls: space.walls,
      columns: space.columns,
    );
    final hasGeometry = space.walls.isNotEmpty || space.columns.isNotEmpty;

    return Card(
      key: Key('space_card_${space.id}'),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap ?? () => context.push('/projects/$projectId/workspaces/${space.id}'),
        onLongPress: onLongPress ?? () => _showSpaceContextMenu(context),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── 1. Canvas Preview (elemento dominante) ─────────────────────
            _SpacePreviewArea(
              walls: space.walls,
              rooms: space.rooms,
              columns: space.columns,
              bounds: bounds,
              hasGeometry: hasGeometry,
            ),

            // ── 2. Info BIM ────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // BIM code badge + nombre
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color: LevonColors.navy,
                          borderRadius: BorderRadius.circular(LevonRadius.xs),
                        ),
                        child: Text(
                          space.code,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            fontFamily: 'monospace',
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          space.name,
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 14,
                            color: LevonColors.textPrimary,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),

                  if (space.description.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      space.description,
                      style: const TextStyle(
                        color: LevonColors.textSecondary,
                        fontSize: 11,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],

                  const SizedBox(height: 8),

                  // Metadata row
                  _SpaceMetaRow(space: space),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showSpaceContextMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(LevonRadius.lg)),
      ),
      builder: (_) => _SpaceContextMenu(space: space),
    );
  }
}

// ─── PREVIEW AREA ─────────────────────────────────────────────────────────────

/// Área de preview del canvas del espacio. Renderiza geometry real vía
/// [SpacePreviewPainter] con auto-fit BBox. Sin dependencia del editor.
class _SpacePreviewArea extends StatelessWidget {
  final List<Wall> walls;
  final List<Room> rooms;
  final List<ArchitecturalColumn> columns;
  final SpaceBounds? bounds;
  final bool hasGeometry;

  const _SpacePreviewArea({
    required this.walls,
    required this.rooms,
    required this.columns,
    required this.bounds,
    required this.hasGeometry,
  });

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 16 / 9,
      child: Container(
        color: LevonColors.canvasBg,
        child: hasGeometry
            ? CustomPaint(
                painter: SpacePreviewPainter(
                  walls: walls,
                  rooms: rooms,
                  columns: columns,
                  bounds: bounds,
                ),
              )
            : const _EmptyPreviewPlaceholder(),
      ),
    );
  }
}

// ─── EMPTY PREVIEW PLACEHOLDER ───────────────────────────────────────────────

class _EmptyPreviewPlaceholder extends StatelessWidget {
  const _EmptyPreviewPlaceholder();

  @override
  Widget build(BuildContext context) {
    return const Stack(
      children: [
        // Grid de referencia lightweight
        CustomPaint(
          painter: SpacePreviewPainter(
            walls: [],
            rooms: [],
            columns: [],
          ),
        ),
        Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.architecture_outlined,
                size: 32,
                color: LevonColors.textDisabled,
              ),
              SizedBox(height: 6),
              Text(
                'Espacio sin geometría',
                style: TextStyle(
                  color: LevonColors.textDisabled,
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ─── METADATA ROW ─────────────────────────────────────────────────────────────

class _SpaceMetaRow extends StatelessWidget {
  final SpaceData space;
  const _SpaceMetaRow({required this.space});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (space.wallCount > 0) ...[
          _MetaChip(
            icon: Icons.architecture,
            label: '${space.wallCount} muros',
          ),
          const SizedBox(width: 8),
        ],
        if (space.roomCount > 0) ...[
          _MetaChip(
            icon: Icons.grid_view_outlined,
            label: '${space.roomCount} hab.',
          ),
          const SizedBox(width: 8),
        ],
        const Spacer(),
        _MetaChip(
          icon: Icons.layers_outlined,
          label: '${space.elementCount} elem.',
          subtle: true,
        ),
      ],
    );
  }
}

class _MetaChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool subtle;

  const _MetaChip({
    required this.icon,
    required this.label,
    this.subtle = false,
  });

  @override
  Widget build(BuildContext context) {
    final color =
        subtle ? LevonColors.textDisabled : LevonColors.textSecondary;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 11, color: color),
        const SizedBox(width: 3),
        Text(
          label,
          style: TextStyle(fontSize: 11, color: color),
        ),
      ],
    );
  }
}

// ─── CONTEXT MENU ─────────────────────────────────────────────────────────────

class _SpaceContextMenu extends StatelessWidget {
  final SpaceData space;
  const _SpaceContextMenu({required this.space});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        key: const Key('space_context_menu'),
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: LevonColors.navy,
                    borderRadius: BorderRadius.circular(LevonRadius.sm),
                  ),
                  child: const Icon(Icons.layers_outlined,
                      color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(space.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 15)),
                      Text(
                        space.code,
                        style: const TextStyle(
                          color: LevonColors.textSecondary,
                          fontSize: 12,
                          fontFamily: 'monospace',
                          letterSpacing: 0.8,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          const SizedBox(height: 4),
          ListTile(
            key: const Key('menu_renombrar_espacio'),
            leading: const Icon(Icons.edit_outlined, size: 20),
            title: const Text('Renombrar Espacio'),
            onTap: () => Navigator.pop(context),
          ),
          ListTile(
            key: const Key('menu_duplicar_espacio'),
            leading: const Icon(Icons.copy_outlined, size: 20),
            title: const Text('Duplicar Espacio'),
            subtitle: const Text('Con nuevo código BIM'),
            onTap: () => Navigator.pop(context),
          ),
          const ListTile(
            key: Key('menu_exportar_espacio'),
            leading: Icon(Icons.ios_share_outlined, size: 20),
            title: Text('Exportar (próximamente)'),
            enabled: false,
          ),
          const Divider(height: 1),
          ListTile(
            key: const Key('menu_eliminar_espacio'),
            leading: const Icon(Icons.delete_outline,
                color: LevonColors.errorRed, size: 20),
            title: const Text('Eliminar Espacio',
                style: TextStyle(color: LevonColors.errorRed)),
            onTap: () => Navigator.pop(context),
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

// ─── NEW SPACE CARD ───────────────────────────────────────────────────────────

/// Tarjeta "Agregar Espacio" para la grilla de espacios.
class NewSpaceCard extends StatelessWidget {
  final VoidCallback onTap;
  const NewSpaceCard({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('card_nuevo_espacio'),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(LevonRadius.md),
        side: const BorderSide(
          color: LevonColors.divider,
          width: 1.5,
          strokeAlign: BorderSide.strokeAlignInside,
        ),
      ),
      elevation: 0,
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(LevonRadius.md),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 48,
              height: 48,
              decoration: BoxDecoration(
                color: LevonColors.navy.withValues(alpha: 0.06),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.add,
                size: 26,
                color: LevonColors.textDisabled,
              ),
            ),
            const SizedBox(height: 10),
            const Text(
              'Nuevo Espacio',
              style: TextStyle(
                color: LevonColors.textDisabled,
                fontWeight: FontWeight.w600,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── DATA MODEL ───────────────────────────────────────────────────────────────

/// Descriptor de espacio BIM para la grilla visual.
///
/// VO de presentación — NOT la entidad Space del dominio (roadmap v0.10.0).
/// Lleva geometría tipada para que [SpaceCard] renderice el preview sin
/// depender de los providers globales del editor.
class SpaceData {
  final String id;
  final String name;
  final String code;
  final String description;
  final int wallCount;
  final int roomCount;
  final int elementCount;
  final DateTime? updatedAt;

  // Geometría para preview — proviene del Project ya cargado
  final List<Wall> walls;
  final List<Room> rooms;
  final List<ArchitecturalColumn> columns;

  const SpaceData({
    required this.id,
    required this.name,
    required this.code,
    this.description = '',
    required this.wallCount,
    this.roomCount = 0,
    required this.elementCount,
    this.updatedAt,
    this.walls = const [],
    this.rooms = const [],
    this.columns = const [],
  });
}
