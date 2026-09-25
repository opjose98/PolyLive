import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:levon/features/photos/domain/photo_collection.dart';
import 'package:levon/features/photos/domain/photo_entity.dart';
import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/features/photos/application/photo_capture_service.dart';
import 'package:levon/features/photos/application/photo_storage_service.dart';
import 'package:levon/features/photos/application/add_photo_to_collection_use_case.dart';
import 'package:levon/features/photos/application/remove_photo_use_case.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/photos/ui/widgets/photo_card.dart';
import 'package:levon/features/photos/ui/widgets/photo_properties_panel.dart';
import 'package:levon/features/photos/ui/widgets/photo_viewer_dialog.dart';

/// Pantalla SPDS — colección fotográfica BIM.
///
/// Muestra las fotos de [collectionId] en una cuadrícula con thumbnails.
/// Tap → visor de imagen a pantalla completa.
/// Long-press → panel de propiedades BIM.
class PhotoCollectionScreen extends ConsumerStatefulWidget {
  final String projectId;
  final String collectionId;

  const PhotoCollectionScreen({
    super.key,
    required this.projectId,
    required this.collectionId,
  });

  @override
  ConsumerState<PhotoCollectionScreen> createState() =>
      _PhotoCollectionScreenState();
}

class _PhotoCollectionScreenState
    extends ConsumerState<PhotoCollectionScreen> {
  static const _addUC = AddPhotoToCollectionUseCase();
  static const _removeUC = RemovePhotoUseCase();
  static const _storage = PhotoStorageService();

  bool _capturing = false;

  // ── Project helper ──────────────────────────────────────────────────────────

  /// Returns the in-memory project or loads it from disk if projectProvider is
  /// null (when navigating from ProjectWorkspaceScreen without EditorScreen).
  Future<Project?> _resolveProject() async {
    final inMemory = ref.read(projectProvider);
    if (inMemory != null) return inMemory;
    try {
      return await ref.read(projectRepositoryProvider).loadProject(widget.projectId);
    } catch (_) {
      return null;
    }
  }

  /// Saves the project to disk and updates all relevant providers.
  Future<void> _persistProject(
    dynamic updatedProject,
    PhotoCollection updatedCollection,
  ) async {
    ref.read(projectProvider.notifier).state = updatedProject;
    ref.read(photoCollectionsProvider.notifier).upsertCollection(updatedCollection);
    try {
      await ref.read(projectRepositoryProvider).saveProject(updatedProject);
    } catch (_) {}
  }

  // ── Collection helper ───────────────────────────────────────────────────────

  PhotoCollection? get _collection => ref
      .read(photoCollectionsProvider)
      .where((c) => c.id == widget.collectionId)
      .firstOrNull;

  // ── Capture actions ─────────────────────────────────────────────────────────

  Future<void> _captureCamera() async {
    final collection = _collection;
    if (collection == null) return;
    setState(() => _capturing = true);
    try {
      final svc = ref.read(photoCaptureServiceProvider);
      final result = await svc.captureFromCamera(
        projectId: widget.projectId,
        collection: collection,
      );
      if (mounted) await _handleResult(result);
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _pickGallery() async {
    final collection = _collection;
    if (collection == null) return;
    setState(() => _capturing = true);
    try {
      final svc = ref.read(photoCaptureServiceProvider);
      final results = await svc.pickMultipleFromGallery(
        projectId: widget.projectId,
        collection: collection,
      );
      if (mounted) {
        for (final r in results) {
          await _handleResult(r);
        }
      }
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  Future<void> _handleResult(PhotoCaptureResult result) async {
    switch (result) {
      case PhotoCaptureSuccess(:final photo):
        await _addPhoto(photo);
      case PhotoCaptureError(:final message):
        _showSnack('Error: $message', isError: true);
      case PhotoCapturePermissionDenied():
        _showSnack('Permiso denegado. Actívalo en Ajustes.', isError: true);
      case PhotoCaptureCancelled():
        break;
    }
  }

  Future<void> _addPhoto(PhotoEntity photo) async {
    final project = await _resolveProject();
    if (project == null) return;

    final result = _addUC.execute(
      project,
      collectionId: widget.collectionId,
      photo: photo,
    );
    await _persistProject(result.updatedProject, result.updatedCollection);
  }

  Future<void> _deletePhoto(String photoId) async {
    final project = await _resolveProject();
    if (project == null) return;

    final updated = _removeUC.execute(
      project,
      collectionId: widget.collectionId,
      photoId: photoId,
    );
    final updatedCollection = updated.photoCollections
        .where((c) => c.id == widget.collectionId)
        .firstOrNull;
    if (updatedCollection != null) {
      await _persistProject(updated, updatedCollection);
    }

    // Sync in-memory markers provider (cascade already applied in project object)
    ref.read(photoMarkersProvider.notifier).removeMarkersForPhoto(photoId);

    // Clean up image files from disk
    try {
      await _storage.deletePhotoFiles(
        projectId: widget.projectId,
        photoId: photoId,
      );
    } catch (_) {}
  }

  Future<void> _updatePhoto(PhotoEntity updated) async {
    final project = await _resolveProject();
    if (project == null) return;

    final updatedCollections = [
      for (final c in project.photoCollections)
        if (c.id == widget.collectionId) c.updatePhoto(updated) else c,
    ];
    final updatedProject = project.copyWith(photoCollections: updatedCollections);
    final updatedCollection = updatedCollections
        .where((c) => c.id == widget.collectionId)
        .firstOrNull;
    if (updatedCollection != null) {
      await _persistProject(updatedProject, updatedCollection);
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        backgroundColor: isError ? LevonColors.errorRed : null,
      ),
    );
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final collections = ref.watch(photoCollectionsProvider);
    final collection =
        collections.where((c) => c.id == widget.collectionId).firstOrNull;

    if (collection == null) {
      return Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_new, size: 18),
            onPressed: () => context.pop(),
          ),
        ),
        body: const Center(child: Text('Colección no encontrada')),
      );
    }

    final isDesktop = MediaQuery.of(context).size.width > 900;
    final crossAxisCount = isDesktop ? 4 : 3;

    return Scaffold(
      appBar: _buildAppBar(context, collection),
      floatingActionButton: _capturing
          ? const FloatingActionButton(
              onPressed: null,
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: Colors.white),
              ),
            )
          : _CaptureSpeedDial(
              onCamera: _captureCamera,
              onGallery: _pickGallery,
            ),
      body: collection.isEmpty
          ? const _PhotoEmptyState()
          : GridView.builder(
              key: const Key('photo_grid'),
              padding: EdgeInsets.only(
                left: isDesktop ? 24 : 12,
                right: isDesktop ? 24 : 12,
                top: isDesktop ? 24 : 12,
                bottom: 88,
              ),
              // Allow Flutter to evict off-screen cells — thumbnails are
              // re-decoded from disk cache rather than kept in widget memory.
              addAutomaticKeepAlives: false,
              gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: crossAxisCount,
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
                childAspectRatio: 0.85,
              ),
              itemCount: collection.photos.length,
              itemBuilder: (ctx, i) {
                final photo = collection.photos[i];
                return PhotoCard(
                  key: Key('photo_card_${photo.id}'),
                  photo: photo,
                  // Tap → fullscreen viewer
                  onTap: () => _openPhotoViewer(context, photo),
                  // Long press → BIM properties panel
                  onLongPress: () => _showPhotoProperties(context, photo),
                  onDelete: () => _confirmDelete(context, photo),
                );
              },
            ),
    );
  }

  AppBar _buildAppBar(BuildContext context, PhotoCollection collection) {
    return AppBar(
      leading: IconButton(
        key: const Key('btn_volver_coleccion'),
        icon: const Icon(Icons.arrow_back_ios_new, size: 18),
        onPressed: () => context.pop(),
      ),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            collection.name,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          Text(
            '${collection.bimCode} · ${collection.photoCount} foto${collection.photoCount == 1 ? '' : 's'}',
            style: TextStyle(
              fontSize: 10,
              color: Colors.white.withValues(alpha: 0.7),
              fontFamily: 'monospace',
              letterSpacing: 1.0,
            ),
          ),
        ],
      ),
    );
  }

  // ── Tap: full-screen photo viewer ───────────────────────────────────────────

  void _openPhotoViewer(BuildContext context, PhotoEntity photo) {
    showPhotoViewerDialog(
      context,
      photo,
      onInfo: () => _showPhotoProperties(context, photo),
    );
  }

  // ── Long-press: BIM properties panel ───────────────────────────────────────

  void _showPhotoProperties(BuildContext context, PhotoEntity photo) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius:
            BorderRadius.vertical(top: Radius.circular(LevonRadius.lg)),
      ),
      builder: (_) => PhotoPropertiesPanel(
        photo: photo,
        collectionId: widget.collectionId,
        onDelete: () {
          Navigator.pop(context);
          _deletePhoto(photo.id);
        },
        onUpdate: (updated) {
          Navigator.pop(context);
          _updatePhoto(updated);
        },
      ),
    );
  }

  Future<void> _confirmDelete(BuildContext context, PhotoEntity photo) async {
    final markerCount = ref
        .read(photoMarkersProvider)
        .where((m) => m.linkedPhotoId == photo.id)
        .length;
    final cascadeNote = markerCount > 0
        ? '\n\nEsto también eliminará $markerCount marcador${markerCount == 1 ? '' : 'es'} en planta.'
        : '';

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar foto'),
        content: Text('¿Eliminar ${photo.bimCode} — ${photo.name}?$cascadeNote'),
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
    if (confirmed == true) await _deletePhoto(photo.id);
  }
}

// ─── CAPTURE SPEED DIAL ───────────────────────────────────────────────────────

class _CaptureSpeedDial extends StatelessWidget {
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  const _CaptureSpeedDial({required this.onCamera, required this.onGallery});

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      key: const Key('fab_captura'),
      onSelected: (v) {
        if (v == 'camera') onCamera();
        if (v == 'gallery') onGallery();
      },
      offset: const Offset(0, -110),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(LevonRadius.md),
      ),
      itemBuilder: (_) => [
        const PopupMenuItem(
          value: 'camera',
          child: Row(children: [
            Icon(Icons.camera_alt_outlined, size: 18),
            SizedBox(width: 10),
            Text('Cámara'),
          ]),
        ),
        const PopupMenuItem(
          value: 'gallery',
          child: Row(children: [
            Icon(Icons.photo_library_outlined, size: 18),
            SizedBox(width: 10),
            Text('Galería'),
          ]),
        ),
      ],
      child: Container(
        key: const Key('fab_captura_btn'),
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
            Icon(Icons.add_a_photo_outlined, color: Colors.white, size: 20),
            SizedBox(width: 8),
            Text(
              'Añadir foto',
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

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────

class _PhotoEmptyState extends StatelessWidget {
  const _PhotoEmptyState();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.camera_alt_outlined,
              size: 64, color: LevonColors.textDisabled),
          SizedBox(height: 16),
          Text(
            'Sin fotografías',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w600,
              color: LevonColors.textSecondary,
            ),
          ),
          SizedBox(height: 6),
          Text(
            'Usa "Añadir foto" para capturar con la cámara\no importar desde la galería',
            textAlign: TextAlign.center,
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
