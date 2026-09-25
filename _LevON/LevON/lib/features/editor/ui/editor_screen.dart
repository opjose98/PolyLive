import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'dart:io' show Platform;
import 'package:file_picker/file_picker.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:vector_math/vector_math.dart' as vmath;

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/rooms/domain/room.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/photos/domain/photo_marker_entity.dart';
import 'package:levon/features/photos/application/add_photo_to_collection_use_case.dart';
import 'package:levon/features/photos/application/photo_capture_service.dart';
import 'package:levon/features/editor/application/editor_controller.dart';
import 'package:levon/features/walls/domain/column.dart';
import 'package:levon/features/editor/ui/static_layer_painter.dart';
import 'package:levon/features/editor/ui/preview_layer_painter.dart';
import 'package:levon/features/overlays/labels_layer_painter.dart';
import 'package:levon/features/walls/ui/wall_elevation_editor.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/history_notifier.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/overlays/properties_panel.dart';
import 'package:levon/features/overlays/settings/settings_overlay.dart';
import 'package:levon/features/overlays/contextual_ribbon.dart';
import 'package:levon/features/viewport/space_bounds.dart';

class EditorScreen extends ConsumerStatefulWidget {
  final String projectId;
  final String workspaceId;

  const EditorScreen({
    super.key,
    required this.projectId,
    required this.workspaceId,
  });

  @override
  ConsumerState<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends ConsumerState<EditorScreen> {
  static const double _kMinScale = 10.0;
  static const double _kMaxScale = 400.0;

  // Canvas transform — local state, cambia a 60fps durante gestos
  double _scale = kDefaultCanvasScale;
  Offset _panOffset = kDefaultCanvasPan;
  Size _canvasSize = Size.zero;

  // Drawing state — local, efímero durante el drag
  vmath.Vector2? _drawStart;
  vmath.Vector2? _drawPreview;

  // Pinch zoom — estado capturado al inicio del gesto multitouch
  bool _isPinching = false;
  double _scaleAtPinchStart = 1.0;

  // Double-tap — posición capturada en onDoubleTapDown para usarla en onDoubleTap
  Offset? _doubleTapPosition;

  // Manipulación directa (SELECT mode)
  bool _isDraggingHandle = false;

  // Soft-delete — primer tap marca pendiente (rojo), segundo tap elimina.
  String? _deletePendingId;
  bool _didInitialZoom = false;

  // Photo placement — estado pendiente entre captura y confirmación final.
  PhotoMarkerEntity? _pendingMarker;
  String? _pendingPhotoId;
  String? _pendingCollectionId;



  late final EditorController _ctrl;
  late final FocusNode _focusNode;
  final GlobalKey _canvasKey = GlobalKey();

  bool get _isDesktop =>
      Platform.isWindows || Platform.isMacOS || Platform.isLinux;

  @override
  void initState() {
    super.initState();
    _ctrl = EditorController(ref);
    _focusNode = FocusNode();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _focusNode.requestFocus();
      _loadProject();
      // Resetear estado de guardado al abrir el editor (evita estado remanente).
      ref.read(saveStatusProvider.notifier).state = SaveStatus.idle;
    });
  }

  Future<void> _loadProject() async {
    final repo = ref.read(projectRepositoryProvider);
    try {
      final project = await repo.loadProject(widget.projectId);
      if (!mounted) return;
      ref.read(projectProvider.notifier).state = project;

      // Establecer el espacio activo
      ref.read(activeSpaceIdProvider.notifier).state = widget.workspaceId;

      // Cargar geometría del espacio específico
      final space = project.spaces[widget.workspaceId] ??
          SpaceGeometry.empty(widget.workspaceId, 'Espacio');

      ref.read(wallsProvider.notifier).setWalls(space.walls);
      ref.read(columnsProvider.notifier).setColumns(space.columns);
      ref
          .read(wallElevationsProvider.notifier)
          .setElevations(space.wallElevations);
      ref
          .read(photoCollectionsProvider.notifier)
          .setCollections(project.photoCollections);
      ref
          .read(photoMarkersProvider.notifier)
          .setMarkers(project.photoMarkers);

      ref.read(historyProvider.notifier).clear();
      // Sincronizar nombre del proyecto con settings
      ref.read(projectSettingsProvider.notifier).updateSettings(
            ref.read(projectSettingsProvider).copyWith(
                  info: ref.read(projectSettingsProvider).info.copyWith(
                        projectName: project.title,
                      ),
                ),
          );

      // Auto-zoom fit al cargar si hay geometría
      _didInitialZoom = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _zoomToFit();
      });
    } catch (_) {
      // Proyecto nuevo sin archivo aún — los providers quedan en estado vacío.
    }
  }

  /// Ajusta el zoom y la posición para mostrar todos los elementos.
  void _zoomToFit() {
    final walls = ref.read(wallsProvider);
    final columns = ref.read(columnsProvider);
    if (walls.isEmpty && columns.isEmpty) return;

    final bounds = SpaceBounds.fromGeometry(walls: walls, columns: columns);
    if (bounds == null) return;

    setState(() {
      _scale = bounds.fitScale(_canvasSize, padding: 80);
      _panOffset = -bounds.center;
    });
  }

  /// Cambia a la vista de elevación del muro indicado.
  void _openWallElevation(Wall wall) {
    ref.read(activeElevationWallIdProvider.notifier).state = wall.id;
    ref.read(editorViewModeProvider.notifier).state =
        EditorViewMode.wallElevation;
    setState(() {
      _scale = kDefaultCanvasScale;
      _panOffset = Offset.zero;
    });
  }

  /// Vuelve a la vista de planta, mostrando diálogo de validación si hay overlaps inválidos.
  Future<void> _closeWallElevation() async {
    final wallId = ref.read(activeElevationWallIdProvider);
    if (wallId != null && mounted) {
      final wall =
          ref.read(wallsProvider).where((w) => w.id == wallId).firstOrNull;
      if (wall != null) {
        const uc = EditWallElevationUseCase();
        final elev = uc.getOrCreate(
            wall.id, wall.height, ref.read(wallElevationsProvider));
        final invalidIds = _findInvalidOverlapIds(elev);
        if (invalidIds.isNotEmpty && mounted) {
          final action = await showDialog<String>(
            context: context,
            builder: (_) => AlertDialog(
              title: const Text('Superposiciones inválidas'),
              content: Text(
                  'Hay ${invalidIds.length} apertura(s) con solapamientos inválidos.\n'
                  '¿Deseas limpiarlas antes de salir?'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context, 'cancel'),
                  child: const Text('Cancelar'),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, 'keep'),
                  child: const Text('Continuar sin limpiar'),
                ),
                FilledButton(
                  onPressed: () => Navigator.pop(context, 'clean'),
                  child: const Text('Limpiar y salir'),
                ),
              ],
            ),
          );
          if (action == 'cancel' || action == null) return;
          if (action == 'clean') {
            _cleanInvalidOverlaps(elev);
          }
        }
      }
    }
    ref.read(editorViewModeProvider.notifier).state = EditorViewMode.plan;
    ref.read(activeElevationWallIdProvider.notifier).state = null;
    _ctrl.clearSelection();
    _zoomToFit();
  }

  /// IDs de aperturas con overlaps inválidos (Door↔Door/Window, Window↔Window/Door).
  List<String> _findInvalidOverlapIds(WallElevation elev) {
    final invalidIds = <String>{};
    final ops = elev.openings;
    for (int i = 0; i < ops.length; i++) {
      for (int j = i + 1; j < ops.length; j++) {
        final a = ops[i];
        final b = ops[j];
        if (a.type == OpeningType.opening || b.type == OpeningType.opening) {
          continue;
        }
        final overlapX =
            a.xOffset < b.xEnd - 1e-6 && a.xEnd > b.xOffset + 1e-6;
        final overlapY =
            a.sillHeight < b.sillEnd - 1e-6 && a.sillEnd > b.sillHeight + 1e-6;
        if (overlapX && overlapY) {
          invalidIds.add(a.id);
          invalidIds.add(b.id);
        }
      }
    }
    return invalidIds.toList();
  }

  /// Elimina aperturas inválidas desde la última creada hacia atrás hasta limpiar todos los overlaps.
  void _cleanInvalidOverlaps(WallElevation elev) {
    const uc = EditWallElevationUseCase();
    var current = elev;
    while (true) {
      final ids = _findInvalidOverlapIds(current);
      if (ids.isEmpty) break;
      // Eliminar la última apertura conflictiva en la lista
      final toRemove = current.openings.reversed
          .firstWhere((o) => ids.contains(o.id), orElse: () => current.openings.last);
      current = uc.removeOpening(current, toRemove.id);
    }
    ref.read(wallElevationsProvider.notifier).upsertElevation(current);
  }

  @override
  void dispose() {
    _focusNode.dispose();
    // Forzar guardado inmediato al cerrar el editor — evita pérdida del trabajo
    // de los últimos 30 segundos si el debounce no había disparado aún.
    final project = ref.read(currentProjectSnapshotProvider);
    if (project != null) {
      ref.read(projectRepositoryProvider).autosaveProject(project);
    }
    super.dispose();
  }

  // ── COORDINATE UTILS ──────────────────────────────────────────────────────

  vmath.Vector2 _screenToWorld(Offset globalPosition) {
    Offset local = globalPosition;
    if (_canvasKey.currentContext != null) {
      final box = _canvasKey.currentContext!.findRenderObject() as RenderBox?;
      if (box != null) {
        local = box.globalToLocal(globalPosition);
      }
    }
    return vmath.Vector2(
      (local.dx - (_canvasSize.width / 2 + _panOffset.dx)) / _scale,
      (local.dy - (_canvasSize.height / 2 + _panOffset.dy)) / _scale,
    );
  }

  void _fitToView() {
    setState(() {
      _scale = kDefaultCanvasScale;
      _panOffset = Offset.zero;
    });
  }

  // ── GESTOS ────────────────────────────────────────────────────────────────

  void _onTapDown(TapDownDetails d) {
    final mode = ref.read(editorModeProvider);

    if (mode == EditorMode.select) {
      final worldPt = _screenToWorld(d.globalPosition);
      _ctrl.handleTap(worldPt, _scale);
    }

    if (mode == EditorMode.delete) {
      final worldPt = _screenToWorld(d.globalPosition);
      final hit = _ctrl.handleTapForDelete(worldPt, _scale);
      if (hit == null) {
        // Tap en vacío → limpiar pendiente
        setState(() => _deletePendingId = null);
        _ctrl.clearSelection();
        return;
      }
      final hitId = hit is Wall
          ? (hit).id
          : hit is ArchitecturalColumn
              ? (hit).id
              : null;
      if (hitId != null && hitId == _deletePendingId) {
        // Segundo tap sobre el mismo elemento → eliminar
        setState(() => _deletePendingId = null);
        _ctrl.deleteSelected();
      } else {
        // Primer tap → marcar como pendiente
        setState(() => _deletePendingId = hitId);
      }
    }
  }

  void _onScaleStart(ScaleStartDetails d) {
    _isPinching = d.pointerCount > 1;
    if (_isPinching) {
      _scaleAtPinchStart = _scale;
      return;
    }

    final mode = ref.read(editorModeProvider);
    final method = ref.read(creationMethodProvider);
    final subMode = ref.read(drawSubModeProvider);

    if (mode == EditorMode.draw) {
      final snapped = _ctrl.snap(_screenToWorld(d.focalPoint), _scale,
          drawFrom: _drawStart);

      if (method == CreationMethod.pointToPoint &&
          (subMode == DrawSubMode.wall || subMode == DrawSubMode.partition)) {
        if (_drawStart == null) {
          setState(() {
            _drawPreview = snapped;
          });
        } else {
          setState(() {
            _drawPreview = snapped;
          });
        }
      } else {
        setState(() {
          _drawStart = snapped;
          _drawPreview = snapped;
        });
      }
    } else if (mode == EditorMode.select) {
      final selected = ref.read(selectedObjectProvider);
      if (selected != null) {
        final worldPt = _screenToWorld(d.focalPoint);
        _isDraggingHandle = _ctrl.startManipulation(worldPt, _scale);
      }
    }
    // En modo delete o view, el scale start solo registra la posición táctil.
  }

  void _onScaleUpdate(ScaleUpdateDetails d) {
    if (d.pointerCount > 1 || _isPinching) {
      // ── ZOOM FOCAL POINT CORRECTION ───────────────────────────────
      // Fórmula: el punto focal debe quedar fijo en pantalla durante el zoom.
      //
      // Sea F = punto focal en pantalla, P = panOffset, S = scale.
      // Coordenada mundo del focal point:  W = (F - center - P) / S
      // Tras el nuevo scale S':            P' = F - center - W * S'
      //                                       = F - center - (F - center - P) * S'/S
      //
      // Simplificado con centro de canvas como origen del sistema de referencia:
      //   newPan = focalPoint - (focalPoint - oldPan) * (newScale / oldScale)
      // ─────────────────────────────────────────────────────────────
      final oldScale = _scale;
      final newScale =
          (_scaleAtPinchStart * d.scale).clamp(_kMinScale, _kMaxScale);

      // Obtener posición focal en coordenadas locales relativas al canvas
      Offset focalLocal = d.focalPoint;
      if (_canvasKey.currentContext != null) {
        final box = _canvasKey.currentContext!.findRenderObject() as RenderBox?;
        if (box != null) {
          focalLocal = box.globalToLocal(d.focalPoint);
        }
      }

      final center = Offset(_canvasSize.width / 2, _canvasSize.height / 2);
      final focalFromCenter = focalLocal - center;

      setState(() {
        // 1. Compensar traslación para mantener el focal point fijo
        _panOffset = focalFromCenter -
            (focalFromCenter - _panOffset) * (newScale / oldScale);
        // 2. Aplicar nueva escala
        _scale = newScale;
      });
      return;
    }

    final mode = ref.read(editorModeProvider);
    if (mode == EditorMode.draw) {
      final snapped = _ctrl.snap(
        _screenToWorld(d.focalPoint),
        _scale,
        drawFrom: _drawStart,
      );
      setState(() {
        _drawPreview = snapped;
      });
    } else if (mode == EditorMode.view || mode == EditorMode.delete) {
      // Pan libre en modo vista y modo eliminar
      setState(() => _panOffset += d.focalPointDelta);
    } else if (mode == EditorMode.select) {
      if (_isDraggingHandle) {
        final worldPt = _screenToWorld(d.focalPoint);
        _ctrl.updateManipulation(worldPt, _scale);
      } else {
        setState(() => _panOffset += d.focalPointDelta);
      }
    }
  }

  void _onScaleEnd(ScaleEndDetails d) {
    if (_isPinching) {
      _isPinching = false;
      return;
    }



    final mode = ref.read(editorModeProvider);
    final method = ref.read(creationMethodProvider);
    final subMode = ref.read(drawSubModeProvider);

    if (mode == EditorMode.draw) {
      if (subMode == DrawSubMode.photo) {
        final worldPos = _drawPreview;
        if (_pendingMarker != null) {
          // Phase 2: second tap confirms placement at current cursor position.
          _confirmPendingMarker(worldPos);
        } else {
          setState(() {
            _drawStart = null;
            _drawPreview = null;
          });
          if (worldPos != null) _capturePhotoForPlacement(worldPos);
        }
      } else if (method == CreationMethod.pointToPoint &&
          (subMode == DrawSubMode.wall || subMode == DrawSubMode.partition)) {
        if (_drawStart == null) {
          setState(() {
            _drawStart = _drawPreview;
          });
        } else {
          if (_drawPreview != null) {
            _ctrl.commitDrawing(_drawStart!, _drawPreview!);
          }
          setState(() {
            _drawStart = null;
            _drawPreview = null;
          });
        }
      } else {
        if (_drawStart != null && _drawPreview != null) {
          _ctrl.commitDrawing(_drawStart!, _drawPreview!);
        }
        setState(() {
          _drawStart = null;
          _drawPreview = null;
        });
      }
    } else if (mode == EditorMode.select) {
      if (_isDraggingHandle) {
        _ctrl.commitManipulation();
        _isDraggingHandle = false;
      }
    }
  }

  void _onLongPressStart(LongPressStartDetails d) {
    if (_isDesktop) return;
    if (ref.read(editorViewModeProvider) == EditorViewMode.wallElevation) return;
    final mode = ref.read(editorModeProvider);

    if (mode == EditorMode.draw) {
      if (_pendingMarker != null) {
        // Long press while a photo is pending → ask to cancel + optionally delete photo.
        _cancelPendingMarker();
      } else {
        // Long press en modo dibujo cancela el trazo activo y cambia a vista.
        _ctrl.switchMode(EditorMode.view);
        setState(() {
          _drawStart = null;
          _drawPreview = null;
        });
      }
      return;
    }

    if (mode == EditorMode.select) {
      // Long press en select: abrir panel de propiedades del elemento seleccionado
      final selected = ref.read(selectedObjectProvider);
      if (selected != null) {
        _showPropertiesSheet(selected);
      } else {
        // Intentar seleccionar en la posición de long press primero
        final worldPt = _screenToWorld(d.globalPosition);
        final hit = _ctrl.handleTap(worldPt, _scale);
        if (hit != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted) _showPropertiesSheet(hit);
          });
        }
      }
    }
  }

  // ── PHOTO PLACEMENT ───────────────────────────────────────────────────────

  Future<void> _capturePhotoForPlacement(vmath.Vector2 worldPos) async {
    final collections = ref.read(photoCollectionsProvider);
    if (collections.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
              content: Text('Crea una colección fotográfica primero')),
        );
      }
      return;
    }

    final selectedId = ref.read(selectedPhotoCollectionIdProvider);
    final targetCollection =
        collections.where((c) => c.id == selectedId).firstOrNull ??
            collections.first;
    final source = ref.read(photoInsertSourceProvider);

    final project = ref.read(projectProvider);
    if (project == null || !mounted) return;

    final svc = ref.read(photoCaptureServiceProvider);
    final PhotoCaptureResult result;
    if (source == 'camera') {
      result = await svc.captureFromCamera(
          projectId: project.id, collection: targetCollection);
    } else {
      result = await svc.pickFromGallery(
          projectId: project.id, collection: targetCollection);
    }

    if (!mounted) return;

    switch (result) {
      case PhotoCaptureSuccess(:final photo):
        const addUC = AddPhotoToCollectionUseCase();
        final addResult = addUC.execute(
          project,
          collectionId: targetCollection.id,
          photo: photo,
        );

        // Phase 1: photo is added to collection but marker is NOT committed yet.
        // The user must tap again (or drag and tap) to confirm placement.
        final marker = PhotoMarkerEntity(
          linkedPhotoId: photo.id,
          collectionId: targetCollection.id,
          spaceId: ref.read(activeSpaceIdProvider),
          x: worldPos.x,
          y: worldPos.y,
        );

        ref
            .read(photoCollectionsProvider.notifier)
            .upsertCollection(addResult.updatedCollection);
        ref.read(projectProvider.notifier).state = addResult.updatedProject;

        setState(() {
          _pendingMarker = marker;
          _pendingPhotoId = photo.id;
          _pendingCollectionId = targetCollection.id;
        });
        ref.read(pendingMarkerPendingProvider.notifier).state = true;
        ref.read(pendingMarkerOrientationProvider.notifier).state = 0.0;

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                '${photo.bimCode} capturada · Toca el plano para colocar'),
            duration: const Duration(seconds: 4),
          ),
        );

      case PhotoCaptureError(:final message):
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Error: $message'),
              backgroundColor: LevonColors.errorRed),
        );

      case PhotoCapturePermissionDenied():
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Permiso denegado. Actívalo en Ajustes.')),
        );

      case PhotoCaptureCancelled():
        break;
    }
  }

  /// Phase 2: commit the pending marker at [finalPos] (or its stored position).
  void _confirmPendingMarker([vmath.Vector2? finalPos]) {
    final marker = _pendingMarker;
    if (marker == null) return;

    final orientation = ref.read(pendingMarkerOrientationProvider);
    final placed = finalPos != null
        ? marker.copyWith(x: finalPos.x, y: finalPos.y, orientation: orientation)
        : marker.copyWith(orientation: orientation);

    ref.read(photoMarkersProvider.notifier).addMarker(placed);
    ref.read(pendingMarkerPendingProvider.notifier).state = false;

    setState(() {
      _pendingMarker = null;
      _pendingPhotoId = null;
      _pendingCollectionId = null;
      _drawStart = null;
      _drawPreview = null;
    });

    final snapshot = ref.read(currentProjectSnapshotProvider);
    if (snapshot != null) {
      ref.read(projectRepositoryProvider).saveProject(snapshot).ignore();
    }

    if (mounted) {
      ScaffoldMessenger.of(context).hideCurrentSnackBar();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Marcador fotográfico colocado')),
      );
    }
  }

  /// Cancel a pending placement. Asks whether to also delete the captured photo.
  Future<void> _cancelPendingMarker() async {
    if (_pendingMarker == null) return;

    final action = await showDialog<String>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Cancelar colocación'),
        content: const Text(
            '¿Desea también eliminar la fotografía del registro?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, 'keep'),
            child: const Text('Conservar foto'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, 'delete'),
            style: FilledButton.styleFrom(
                backgroundColor: LevonColors.errorRed),
            child: const Text('Eliminar foto'),
          ),
        ],
      ),
    );

    if (!mounted) return;

    final photoId = _pendingPhotoId;
    final collId = _pendingCollectionId;

    ref.read(pendingMarkerPendingProvider.notifier).state = false;
    setState(() {
      _pendingMarker = null;
      _pendingPhotoId = null;
      _pendingCollectionId = null;
      _drawStart = null;
      _drawPreview = null;
    });

    if (action == 'delete' && photoId != null && collId != null) {
      final coll = ref
          .read(photoCollectionsProvider)
          .where((c) => c.id == collId)
          .firstOrNull;
      if (coll != null) {
        final updated = coll.copyWith(
          photos: coll.photos.where((p) => p.id != photoId).toList(),
        );
        ref.read(photoCollectionsProvider.notifier).upsertCollection(updated);
        final snapshot = ref.read(currentProjectSnapshotProvider);
        if (snapshot != null) {
          ref.read(projectRepositoryProvider).saveProject(snapshot).ignore();
        }
      }
    }

    ScaffoldMessenger.of(context).hideCurrentSnackBar();
  }

  void _onSecondaryTapDown(TapDownDetails d) {
    final selected = ref.read(selectedObjectProvider);
    if (selected != null) _showContextMenu(d.globalPosition);
  }

  void _onDoubleTapDown(TapDownDetails d) {
    _doubleTapPosition = d.globalPosition;
  }

  void _onDoubleTap() {
    if (ref.read(editorViewModeProvider) == EditorViewMode.wallElevation) return;
    final pos = _doubleTapPosition;
    if (pos == null) return;
    if (ref.read(editorModeProvider) != EditorMode.select) return;
    final worldPt = _screenToWorld(pos);
    final hit = _ctrl.handleTap(worldPt, _scale);
    if (hit is Wall && mounted) {
      _openWallElevation(hit);
    }
  }

  // ── KEYBOARD (DESKTOP) ────────────────────────────────────────────────────

  void _handleKeyEvent(KeyEvent event) {
    if (event is! KeyDownEvent) return;
    final ctrl = HardwareKeyboard.instance.isControlPressed;

    if (event.logicalKey == LogicalKeyboardKey.escape) {
      if (_pendingMarker != null) {
        _cancelPendingMarker();
        return;
      }
      setState(() {
        _drawStart = null;
        _drawPreview = null;
      });
      _ctrl.clearSelection();
      // Salir del modo delete con Escape
      if (ref.read(editorModeProvider) == EditorMode.delete) {
        _ctrl.switchMode(EditorMode.view);
      }
      return;
    }
    if (ctrl && event.logicalKey == LogicalKeyboardKey.comma) {
      showProjectSettings(context);
      return;
    }
    if (ctrl && event.logicalKey == LogicalKeyboardKey.keyZ) {
      _ctrl.undo();
      return;
    }
    if (ctrl && event.logicalKey == LogicalKeyboardKey.keyY) {
      _ctrl.redo();
      return;
    }
    if (ctrl && event.logicalKey == LogicalKeyboardKey.keyS) {
      _saveProject();
      return;
    }
    if (event.logicalKey == LogicalKeyboardKey.delete ||
        event.logicalKey == LogicalKeyboardKey.backspace) {
      _confirmDelete();
      return;
    }

    if (!ctrl) {
      switch (event.logicalKey) {
        case LogicalKeyboardKey.keyV:
          _ctrl.switchMode(EditorMode.view);
        case LogicalKeyboardKey.keyW:
          _ctrl.switchMode(EditorMode.draw);
        case LogicalKeyboardKey.keyS:
          _ctrl.switchMode(EditorMode.select);
        case LogicalKeyboardKey.keyF:
          _fitToView();
      }
    }
  }

  // ── CONTEXT MENU ──────────────────────────────────────────────────────────

  void _showContextMenu(Offset globalPos) {
    final selected = ref.read(selectedObjectProvider);
    showMenu<String>(
      context: context,
      position: RelativeRect.fromLTRB(
          globalPos.dx, globalPos.dy, globalPos.dx + 1, globalPos.dy + 1),
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(LevonRadius.sm)),
      items: [
        if (selected != null) ...[
          const PopupMenuItem(value: 'props', child: Text('Propiedades')),
          const PopupMenuItem(
              value: 'delete',
              child: Text('Eliminar', style: TextStyle(color: Colors.red))),
        ],
        const PopupMenuItem(value: 'fit', child: Text('Ajustar vista  F')),
      ],
    ).then((v) {
      switch (v) {
        case 'props':
          if (!_isDesktop && selected != null) _showPropertiesSheet(selected);
          if (_isDesktop) {
            ref.read(propertiesPanelVisibleProvider.notifier).state = true;
          }
        case 'delete':
          _confirmDelete();
        case 'fit':
          _fitToView();
      }
    });
  }

  // ── SAVE ──────────────────────────────────────────────────────────────────

  Future<void> _saveProject() async {
    if (ref.read(projectProvider) == null) {
      final name = ref.read(projectSettingsProvider).info.projectName;
      ref.read(projectProvider.notifier).state =
          Project(id: widget.projectId, title: name);
    }

    final project = ref.read(currentProjectSnapshotProvider);
    if (project == null) return;

    ref.read(saveStatusProvider.notifier).state = SaveStatus.saving;
    try {
      await ref.read(projectRepositoryProvider).saveProject(project);
      if (!mounted) return;
      ref.read(saveStatusProvider.notifier).state = SaveStatus.saved;
      ref.invalidate(projectByIdProvider(widget.projectId));
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted && ref.read(saveStatusProvider) == SaveStatus.saved) {
          ref.read(saveStatusProvider.notifier).state = SaveStatus.idle;
        }
      });
    } catch (e) {
      if (!mounted) return;
      ref.read(saveStatusProvider.notifier).state = SaveStatus.error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error al guardar: $e'),
          backgroundColor: LevonColors.errorRed,
        ),
      );
    }
  }

  /// Muestra el selector de carpeta y exporta el proyecto en el formato indicado.
  ///
  /// Formatos soportados: 'dxf', 'ifc', 'levon'.
  /// Persiste la última carpeta utilizada para pre-seleccionarla en la próxima exportación.
  Future<void> _exportProject(String format) async {
    final project = ref.read(currentProjectSnapshotProvider);
    if (project == null) return;

    // Obtener la última carpeta usada para pre-seleccionarla
    final prefs = ref.read(globalPrefsServiceProvider);
    final initialDir = await prefs.resolveExportPath();

    // Pedir permisos en Android antes de abrir el selector de archivos
    if (Platform.isAndroid) {
      if (!(await Permission.manageExternalStorage.isGranted) &&
          !(await Permission.storage.isGranted)) {
        final manageStatus = await Permission.manageExternalStorage.request();
        if (!manageStatus.isGranted) {
          final storageStatus = await Permission.storage.request();
          if (!storageStatus.isGranted) {
            if (mounted) {
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                  content: Text(
                      'Permiso de almacenamiento denegado. No se puede exportar.'),
                  backgroundColor: LevonColors.errorRed,
                ),
              );
            }
            return;
          }
        }
      }
    }

    // Abrir selector de carpeta nativo (FilePicker multiplataforma)
    String? targetDir;
    try {
      targetDir = await FilePicker.platform.getDirectoryPath(
        dialogTitle: 'Elegir carpeta de exportación',
        initialDirectory: initialDir,
        lockParentWindow: true,
      );
    } catch (_) {
      // En plataformas donde el picker no está disponible (tests, CI), continuar sin él.
      targetDir = null;
    }

    // Si el usuario canceló, no exportar
    if (targetDir == null) return;

    // Persistir la carpeta elegida como "última usada"
    await prefs.saveLastExportPath(targetDir);

    try {
      final String path;
      switch (format) {
        case 'dxf':
          final dxfPrec =
              ref.read(projectSettingsProvider).precision.exportPrecision;
          path = await ref.read(dxfExporterProvider).exportToDxf(project,
              targetDirectory: targetDir, exportPrecision: dxfPrec);
        case 'json':
          path = await ref
              .read(ifcExportAdapterProvider)
              .exportToIfcJson(project, targetDirectory: targetDir);
        case 'ifc':
          final ifcPrec =
              ref.read(projectSettingsProvider).precision.exportPrecision;
          final targetPath =
              '$targetDir${Platform.pathSeparator}${project.title.replaceAll(' ', '_')}.ifc';
          await ref
              .read(ifcExporterProvider)
              .exportToIfc(project, targetPath, exportPrecision: ifcPrec);
          path = targetPath;
        case 'levon':
          // Exportar el archivo .levon nativo (compartir / editar en otro dispositivo)
          path = await ref
              .read(projectRepositoryProvider)
              .exportLevon(project, targetDirectory: targetDir);
        default:
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                  content: Text('Exportación PDF próximamente disponible')),
            );
          }
          return;
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Exportado: $path'),
            action: SnackBarAction(label: 'OK', onPressed: () {}),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error al exportar: $e'),
            backgroundColor: LevonColors.errorRed,
          ),
        );
      }
    }
  }

  // ── DELETE ────────────────────────────────────────────────────────────────

  /// Confirma y elimina el elemento actualmente seleccionado.
  void _confirmDelete() {
    final selected = ref.read(selectedObjectProvider);
    if (selected == null) return;
    final behavior = ref.read(projectSettingsProvider).behavior;

    if (!behavior.deleteConfirmation) {
      _ctrl.deleteSelected();
      return;
    }

    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Eliminar elemento'),
        content: const Text(
            '¿Estás seguro de que quieres eliminar el elemento seleccionado?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Cancelar')),
          FilledButton(
            style:
                FilledButton.styleFrom(backgroundColor: LevonColors.errorRed),
            onPressed: () {
              Navigator.pop(context);
              _ctrl.deleteSelected();
            },
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
  }

  // ── PROPERTIES SHEET (MOBILE) ─────────────────────────────────────────────

  void _showPropertiesSheet(Object selected) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.42,
        minChildSize: 0.25,
        maxChildSize: 0.85,
        builder: (_, controller) => Container(
          decoration: const BoxDecoration(
            color: LevonColors.surface,
            borderRadius:
                BorderRadius.vertical(top: Radius.circular(LevonRadius.lg)),
          ),
          child: Column(
            children: [
              Container(
                margin: const EdgeInsets.only(top: 10, bottom: 4),
                width: 36,
                height: 4,
                decoration: BoxDecoration(
                  color: LevonColors.divider,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Expanded(
                child: PropertiesPanel(
                  selected: selected,
                  scrollController: controller,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── ESPACIOS UI ────────────────────────────────────────────

  /// Muestra el selector de espacios con botón "+" para agregar uno nuevo.
  void _showEspacioPicker() {
    final project = ref.read(projectProvider);
    if (project == null) return;

    final spaceEntries = project.spaces.entries.toList();

    showModalBottomSheet(
      context: context,
      builder: (sheetCtx) => _StoreyPickerSheet(
        storeys: spaceEntries.map((e) => e.value.name).toList(),
        currentIndex:
            spaceEntries.indexWhere((e) => e.key == widget.workspaceId),
        onSelect: (i) {
          final targetId = spaceEntries[i].key;
          Navigator.of(sheetCtx).pop();
          if (targetId != widget.workspaceId) {
            context.go('/projects/${widget.projectId}/workspaces/$targetId');
          }
        },
        onAdd: () {
          Navigator.of(sheetCtx).pop();
          _addNuevoEspacio();
        },
      ),
    );
  }

  /// Agrega un nuevo espacio numerado (Espacio 2, Espacio 3...).
  Future<void> _addNuevoEspacio() async {
    final project = ref.read(projectProvider);
    if (project == null) return;

    final newName = 'Espacio ${project.spaces.length + 1}';
    final newId = 'space-${DateTime.now().millisecondsSinceEpoch}';

    final newProject =
        project.updateSpace(newId, SpaceGeometry.empty(newId, newName));

    // Guardar y navegar
    await ref.read(projectRepositoryProvider).saveProject(newProject);
    if (mounted) {
      context.go('/projects/${widget.projectId}/workspaces/$newId');
    }
  }

  // ── BUILD ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    // Limpiar pendiente de soft-delete al salir del modo eliminar.
    ref.listen<EditorMode>(editorModeProvider, (prev, next) {
      if (prev == EditorMode.delete && next != EditorMode.delete) {
        if (mounted) setState(() => _deletePendingId = null);
      }
    });

    // Activar autosave: cada vez que el snapshot del proyecto cambia,
    // se agenda un guardado silencioso con debounce de 30 segundos.
    ref.listen<Project?>(currentProjectSnapshotProvider, (_, project) {
      if (project == null) return;
      ref.read(autosaveServiceProvider).schedule(
            project,
            ref.read(projectRepositoryProvider),
          );
    });

    return KeyboardListener(
      key: const Key('editor_keyboard_listener'),
      focusNode: _focusNode,
      onKeyEvent: _handleKeyEvent,
      child: PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) async {
          if (didPop) return;

          final history = ref.read(historyProvider);
          if (history.canUndo) {
            final confirm = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Cambios sin guardar'),
                content:
                    const Text('¿Deseas guardar los cambios antes de salir?'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Descartar',
                        style: TextStyle(color: LevonColors.errorRed)),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Guardar'),
                  ),
                ],
              ),
            );
            if (confirm == null) return; // dismissed dialog
            if (confirm) {
              await _saveProject();
            }
          }
          if (context.mounted) context.pop();
        },
        child: Scaffold(
          key: const Key('editor_scaffold'),
          backgroundColor: LevonColors.canvasBg,
          appBar: _buildAppBar(),
          body: LayoutBuilder(
            builder: (ctx, constraints) {
              _canvasSize = constraints.biggest;
              if (!_didInitialZoom && _canvasSize.width > 0) {
                _didInitialZoom = true;
                WidgetsBinding.instance
                    .addPostFrameCallback((_) => _zoomToFit());
              }
              return _isDesktop ? _buildDesktopLayout() : _buildMobileLayout();
            },
          ),
        ),
      ),
    );
  }

  // ── APPBAR ────────────────────────────────────────────────────────────────

  PreferredSizeWidget _buildAppBar() {
    final project = ref.watch(projectProvider);
    final espacioName = project?.spaces[widget.workspaceId]?.name ?? 'Espacio';
    final viewMode = ref.watch(editorViewModeProvider);

    return AppBar(
      key: const Key('editor_appbar'),
      backgroundColor: LevonColors.navy,
      foregroundColor: Colors.white,
      leading: IconButton(
        key: const Key('btn_volver_editor'),
        icon: const Icon(Icons.arrow_back_ios_new, size: 18),
        tooltip: 'Volver a proyectos',
        onPressed: () async {
          if (viewMode == EditorViewMode.wallElevation) {
            final history = ref.read(historyProvider);
            if (history.canUndo) {
              final confirm = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Cambios en elevación'),
                  content: const Text(
                      '¿Deseas volver a la planta? Los cambios se guardarán automáticamente.'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Cancelar'),
                    ),
                    FilledButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Continuar'),
                    ),
                  ],
                ),
              );
              if (confirm != true) return;
            }
            await _closeWallElevation();
            return;
          }
          final history = ref.read(historyProvider);
          if (history.canUndo) {
            final confirm = await showDialog<bool>(
              context: context,
              builder: (ctx) => AlertDialog(
                title: const Text('Cambios sin guardar'),
                content:
                    const Text('¿Deseas guardar los cambios antes de salir?'),
                actions: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx, false),
                    child: const Text('Descartar',
                        style: TextStyle(color: LevonColors.errorRed)),
                  ),
                  FilledButton(
                    onPressed: () => Navigator.pop(ctx, true),
                    child: const Text('Guardar'),
                  ),
                ],
              ),
            );
            if (confirm == null) return;
            if (confirm) {
              await _saveProject();
            } else {
              // TODO: If descartar, we might need to revert to last saved state
              // or simply rely on the fact that popping doesn't save to the file.
              // For now we just don't save.
            }
          }
          if (mounted) context.pop();
        },
      ),
      title: GestureDetector(
        key: const Key('selector_espacio'),
        onTap: _showEspacioPicker,
        child: Column(
          children: [
            Text(
              ref.watch(projectSettingsProvider).info.projectName,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  espacioName,
                  style: TextStyle(
                      fontSize: 11,
                      color: Colors.white.withValues(alpha: 0.65)),
                ),
                Icon(Icons.expand_more,
                    size: 13, color: Colors.white.withValues(alpha: 0.5)),
              ],
            ),
          ],
        ),
      ),
      actions: [
        IconButton(
          key: const Key('btn_deshacer'),
          icon: const Icon(Icons.undo_rounded),
          tooltip: 'Deshacer  Ctrl+Z',
          onPressed: ref.watch(historyProvider).canUndo ? _ctrl.undo : null,
        ),
        IconButton(
          key: const Key('btn_rehacer'),
          icon: const Icon(Icons.redo_rounded),
          tooltip: 'Rehacer  Ctrl+Y',
          onPressed: ref.watch(historyProvider).canRedo ? _ctrl.redo : null,
        ),
        const SizedBox(width: 4),
        _buildSaveButton(),
        PopupMenuButton<String>(
          key: const Key('menu_exportar'),
          icon: const Icon(Icons.ios_share_rounded),
          tooltip: 'Exportar',
          onSelected: _exportProject,
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'json', child: Text('Exportar JSON BIM')),
            PopupMenuItem(value: 'ifc', child: Text('Exportar IFC (Revit)')),
            PopupMenuItem(value: 'dxf', child: Text('Exportar DXF')),
            PopupMenuItem(value: 'levon', child: Text('Compartir .levon')),
            PopupMenuItem(value: 'pdf', child: Text('Exportar PDF')),
          ],
        ),
        // El botón de configuración en AppBar solo se muestra en desktop
        if (_isDesktop)
          IconButton(
            key: const Key('btn_configuracion_appbar'),
            icon: const Icon(Icons.settings_outlined),
            tooltip: 'Configuración  Ctrl+,',
            onPressed: () => showProjectSettings(context),
          ),
        const SizedBox(width: 8),
      ],
    );
  }

  Widget _buildSaveButton() {
    final status = ref.watch(saveStatusProvider);
    return switch (status) {
      SaveStatus.saving => const SizedBox(
          width: 40,
          height: 40,
          child: Center(
            child: SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: Colors.white),
            ),
          ),
        ),
      // Saved: sigue siendo tappable para re-guardar inmediatamente
      SaveStatus.saved => IconButton(
          icon:
              const Icon(Icons.check_circle_outline, color: Colors.greenAccent),
          tooltip: 'Guardado',
          onPressed: _saveProject,
        ),
      SaveStatus.error => IconButton(
          icon: const Icon(Icons.error_outline, color: Colors.redAccent),
          tooltip: 'Error al guardar — reintentar',
          onPressed: _saveProject,
        ),
      SaveStatus.idle => IconButton(
          icon: const Icon(Icons.save_outlined),
          tooltip: 'Guardar  Ctrl+S',
          onPressed: _saveProject,
        ),
    };
  }

  // ── LAYOUTS ───────────────────────────────────────────────────────────────

  Widget _buildMobileLayout() {
    return Stack(
      key: const Key('editor_layout_mobile'),
      children: [
        _buildCanvas(),
        ContextualRibbon(scale: _scale),
        const ValidationAlertBadge(),
        _buildBottomToolbar(),
        _buildMagnifier(),
      ],
    );
  }

  Widget _buildDesktopLayout() {
    final panelVisible = ref.watch(propertiesPanelVisibleProvider);
    final selected = ref.watch(selectedObjectProvider);

    return Row(
      key: const Key('editor_layout_desktop'),
      children: [
        _buildLeftMinibar(),
        Expanded(
          child: Stack(
            key: const Key('editor_canvas_stack'),
            children: [
              _buildCanvas(),
              ContextualRibbon(scale: _scale),
              const ValidationAlertBadge(),
              _buildBottomToolbar(),
              _buildMagnifier(),
            ],
          ),
        ),
        AnimatedContainer(
          duration: LevonDuration.normal,
          curve: Curves.easeOut,
          width: (panelVisible && selected != null) ? 300.0 : 0.0,
          child: (panelVisible && selected != null)
              ? _buildRightPanel(selected)
              : const SizedBox.shrink(),
        ),
      ],
    );
  }

  // ── CANVAS ────────────────────────────────────────────────────────────────

  Widget _buildCanvas() {
    final mode = ref.watch(editorModeProvider);
    final viewMode = ref.watch(editorViewModeProvider);

    if (viewMode == EditorViewMode.wallElevation) {
      return const WallElevationEditor();
    }

    return MouseRegion(
      cursor: mode == EditorMode.view
          ? SystemMouseCursors.grab
          : SystemMouseCursors.precise,
      child: Listener(
        onPointerSignal: (event) {
          if (event is PointerScrollEvent) {
            final oldScale = _scale;
            final factor = event.scrollDelta.dy > 0 ? 0.88 : 1.12;
            final newScale = (oldScale * factor).clamp(_kMinScale, _kMaxScale);

            Offset focalLocal = event.position;
            if (_canvasKey.currentContext != null) {
              final box =
                  _canvasKey.currentContext!.findRenderObject() as RenderBox?;
              if (box != null) {
                focalLocal = box.globalToLocal(event.position);
              }
            }

            final center =
                Offset(_canvasSize.width / 2, _canvasSize.height / 2);
            final focalFromCenter = focalLocal - center;

            setState(() {
              _panOffset = focalFromCenter -
                  (focalFromCenter - _panOffset) * (newScale / oldScale);
              _scale = newScale;
            });
          }
        },
        child: GestureDetector(
          key: _canvasKey,
          onTapDown: _onTapDown,
          onDoubleTapDown: _onDoubleTapDown,
          onDoubleTap: _onDoubleTap,
          onScaleStart: _onScaleStart,
          onScaleUpdate: _onScaleUpdate,
          onScaleEnd: _onScaleEnd,
          onLongPressStart: _onLongPressStart,
          onSecondaryTapDown: _onSecondaryTapDown,
          child: SizedBox.expand(
            child: _buildPlanCanvas(mode),
          ),
        ),
      ),
    );
  }

  Widget _buildPlanCanvas(EditorMode mode) {
    final walls = ref.watch(wallsProvider);
    final rooms = ref.watch(roomsProvider);
    final columns = ref.watch(columnsProvider);
    final wallElevations = ref.watch(wallElevationsProvider);
    final settings = ref.watch(projectSettingsProvider);
    final issues = ref.watch(validationProvider);
    final selected = ref.watch(selectedObjectProvider);

    final selectedId = selected is Wall
        ? (selected).id
        : selected is Room
            ? (selected).id
            : selected is ArchitecturalColumn
                ? (selected).id
                : null;

    final selectedOpeningId = selected is WallOpening ? (selected).id : null;
    final photoMarkers = ref.watch(photoMarkersProvider);
    final selectedMarkerId =
        selected is PhotoMarkerEntity ? (selected).id : null;

    // Ghost pending marker tracks draw cursor + live orientation from ribbon.
    final pendingOrientation = ref.watch(pendingMarkerOrientationProvider);
    final pendingMarker = _pendingMarker?.copyWith(
      x: _drawPreview?.x ?? _pendingMarker!.x,
      y: _drawPreview?.y ?? _pendingMarker!.y,
      orientation: pendingOrientation,
    );

    return Stack(
      children: [
        RepaintBoundary(
          child: CustomPaint(
            painter: StaticLayerPainter(
              walls: walls,
              rooms: rooms,
              columns: columns,
              wallElevations: wallElevations,
              photoMarkers: photoMarkers,
              pendingMarker: pendingMarker,
              settings: settings,
              validationIssues: issues,
              selectedId: selectedId,
              selectedOpeningId: selectedOpeningId,
              selectedMarkerId: selectedMarkerId,
              mode: mode,
              scale: _scale,
              panOffset: _panOffset,
            ),
            size: _canvasSize,
          ),
        ),
        RepaintBoundary(
          child: CustomPaint(
            painter: PreviewLayerPainter(
              subMode: ref.watch(drawSubModeProvider),
              previewStart: _drawStart,
              previewEnd: _drawPreview,
              scale: _scale,
              panOffset: _panOffset,
              settings: settings,
              isCircular:
                  ref.watch(creationMethodProvider) == CreationMethod.circular,
            ),
            size: _canvasSize,
          ),
        ),
        RepaintBoundary(
          child: CustomPaint(
            painter: LabelsLayerPainter(
              walls: walls,
              rooms: rooms,
              settings: settings,
              selectedId: selectedId,
              mode: mode,
              subMode: ref.watch(drawSubModeProvider),
              scale: _scale,
              panOffset: _panOffset,
            ),
            size: _canvasSize,
          ),
        ),
      ],
    );
  }

  Widget _buildLeftMinibar() {
    return Container(
      width: 56,
      color: Colors.white,
      child: Column(
        children: [
          const SizedBox(height: 16),
          const _MinibaarBtn(
            mode: EditorMode.view,
            icon: Icons.pan_tool_outlined,
            tooltip: 'Vista',
          ),
          const _MinibaarBtn(
            mode: EditorMode.draw,
            icon: Icons.edit_outlined,
            tooltip: 'Crear',
          ),
          const _MinibaarBtn(
            mode: EditorMode.select,
            icon: Icons.ads_click,
            tooltip: 'Seleccionar',
          ),
          const _MinibaarBtn(
            mode: EditorMode.delete,
            icon: Icons.delete_outline,
            tooltip: 'Eliminar',
          ),
          const Spacer(),
          _MinibaarIconBtn(
            icon: Icons.layers_outlined,
            tooltip: 'Niveles',
            onTap: () {
              showModalBottomSheet(
                context: context,
                isScrollControlled: true,
                builder: (ctx) => _StoreyPickerSheet(
                  storeys: const ['Planta Baja'],
                  currentIndex: 0,
                  onSelect: (idx) => Navigator.pop(ctx),
                  onAdd: () => Navigator.pop(ctx),
                ),
              );
            },
          ),
          _MinibaarIconBtn(
            icon: Icons.settings_outlined,
            tooltip: 'Ajustes',
            onTap: () {
              showProjectSettings(context);
            },
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }

  Widget _buildBottomToolbar() {
    return Positioned(
      key: const Key('editor_bottom_toolbar_positioned'),
      bottom: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Consumer(
          builder: (context, ref, child) {
            final mode = ref.watch(editorModeProvider);
            return Column(
              key: const Key('editor_toolbar_column'),
              mainAxisSize: MainAxisSize.min,
              children: [
                if (mode == EditorMode.draw) const _CreationToolbar(),
                if (mode == EditorMode.draw || mode == EditorMode.select)
                  const _SnapQuickBar(),
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      _buildMainToolbar(),
                      const SizedBox(width: 8),
                      if (!_isDesktop)
                        _ToolbarIconBtn(
                          key: const Key('btn_configuracion_mobile'),
                          icon: Icons.settings_outlined,
                          tooltip: 'Configuración',
                          onTap: () => showProjectSettings(context),
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildMainToolbar() {
    final viewMode = ref.watch(editorViewModeProvider);
    return Container(
      key: const Key('editor_main_toolbar'),
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: LevonColors.navy,
        borderRadius: BorderRadius.circular(LevonRadius.pill),
        boxShadow: LevonShadow.float,
      ),
      child: viewMode == EditorViewMode.plan
          ? const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ModeButton(
                    mode: EditorMode.view,
                    icon: Icons.pan_tool_outlined,
                    label: 'Vista',
                    tooltip: 'Vista  V'),
                _ModeButton(
                    mode: EditorMode.draw,
                    icon: Icons.add_circle_outline,
                    label: 'Crear',
                    tooltip: 'Crear  W'),
                _ModeButton(
                    mode: EditorMode.select,
                    icon: Icons.near_me_outlined,
                    label: 'Seleccionar',
                    tooltip: 'Seleccionar  S'),
                _ModeButton(
                    mode: EditorMode.delete,
                    icon: Icons.delete_outline,
                    label: 'Eliminar',
                    tooltip: 'Eliminar elemento'),
              ],
            )
          : const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _ModeButton(
                    mode: EditorMode.view,
                    icon: Icons.pan_tool_outlined,
                    label: 'Vista',
                    tooltip: 'Vista  V'),
                _ModeButton(
                    mode: EditorMode.draw,
                    icon: Icons.add_circle_outline,
                    label: 'Crear',
                    tooltip: 'Crear apertura'),
                _ModeButton(
                    mode: EditorMode.select,
                    icon: Icons.near_me_outlined,
                    label: 'Seleccionar',
                    tooltip: 'Seleccionar'),
                _ModeButton(
                    mode: EditorMode.delete,
                    icon: Icons.delete_outline,
                    label: 'Eliminar',
                    tooltip: 'Eliminar'),
              ],
            ),
    );
  }

  Widget _buildMagnifier() {
    return const SizedBox.shrink();
  }

  Widget _buildRightPanel(Object selected) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border(
          left: BorderSide(color: Colors.grey.shade200),
        ),
      ),
      child: PropertiesPanel(selected: selected),
    );
  }
}

// ─── STOREY PICKER SHEET ─────────────────────────────────────────────────────

class _StoreyPickerSheet extends StatelessWidget {
  final List<String> storeys;
  final int currentIndex;
  final void Function(int) onSelect;
  final VoidCallback onAdd;

  const _StoreyPickerSheet({
    required this.storeys,
    required this.currentIndex,
    required this.onSelect,
    required this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 8, 8),
            child: Row(
              children: [
                const Text('Espacios',
                    style:
                        TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                const Spacer(),
                // Botón "+" minimalista para nuevo espacio
                IconButton(
                  icon: const Icon(Icons.add, size: 22),
                  tooltip: 'Nuevo Espacio',
                  onPressed: onAdd,
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          ...storeys.asMap().entries.map((e) => ListTile(
                leading: Icon(
                  Icons.layers_outlined,
                  color: e.key == currentIndex
                      ? LevonColors.navy
                      : LevonColors.textSecondary,
                ),
                title: Text(e.value,
                    style: TextStyle(
                      fontWeight: e.key == currentIndex
                          ? FontWeight.w700
                          : FontWeight.normal,
                      color: e.key == currentIndex
                          ? LevonColors.navy
                          : LevonColors.textPrimary,
                    )),
                trailing: e.key == currentIndex
                    ? const Icon(Icons.check, color: LevonColors.navy, size: 18)
                    : null,
                onTap: () => onSelect(e.key),
              )),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

// ─── MINIBAR BUTTONS (DESKTOP) ────────────────────────────────────────────────

class _MinibaarBtn extends ConsumerWidget {
  final EditorMode mode;
  final IconData icon;
  final String tooltip;

  const _MinibaarBtn({
    required this.mode,
    required this.icon,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isActive = ref.watch(editorModeProvider) == mode;
    final isDelete = mode == EditorMode.delete;
    final modeKey = switch (mode) {
      EditorMode.view => 'minibar_btn_vista',
      EditorMode.draw => 'minibar_btn_dibujar',
      EditorMode.select => 'minibar_btn_seleccionar',
      EditorMode.delete => 'minibar_btn_eliminar',
    };
    return Tooltip(
      message: tooltip,
      child: InkWell(
        key: Key(modeKey),
        onTap: () {
          ref.read(editorModeProvider.notifier).state = mode;
          // Limpiar selección al salir de modo select, igual que en _ModeButton.
          if (mode != EditorMode.select) {
            ref.read(selectedObjectProvider.notifier).state = null;
            ref.read(propertiesPanelVisibleProvider.notifier).state = false;
          }
        },
        child: Container(
          width: 56,
          height: 48,
          color: isActive
              ? (isDelete
                  ? LevonColors.errorRed.withValues(alpha: 0.12)
                  : LevonColors.yellow.withValues(alpha: 0.15))
              : Colors.transparent,
          child: Icon(
            icon,
            size: 20,
            color: isActive
                ? (isDelete ? LevonColors.errorRed : LevonColors.navy)
                : LevonColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

class _MinibaarIconBtn extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _MinibaarIconBtn({
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          width: 56,
          height: 44,
          child: Icon(icon, size: 20, color: LevonColors.textSecondary),
        ),
      ),
    );
  }
}

// ─── TOOLBAR ICON BUTTON ─────────────────────────────────────────────────────

class _ToolbarIconBtn extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback onTap;

  const _ToolbarIconBtn({
    super.key,
    required this.icon,
    required this.tooltip,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: LevonColors.navy,
            borderRadius: BorderRadius.circular(LevonRadius.pill),
            boxShadow: LevonShadow.float,
          ),
          child: Icon(icon, size: 20, color: Colors.white.withValues(alpha: 0.85)),
        ),
      ),
    );
  }
}

// ─── MODE BUTTON ─────────────────────────────────────────────────────────────

class _ModeButton extends ConsumerWidget {
  final EditorMode mode;
  final IconData icon;
  final String label;
  final String tooltip;

  const _ModeButton({
    required this.mode,
    required this.icon,
    required this.label,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = ref.watch(editorModeProvider);
    final isActive = current == mode;
    final isDelete = mode == EditorMode.delete;
    final modeKey = switch (mode) {
      EditorMode.view => 'btn_modo_vista',
      EditorMode.draw => 'btn_modo_crear',
      EditorMode.select => 'btn_modo_seleccionar',
      EditorMode.delete => 'btn_modo_eliminar',
    };

    return Tooltip(
      message: tooltip,
      child: GestureDetector(
        key: Key(modeKey),
        onTap: () {
          HapticFeedback.selectionClick();
          ref.read(editorModeProvider.notifier).state = mode;
          if (mode != EditorMode.select) {
            ref.read(selectedObjectProvider.notifier).state = null;
            ref.read(propertiesPanelVisibleProvider.notifier).state = false;
          }
        },
        child: AnimatedContainer(
          duration: LevonDuration.fast,
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          constraints: const BoxConstraints(minHeight: 48),
          decoration: BoxDecoration(
            color: isActive
                ? (isDelete ? LevonColors.errorRed : LevonColors.yellow)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(LevonRadius.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 18,
                color: isActive
                    ? (isDelete ? Colors.white : LevonColors.navy)
                    : Colors.white.withValues(alpha: 0.85),
              ),
              AnimatedSize(
                duration: LevonDuration.fast,
                child: isActive
                    ? Row(children: [
                        const SizedBox(width: 6),
                        Text(
                          label,
                          style: TextStyle(
                            color: isDelete ? Colors.white : LevonColors.navy,
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ])
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─── CREATION TOOLBAR ────────────────────────────────────────────────────────

class _CreationToolbar extends ConsumerWidget {
  const _CreationToolbar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final subMode = ref.watch(drawSubModeProvider);
    final viewMode = ref.watch(editorViewModeProvider);

    return Container(
      key: const Key('editor_creation_toolbar'),
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(LevonRadius.pill),
        boxShadow: LevonShadow.float,
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: viewMode == EditorViewMode.plan
            ? [
                _SubModeBtn(
                  key: const Key('btn_submodo_muro'),
                  mode: DrawSubMode.wall,
                  icon: Icons.horizontal_rule,
                  label: 'Muro',
                  isActive: subMode == DrawSubMode.wall,
                ),
                const SizedBox(width: 4),
                _SubModeBtn(
                  key: const Key('btn_submodo_particion'),
                  mode: DrawSubMode.partition,
                  icon: Icons.border_clear,
                  label: 'Partición',
                  isActive: subMode == DrawSubMode.partition,
                ),
                const SizedBox(width: 4),
                _SubModeBtn(
                  key: const Key('btn_submodo_columna'),
                  mode: DrawSubMode.column,
                  icon: Icons.architecture,
                  label: 'Columna',
                  isActive: subMode == DrawSubMode.column,
                ),
                const SizedBox(width: 4),
                _SubModeBtn(
                  key: const Key('btn_submodo_foto'),
                  mode: DrawSubMode.photo,
                  icon: Icons.add_a_photo_outlined,
                  label: 'Foto',
                  isActive: subMode == DrawSubMode.photo,
                ),
              ]
            : [
                _SubModeBtn(
                  key: const Key('btn_submodo_puerta'),
                  mode: DrawSubMode.door,
                  icon: Icons.door_front_door_outlined,
                  label: 'Puerta',
                  isActive: subMode == DrawSubMode.door,
                ),
                const SizedBox(width: 4),
                _SubModeBtn(
                  key: const Key('btn_submodo_ventana'),
                  mode: DrawSubMode.window,
                  icon: Icons.window_outlined,
                  label: 'Ventana',
                  isActive: subMode == DrawSubMode.window,
                ),
                const SizedBox(width: 4),
                _SubModeBtn(
                  key: const Key('btn_submodo_opening'),
                  mode: DrawSubMode.opening,
                  icon: Icons.crop_square_outlined,
                  label: 'Hueco',
                  isActive: subMode == DrawSubMode.opening,
                ),
              ],
      ),
    );
  }
}

class _SubModeBtn extends ConsumerWidget {
  final DrawSubMode mode;
  final IconData icon;
  final String label;
  final bool isActive;

  const _SubModeBtn({
    super.key,
    required this.mode,
    required this.icon,
    required this.label,
    required this.isActive,
  });

  void _showCreationOptions(BuildContext context, WidgetRef ref) async {
    HapticFeedback.heavyImpact();

    final RenderBox button = context.findRenderObject() as RenderBox;
    final RenderBox overlay =
        Navigator.of(context).overlay!.context.findRenderObject() as RenderBox;
    final RelativeRect position = RelativeRect.fromRect(
      Rect.fromPoints(
        button.localToGlobal(const Offset(0, -10), ancestor: overlay),
        button.localToGlobal(button.size.bottomRight(Offset.zero),
            ancestor: overlay),
      ),
      Offset.zero & overlay.size,
    );

    final method = ref.read(creationMethodProvider);
    CreationMethod? result;

    if (mode == DrawSubMode.wall || mode == DrawSubMode.partition) {
      result = await showMenu<CreationMethod>(
        context: context,
        position: position,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(LevonRadius.sm)),
        items: [
          PopupMenuItem(
            value: CreationMethod.drag,
            child: Row(children: [
              Icon(Icons.swipe,
                  size: 18,
                  color: method == CreationMethod.drag
                      ? LevonColors.navy
                      : LevonColors.textPrimary),
              const SizedBox(width: 8),
              Text('Arrastre Libre',
                  style: TextStyle(
                      fontWeight: method == CreationMethod.drag
                          ? FontWeight.bold
                          : FontWeight.normal)),
            ]),
          ),
          PopupMenuItem(
            value: CreationMethod.pointToPoint,
            child: Row(children: [
              Icon(Icons.linear_scale,
                  size: 18,
                  color: method == CreationMethod.pointToPoint
                      ? LevonColors.navy
                      : LevonColors.textPrimary),
              const SizedBox(width: 8),
              Text('Punto a Punto',
                  style: TextStyle(
                      fontWeight: method == CreationMethod.pointToPoint
                          ? FontWeight.bold
                          : FontWeight.normal)),
            ]),
          ),
        ],
      );
    } else if (mode == DrawSubMode.column) {
      result = await showMenu<CreationMethod>(
        context: context,
        position: position,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(LevonRadius.sm)),
        items: [
          PopupMenuItem(
            value: CreationMethod.rectangular,
            child: Row(children: [
              Icon(Icons.crop_square,
                  size: 18,
                  color: method == CreationMethod.rectangular
                      ? LevonColors.navy
                      : LevonColors.textPrimary),
              const SizedBox(width: 8),
              Text('Rectangular',
                  style: TextStyle(
                      fontWeight: method == CreationMethod.rectangular
                          ? FontWeight.bold
                          : FontWeight.normal)),
            ]),
          ),
          PopupMenuItem(
            value: CreationMethod.circular,
            child: Row(children: [
              Icon(Icons.radio_button_unchecked,
                  size: 18,
                  color: method == CreationMethod.circular
                      ? LevonColors.navy
                      : LevonColors.textPrimary),
              const SizedBox(width: 8),
              Text('Circular',
                  style: TextStyle(
                      fontWeight: method == CreationMethod.circular
                          ? FontWeight.bold
                          : FontWeight.normal)),
            ]),
          ),
        ],
      );
    }

    if (mode == DrawSubMode.photo) {
      final currentSource = ref.read(photoInsertSourceProvider);
      final picked = await showMenu<String>(
        context: context, // ignore: use_build_context_synchronously
        position: position,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(LevonRadius.sm)),
        items: [
          PopupMenuItem(
            value: 'camera',
            child: Row(children: [
              Icon(Icons.camera_alt_outlined,
                  size: 18,
                  color: currentSource == 'camera'
                      ? LevonColors.navy
                      : LevonColors.textPrimary),
              const SizedBox(width: 8),
              Text('Cámara',
                  style: TextStyle(
                      fontWeight: currentSource == 'camera'
                          ? FontWeight.bold
                          : FontWeight.normal)),
            ]),
          ),
          PopupMenuItem(
            value: 'gallery',
            child: Row(children: [
              Icon(Icons.photo_library_outlined,
                  size: 18,
                  color: currentSource == 'gallery'
                      ? LevonColors.navy
                      : LevonColors.textPrimary),
              const SizedBox(width: 8),
              Text('Galería',
                  style: TextStyle(
                      fontWeight: currentSource == 'gallery'
                          ? FontWeight.bold
                          : FontWeight.normal)),
            ]),
          ),
        ],
      );
      if (picked != null && context.mounted) {
        ref.read(photoInsertSourceProvider.notifier).state = picked;
        ref.read(drawSubModeProvider.notifier).state = mode;
      }
      return;
    }

    if (result != null) {
      ref.read(creationMethodProvider.notifier).state = result;
      ref.read(drawSubModeProvider.notifier).state = mode;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        ref.read(drawSubModeProvider.notifier).state = mode;
        if (mode == DrawSubMode.column &&
            ref.read(creationMethodProvider) != CreationMethod.circular &&
            ref.read(creationMethodProvider) != CreationMethod.rectangular) {
          ref.read(creationMethodProvider.notifier).state =
              CreationMethod.rectangular;
        } else if ((mode == DrawSubMode.wall ||
                mode == DrawSubMode.partition) &&
            ref.read(creationMethodProvider) != CreationMethod.drag &&
            ref.read(creationMethodProvider) != CreationMethod.pointToPoint) {
          ref.read(creationMethodProvider.notifier).state = CreationMethod.drag;
        }
      },
      onLongPress: () => _showCreationOptions(context, ref),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: isActive
              ? LevonColors.navy.withValues(alpha: 0.1)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(LevonRadius.md),
        ),
        child: Row(
          children: [
            Icon(icon,
                size: 16,
                color: isActive ? LevonColors.navy : LevonColors.textSecondary),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                color: isActive ? LevonColors.navy : LevonColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── SNAP QUICK BAR ──────────────────────────────────────────────────────────

/// Barra de toggles de snap rápidos — aparece sobre la toolbar principal
/// en modo dibujo y selección. Muestra los snaps más usados sin abrir settings.
class _SnapQuickBar extends ConsumerWidget {
  const _SnapQuickBar();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final viewMode = ref.watch(editorViewModeProvider);
    final snap = ref.watch(projectSettingsProvider).snap;
    final grid = ref.watch(projectSettingsProvider).grid;

    void toggleSnap(ProjectSettings Function(ProjectSettings) updater) {
      final current = ref.read(projectSettingsProvider);
      ref
          .read(projectSettingsProvider.notifier)
          .updateSettings(updater(current));
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Container(
        key: const Key('snap_quick_bar'),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.92),
          borderRadius: BorderRadius.circular(LevonRadius.pill),
          boxShadow: LevonShadow.float,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: viewMode == EditorViewMode.plan
              ? [
                  _SnapToggle(
                    key: const Key('snap_toggle_grid'),
                    icon: Icons.grid_4x4_outlined,
                    label: 'Grid',
                    active: grid.showGrid,
                    onTap: () => toggleSnap((s) => s.copyWith(
                          grid: s.grid.copyWith(showGrid: !s.grid.showGrid),
                        )),
                  ),
                  _SnapToggle(
                    key: const Key('snap_toggle_nodes'),
                    icon: Icons.adjust,
                    label: 'Nodos',
                    active: snap.snapToNodes,
                    onTap: () => toggleSnap((s) => s.copyWith(
                          snap:
                              s.snap.copyWith(snapToNodes: !s.snap.snapToNodes),
                        )),
                  ),
                  _SnapToggle(
                    key: const Key('snap_toggle_angular'),
                    icon: Icons.architecture,
                    label: 'Ángulo',
                    active: snap.angleSnapping,
                    onTap: () => toggleSnap((s) => s.copyWith(
                          snap: s.snap
                              .copyWith(angleSnapping: !s.snap.angleSnapping),
                        )),
                  ),
                ]
              : [
                  _SnapToggle(
                    key: const Key('snap_toggle_grid_elev'),
                    icon: Icons.grid_4x4_outlined,
                    label: 'Grid',
                    active: grid.showGrid,
                    onTap: () => toggleSnap((s) => s.copyWith(
                          grid: s.grid.copyWith(showGrid: !s.grid.showGrid),
                        )),
                  ),
                  _SnapToggle(
                    key: const Key('snap_toggle_nms'),
                    icon: Icons.height,
                    label: 'NMS',
                    active: snap.snapToNMS,
                    onTap: () => toggleSnap((s) => s.copyWith(
                          snap: s.snap.copyWith(snapToNMS: !s.snap.snapToNMS),
                        )),
                  ),
                  _SnapToggle(
                    key: const Key('snap_toggle_openings'),
                    icon: Icons.crop_square_outlined,
                    label: 'Huecos',
                    active: snap.snapToOpenings,
                    onTap: () => toggleSnap((s) => s.copyWith(
                          snap: s.snap
                              .copyWith(snapToOpenings: !s.snap.snapToOpenings),
                        )),
                  ),
                ],
        ),
      ),
    );
  }
}

class _SnapToggle extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  const _SnapToggle({
    super.key,
    required this.icon,
    required this.label,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: LevonDuration.fast,
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
          decoration: BoxDecoration(
            color: active
                ? LevonColors.navy.withValues(alpha: 0.1)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(LevonRadius.md),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 14,
                color: active ? LevonColors.navy : LevonColors.textDisabled,
              ),
              const SizedBox(width: 4),
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: active ? FontWeight.w600 : FontWeight.normal,
                  color: active ? LevonColors.navy : LevonColors.textDisabled,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
