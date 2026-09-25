import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/bim/services/photo_bim_code_generator.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/projects/ui/spaces/space_card.dart';

/// Pantalla de Espacios BIM de un proyecto — entidad visual principal.
class ProjectWorkspaceScreen extends ConsumerWidget {
  final String projectId;
  const ProjectWorkspaceScreen({super.key, required this.projectId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projectAsync = ref.watch(projectByIdProvider(projectId));

    return projectAsync.when(
      loading: () => Scaffold(
        key: const Key('space_list_scaffold_loading'),
        appBar: _buildLoadingAppBar(context),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Scaffold(
        key: const Key('space_list_scaffold_error'),
        appBar: _buildLoadingAppBar(context),
        body: Center(child: Text('Error cargando proyecto: $e')),
      ),
      data: (project) => _SpaceGridScaffold(
        project: project,
        projectId: projectId,
      ),
    );
  }

  AppBar _buildLoadingAppBar(BuildContext context) {
    return AppBar(
      leading: IconButton(
        key: const Key('btn_volver_espacios'),
        icon: const Icon(Icons.arrow_back_ios_new, size: 18),
        onPressed: () => context.pop(),
      ),
      title: const Text('Espacios'),
    );
  }
}

// ─── GRID SCAFFOLD ────────────────────────────────────────────────────────────

class _SpaceGridScaffold extends ConsumerStatefulWidget {
  final Project project;
  final String projectId;

  const _SpaceGridScaffold({
    required this.project,
    required this.projectId,
  });

  @override
  ConsumerState<_SpaceGridScaffold> createState() => _SpaceGridScaffoldState();
}

class _SpaceGridScaffoldState extends ConsumerState<_SpaceGridScaffold> {
  static const _codeGen = PhotoBimCodeGenerator();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Sync photoCollectionsProvider from the disk-loaded project when no
      // EditorScreen session is active for this project.
      final activeProject = ref.read(projectProvider);
      final isEditorActive = activeProject != null &&
          activeProject.id == widget.project.id;
      if (!isEditorActive) {
        ref
            .read(photoCollectionsProvider.notifier)
            .setCollections(widget.project.photoCollections);
      }
    });
  }

  Future<void> _createCollection(BuildContext context) async {
    final router = GoRouter.of(context);
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Nueva Colección Fotográfica'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(
                labelText: 'Nombre *',
                hintText: 'Ej. Fachada Norte, Interior Sala…',
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: descCtrl,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Descripción',
                hintText: 'Contexto, fase, observaciones…',
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Crear'),
          ),
        ],
      ),
    );

    final name = nameCtrl.text.trim();
    nameCtrl.dispose();
    descCtrl.dispose();

    if (confirmed != true || name.isEmpty || !mounted) return;

    final existing = ref.read(photoCollectionsProvider);
    final bimCode = _codeGen.generateCollectionCode(existing);
    final collection = PhotoCollection(
      bimCode: bimCode,
      name: name,
      description: descCtrl.text.trim(),
    );

    // Update provider for immediate UI refresh
    ref.read(photoCollectionsProvider.notifier).addCollection(collection);

    // Save: load fresh from disk so we don't lose any data, add collection, save.
    final repo = ref.read(projectRepositoryProvider);
    try {
      final fresh = await repo.loadProject(widget.projectId);
      final updated = fresh.copyWith(
        photoCollections: [...fresh.photoCollections, collection],
      );
      await repo.saveProject(updated);
    } catch (_) {
      // Silent — collection is in provider state even if disk save fails.
    }

    if (!mounted) return;
    router.push(
      '/projects/${widget.projectId}/workspaces/photos/${collection.id}',
    );
  }

  Future<void> _renameCollection(PhotoCollection collection) async {
    final ctrl = TextEditingController(text: collection.name);
    final descCtrl = TextEditingController(text: collection.description);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Editar Colección'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: ctrl,
              autofocus: true,
              textCapitalization: TextCapitalization.sentences,
              decoration: const InputDecoration(labelText: 'Nombre'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: descCtrl,
              textCapitalization: TextCapitalization.sentences,
              maxLines: 2,
              decoration: const InputDecoration(labelText: 'Descripción'),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Guardar'),
          ),
        ],
      ),
    );

    final name = ctrl.text.trim();
    final desc = descCtrl.text.trim();
    ctrl.dispose();
    descCtrl.dispose();

    if (confirmed != true || name.isEmpty || !mounted) return;

    final updated = collection.copyWith(name: name, description: desc);
    ref.read(photoCollectionsProvider.notifier).upsertCollection(updated);

    final repo = ref.read(projectRepositoryProvider);
    try {
      final fresh = await repo.loadProject(widget.projectId);
      final updatedCollections = [
        for (final c in fresh.photoCollections)
          c.id == collection.id ? updated : c,
      ];
      await repo.saveProject(fresh.copyWith(photoCollections: updatedCollections));
    } catch (_) {}
  }

  Future<void> _deleteCollection(PhotoCollection collection) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar colección'),
        content: Text(
          '¿Eliminar "${collection.name}"?\n\n'
          'Se eliminarán las ${collection.photoCount} '
          'foto${collection.photoCount == 1 ? '' : 's'} del registro.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Eliminar',
                style: TextStyle(color: LevonColors.errorRed)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    ref.read(photoCollectionsProvider.notifier).removeCollection(collection.id);

    final repo = ref.read(projectRepositoryProvider);
    try {
      final fresh = await repo.loadProject(widget.projectId);
      final updatedCollections =
          fresh.photoCollections.where((c) => c.id != collection.id).toList();
      await repo.saveProject(fresh.copyWith(photoCollections: updatedCollections));
    } catch (_) {}
  }

  @override
  Widget build(BuildContext context) {
    final collections = ref.watch(photoCollectionsProvider);

    final spaces = widget.project.spaces.entries.map((e) {
      final sId = e.key;
      final geom = e.value;
      final shortCode = sId.length > 6
          ? sId.substring(sId.length - 3).toUpperCase()
          : sId.toUpperCase();
      return SpaceData(
        id: sId,
        name: geom.name,
        code: 'SPC-$shortCode',
        description: '',
        wallCount: geom.walls.length,
        roomCount: geom.rooms.length,
        elementCount: geom.walls.length +
            geom.columns.length +
            geom.wallElevations.fold(0, (s, we) => s + we.openings.length),
        updatedAt: widget.project.updatedAt,
        walls: geom.walls,
        rooms: geom.rooms,
        columns: geom.columns,
      );
    }).toList();

    spaces.sort((a, b) {
      if (a.id == 'ground') return -1;
      if (b.id == 'ground') return 1;
      return a.name.compareTo(b.name);
    });

    final isDesktop = MediaQuery.of(context).size.width > 900;
    final crossAxisCount = isDesktop ? 3 : 2;

    return Scaffold(
      key: const Key('space_list_scaffold'),
      appBar: _buildAppBar(context, widget.project),
      floatingActionButton: _CreateSpaceFab(
        onNewSpace: () => _showNewSpaceSheet(context),
        onNewCollection: () => _createCollection(context),
      ),
      body: (spaces.isEmpty && collections.isEmpty)
          ? const _SpaceEmptyState(key: Key('space_empty_state'))
          : CustomScrollView(
              key: const Key('space_grid_scroll'),
              slivers: [
                // ── Espacios BIM ─────────────────────────────────────────────
                if (spaces.isNotEmpty) ...[
                  SliverToBoxAdapter(
                    child: _SectionHeader(
                      icon: Icons.layers_outlined,
                      label: 'Espacios BIM',
                      count: spaces.length,
                    ),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.symmetric(
                      horizontal: isDesktop ? 24 : 16,
                    ),
                    sliver: SliverGrid(
                      delegate: SliverChildBuilderDelegate(
                        (_, i) => SpaceCard(
                          key: Key('card_espacio_${spaces[i].id}'),
                          space: spaces[i],
                          projectId: widget.projectId,
                        ),
                        childCount: spaces.length,
                      ),
                      gridDelegate:
                          SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        childAspectRatio: 0.78,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                    ),
                  ),
                ],

                // ── Colecciones Fotográficas ──────────────────────────────
                if (collections.isNotEmpty) ...[
                  SliverToBoxAdapter(
                    child: _SectionHeader(
                      icon: Icons.camera_alt_outlined,
                      label: 'Colecciones Fotográficas',
                      count: collections.length,
                    ),
                  ),
                  SliverPadding(
                    padding: EdgeInsets.only(
                      left: isDesktop ? 24 : 16,
                      right: isDesktop ? 24 : 16,
                      bottom: 88,
                    ),
                    sliver: SliverGrid(
                      delegate: SliverChildBuilderDelegate(
                        (_, i) {
                          final c = collections[i];
                          return _CollectionCard(
                            key: Key('card_coleccion_${c.id}'),
                            collection: c,
                            onTap: () => context.push(
                              '/projects/${widget.projectId}/workspaces/photos/${c.id}',
                            ),
                            onLongPress: () =>
                                _showCollectionMenu(context, c),
                          );
                        },
                        childCount: collections.length,
                      ),
                      gridDelegate:
                          SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: crossAxisCount,
                        childAspectRatio: 0.78,
                        crossAxisSpacing: 12,
                        mainAxisSpacing: 12,
                      ),
                    ),
                  ),
                ],

                // bottom padding when only spaces exist
                if (collections.isEmpty)
                  const SliverToBoxAdapter(child: SizedBox(height: 88)),
              ],
            ),
    );
  }

  void _showCollectionMenu(BuildContext context, PhotoCollection collection) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(LevonRadius.lg)),
      ),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: LevonColors.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 4),
              child: Row(
                children: [
                  const Icon(Icons.camera_alt_outlined,
                      size: 18, color: LevonColors.navy),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(collection.name,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 14)),
                        Text(collection.bimCode,
                            style: const TextStyle(
                                fontSize: 10,
                                color: LevonColors.textSecondary,
                                fontFamily: 'monospace')),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const Divider(height: 20),
            ListTile(
              leading: const Icon(Icons.edit_outlined),
              title: const Text('Renombrar / Editar'),
              onTap: () {
                Navigator.pop(context);
                _renameCollection(collection);
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline,
                  color: LevonColors.errorRed),
              title: const Text('Eliminar colección',
                  style: TextStyle(color: LevonColors.errorRed)),
              onTap: () {
                Navigator.pop(context);
                _deleteCollection(collection);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  AppBar _buildAppBar(BuildContext context, Project project) {
    return AppBar(
      key: const Key('space_list_appbar'),
      leading: IconButton(
        key: const Key('btn_volver_proyectos'),
        icon: const Icon(Icons.arrow_back_ios_new, size: 18),
        tooltip: 'Volver a proyectos',
        onPressed: () => context.pop(),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            project.title,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          if (project.bimCode != null)
            Text(
              project.bimCode!,
              style: TextStyle(
                fontSize: 10,
                color: Colors.white.withValues(alpha: 0.7),
                fontFamily: 'monospace',
                letterSpacing: 1.2,
              ),
            ),
        ],
      ),
      actions: [
        IconButton(
          key: const Key('btn_info_proyecto'),
          icon: const Icon(Icons.info_outline, size: 20),
          tooltip: 'Información del proyecto',
          onPressed: () => _showProjectInfo(context, project),
        ),
        const SizedBox(width: 4),
      ],
    );
  }

  void _showNewSpaceSheet(BuildContext context) {
    final ctrl = TextEditingController();
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(LevonRadius.lg)),
      ),
      builder: (sheetCtx) => Padding(
        padding: EdgeInsets.only(
          left: 24,
          right: 24,
          top: 24,
          bottom: MediaQuery.of(sheetCtx).viewInsets.bottom + 32,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: LevonColors.navy,
                    borderRadius: BorderRadius.circular(LevonRadius.sm),
                  ),
                  child: const Icon(Icons.layers_outlined,
                      color: Colors.white, size: 20),
                ),
                const SizedBox(width: 12),
                const Text(
                  'Nuevo Espacio',
                  style:
                      TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                ),
              ],
            ),
            const SizedBox(height: 16),
            TextField(
              controller: ctrl,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(
                labelText: 'Nombre del Espacio',
                hintText: 'Ej. Planta Baja, Azotea, Local 02…',
                prefixIcon: Icon(Icons.layers_outlined, size: 18),
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                key: const Key('btn_crear_espacio'),
                onPressed: () async {
                  final name = ctrl.text.trim();
                  if (name.isNotEmpty) {
                    Navigator.of(sheetCtx).pop();
                    final newSpaceId =
                        'space-${DateTime.now().millisecondsSinceEpoch}';
                    final newProject = widget.project.updateSpace(
                      newSpaceId,
                      SpaceGeometry.empty(newSpaceId, name),
                    );
                    await ref
                        .read(projectRepositoryProvider)
                        .saveProject(newProject);
                    ref.invalidate(projectByIdProvider(widget.projectId));
                  }
                },
                child: const Text('Crear Espacio BIM'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _showProjectInfo(BuildContext context, Project project) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        key: const Key('dialog_info_proyecto'),
        title: const Text('Información del Proyecto'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (project.bimCode != null) ...[
              _InfoRow(label: 'Código BIM', value: project.bimCode!),
              const SizedBox(height: 6),
            ],
            _InfoRow(label: 'Nombre', value: project.title),
            if (project.description.isNotEmpty) ...[
              const SizedBox(height: 6),
              _InfoRow(label: 'Descripción', value: project.description),
            ],
            if (project.discipline.isNotEmpty) ...[
              const SizedBox(height: 6),
              _InfoRow(label: 'Disciplina', value: project.discipline),
            ],
            if (project.author.isNotEmpty) ...[
              const SizedBox(height: 6),
              _InfoRow(label: 'Autor', value: project.author),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cerrar'),
          ),
        ],
      ),
    );
  }
}

// ─── SECTION HEADER ───────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  final IconData icon;
  final String label;
  final int count;

  const _SectionHeader({
    required this.icon,
    required this.label,
    required this.count,
  });

  @override
  Widget build(BuildContext context) {
    final isDesktop = MediaQuery.of(context).size.width > 900;
    return Padding(
      padding: EdgeInsets.only(
        left: isDesktop ? 24 : 16,
        right: isDesktop ? 24 : 16,
        top: 20,
        bottom: 10,
      ),
      child: Row(
        children: [
          Icon(icon, size: 16, color: LevonColors.navy),
          const SizedBox(width: 8),
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.8,
              color: LevonColors.textSecondary,
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: LevonColors.navy.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '$count',
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: LevonColors.navy,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── CREATE SPACE FAB ─────────────────────────────────────────────────────────

class _CreateSpaceFab extends StatelessWidget {
  final VoidCallback onNewSpace;
  final VoidCallback onNewCollection;
  const _CreateSpaceFab(
      {required this.onNewSpace, required this.onNewCollection});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      key: const Key('fab_crear_espacio'),
      onSelected: (value) {
        if (value == 'nuevo_espacio') onNewSpace();
        if (value == 'registro_fotografico') onNewCollection();
      },
      offset: const Offset(0, -140),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(LevonRadius.md),
      ),
      itemBuilder: (_) => [
        const PopupMenuItem(
          key: Key('menu_nuevo_espacio'),
          value: 'nuevo_espacio',
          child: Row(
            children: [
              Icon(Icons.layers_outlined, size: 18),
              SizedBox(width: 10),
              Text('Nuevo Espacio'),
            ],
          ),
        ),
        const PopupMenuItem(
          key: Key('menu_registro_fotografico'),
          value: 'registro_fotografico',
          child: Row(
            children: [
              Icon(Icons.camera_alt_outlined, size: 18),
              SizedBox(width: 10),
              Text('Registro Fotográfico'),
            ],
          ),
        ),
        const PopupMenuDivider(),
        const PopupMenuItem<String>(
          key: Key('menu_implantacion'),
          enabled: false,
          child: Row(
            children: [
              Icon(Icons.map_outlined, size: 18, color: Color(0xFFB0B8CC)),
              SizedBox(width: 10),
              Text('Implantación',
                  style: TextStyle(color: Color(0xFFB0B8CC))),
            ],
          ),
        ),
      ],
      child: Container(
        key: const Key('fab_crear_espacio_btn'),
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        decoration: BoxDecoration(
          color: LevonColors.navy,
          borderRadius: BorderRadius.circular(LevonRadius.pill),
          boxShadow: LevonShadow.float,
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.add, color: Colors.white, size: 22),
            SizedBox(width: 8),
            Text(
              'Crear',
              style: TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.w700,
                fontSize: 15,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── INFO ROW ─────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  const _InfoRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 90,
          child: Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              color: LevonColors.textSecondary,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: const TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: LevonColors.textPrimary,
            ),
          ),
        ),
      ],
    );
  }
}

// ─── COLLECTION CARD ──────────────────────────────────────────────────────────

class _CollectionCard extends StatelessWidget {
  final PhotoCollection collection;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const _CollectionCard({
    super.key,
    required this.collection,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Thumbnail / placeholder ────────────────────────────────────
            Expanded(child: _CollectionThumbnail(collection: collection)),

            // ── Info ───────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    collection.bimCode,
                    style: const TextStyle(
                      fontSize: 9,
                      fontFamily: 'monospace',
                      letterSpacing: 1.2,
                      color: LevonColors.navy,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    collection.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: LevonColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    children: [
                      const Icon(Icons.photo_library_outlined,
                          size: 12, color: LevonColors.textSecondary),
                      const SizedBox(width: 4),
                      Text(
                        '${collection.photoCount} foto${collection.photoCount == 1 ? '' : 's'}',
                        style: const TextStyle(
                          fontSize: 11,
                          color: LevonColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── COLLECTION THUMBNAIL ─────────────────────────────────────────────────────

class _CollectionThumbnail extends StatelessWidget {
  final PhotoCollection collection;
  const _CollectionThumbnail({required this.collection});

  @override
  Widget build(BuildContext context) {
    // Show first available thumbnail from the collection
    final thumbPath = collection.photos
        .map((p) => p.thumbnailPath ?? p.previewImagePath ?? p.originalImagePath)
        .where((path) => File(path).existsSync())
        .firstOrNull;

    if (thumbPath != null) {
      return Image.file(
        File(thumbPath),
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _placeholder(),
      );
    }
    return _placeholder();
  }

  Widget _placeholder() {
    return Container(
      color: LevonColors.navy.withValues(alpha: 0.06),
      child: Center(
        child: Icon(
          Icons.camera_alt_outlined,
          size: 48,
          color: LevonColors.navy.withValues(alpha: 0.35),
        ),
      ),
    );
  }
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

class _SpaceEmptyState extends StatelessWidget {
  const _SpaceEmptyState({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(
      key: Key('space_empty_state_content'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.layers_outlined,
              size: 64, color: LevonColors.textDisabled),
          SizedBox(height: 16),
          Text(
            'Sin contenido',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: LevonColors.textSecondary,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Crea un espacio o una colección fotográfica',
            style: TextStyle(
              color: LevonColors.textDisabled,
              fontSize: 13,
            ),
          ),
        ],
      ),
    );
  }
}
