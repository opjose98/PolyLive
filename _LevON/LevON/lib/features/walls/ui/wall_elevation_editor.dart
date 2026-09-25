import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'dart:math' as math;

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/features/walls/application/wall_csl_service.dart';
import 'package:levon/features/walls/ui/wall_elevation_painter.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/core/utils/unit_service.dart';

class WallElevationEditor extends ConsumerStatefulWidget {
  const WallElevationEditor({super.key});

  @override
  ConsumerState<WallElevationEditor> createState() => _WallElevationEditorState();
}

class _WallElevationEditorState extends ConsumerState<WallElevationEditor> {
  static const double _kElevMinUserScale = 0.5;
  static const double _kElevMaxUserScale = 6.0;

  ElevationHandle _activeHandle = ElevationHandle.none;
  Offset? _panStartCanvas;
  WallOpening? _panOpeningSnapshot;
  VerticalLevels? _panLevelsSnapshot;

  double _elevUserScale = 1.0;
  Offset _elevUserPan = Offset.zero;
  bool _isPinchingElevation = false;
  double _elevScaleAtPinchStart = 1.0;
  Offset? _elevPanDragStart;
  Offset _elevPanAtDragStart = Offset.zero;

  @override
  Widget build(BuildContext context) {
    final wallId = ref.watch(activeElevationWallIdProvider);
    if (wallId == null) return const Center(child: Text('No hay muro seleccionado'));

    final wall = ref.watch(wallsProvider).where((w) => w.id == wallId).firstOrNull;
    if (wall == null) return const Center(child: Text('No hay muro seleccionado'));

    final elevations = ref.watch(wallElevationsProvider);
    const uc = EditWallElevationUseCase();
    final elevation = uc.getOrCreate(wall.id, wall.height, elevations);
    final settings = ref.watch(projectSettingsProvider);

    final selected = ref.watch(selectedObjectProvider);
    final selectedId = selected is WallOpening ? selected.id : null;

    final validationMap = <String, ValidationSeverity>{};
    for (final o in elevation.openings) {
      final r = WallCslService.validateOpening(o, elevation, wall);
      if (r.severity != ValidationSeverity.valid) {
        validationMap[o.id] = r.severity;
      }
    }

    final quant = WallQuantification.compute(elevation, wall.length);
    final unit = settings.defaults.baseUnit;

    return LayoutBuilder(
      builder: (context, constraints) {
        final canvasSize = constraints.biggest;
        final maxH = math.max(
          elevation.levels.effectiveLeftHeight,
          elevation.levels.effectiveRightHeight,
        );
        final vp = ElevationViewport(
          wallLength: wall.length,
          wallHeight: maxH > 0 ? maxH : elevation.levels.coronacion,
          canvasSize: canvasSize,
          userScale: _elevUserScale,
          userPan: _elevUserPan,
        );

        return Stack(
          children: [
            GestureDetector(
              onTapDown: (d) => _handleElevationTapDown(d, canvasSize, wall, elevation, vp),
              onScaleStart: (d) => _handleElevationScaleStart(d, canvasSize, wall, elevation, vp),
              onScaleUpdate: (d) => _handleElevationScaleUpdate(d, canvasSize, wall, elevation),
              onScaleEnd: _handleElevationScaleEnd,
              child: CustomPaint(
                painter: WallElevationPainter(
                  wall: wall,
                  elevation: elevation,
                  viewport: vp,
                  selectedOpeningId: selectedId,
                  unitSystem: unit,
                  precision: settings.precision.lengthPrecision,
                  validationState: validationMap,
                  activeHandle: _activeHandle,
                  showHandles: ref.watch(editorModeProvider) == EditorMode.select,
                ),
                size: canvasSize,
              ),
            ),
            // Ribbon persistente de cuantificación
            Positioned(
              top: 60,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(LevonRadius.pill),
                    boxShadow: LevonShadow.card,
                    border: Border.all(color: LevonColors.divider),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _elevQuantChip('Bruta',
                          UnitFormatter.area(quant.grossArea, unit),
                          LevonColors.textSecondary),
                      const SizedBox(width: 20),
                      _elevQuantChip('Aperturas',
                          UnitFormatter.area(quant.openingArea, unit),
                          LevonColors.warnOrange),
                      const SizedBox(width: 20),
                      _elevQuantChip('Neta',
                          UnitFormatter.area(quant.netArea, unit),
                          LevonColors.okGreen),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _elevQuantChip(String label, String value, Color color) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(value,
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        const SizedBox(height: 1),
        Text(label,
            style: const TextStyle(fontSize: 10, color: LevonColors.textSecondary)),
      ],
    );
  }

  void _handleElevationTapDown(TapDownDetails d, Size canvasSize, Wall wall, WallElevation elev, ElevationViewport vp) {
    final mode = ref.read(editorModeProvider);

    if (mode == EditorMode.draw) {
      final subMode = ref.read(drawSubModeProvider);
      final settings = ref.read(projectSettingsProvider);
      final defs = settings.defaults;
      final type = switch (subMode) {
        DrawSubMode.door => OpeningType.door,
        DrawSubMode.window => OpeningType.window,
        _ => OpeningType.opening,
      };
      final width = switch (type) {
        OpeningType.door => defs.doorWidth,
        OpeningType.window => defs.windowWidth,
        OpeningType.opening => defs.openingWidth,
      };
      final height = switch (type) {
        OpeningType.door => defs.doorHeight,
        OpeningType.window => defs.windowHeight,
        OpeningType.opening => defs.openingHeight,
      };
      final sill = switch (type) {
        OpeningType.door => 0.0,
        OpeningType.window => defs.windowSillHeight,
        OpeningType.opening => defs.openingSillHeight,
      };

      final rawX = vp.toLocalX(d.localPosition.dx).clamp(0.0, wall.length - width);
      final snappedX = WallCslService.snapXSmart(rawX, 0.05, elev, wall,
          snapToOpenings: settings.snap.snapToOpenings);

      final newOpening = WallOpening(
        id: 'opening-${DateTime.now().millisecondsSinceEpoch}',
        type: type,
        xOffset: snappedX,
        width: width,
        height: height,
        sillHeight: sill,
      );

      const uc = EditWallElevationUseCase();
      final result = uc.addOpening(elev, wall, newOpening);
      ref.read(wallElevationsProvider.notifier).upsertElevation(result.elevation);
      ref.read(selectedObjectProvider.notifier).state = newOpening;
      ref.read(editorModeProvider.notifier).state = EditorMode.select;
      return;
    }

    if (mode == EditorMode.select) {
      for (final o in elev.openings.reversed) {
        if (vp.toCanvasRect(o).contains(d.localPosition)) {
          ref.read(selectedObjectProvider.notifier).state = o;
          return;
        }
      }
      final handle = _hitTestCornerHandles(d.localPosition, elev, wall, vp);
      if (handle != ElevationHandle.none) {
        setState(() => _activeHandle = handle);
        return;
      }
      ref.read(selectedObjectProvider.notifier).state = null;
    }

    if (mode == EditorMode.delete) {
      final deletePendingId = ref.read(selectedObjectProvider) is WallOpening 
          ? (ref.read(selectedObjectProvider) as WallOpening).id 
          : null;
      for (final o in elev.openings.reversed) {
        if (vp.toCanvasRect(o).contains(d.localPosition)) {
          if (deletePendingId == o.id) {
            const uc = EditWallElevationUseCase();
            ref.read(wallElevationsProvider.notifier).upsertElevation(
                  uc.removeOpening(elev, o.id),
                );
            ref.read(selectedObjectProvider.notifier).state = null;
          } else {
            ref.read(selectedObjectProvider.notifier).state = o;
          }
          return;
        }
      }
      ref.read(selectedObjectProvider.notifier).state = null;
    }
  }

  void _handleElevationScaleStart(ScaleStartDetails d, Size canvasSize, Wall wall, WallElevation elev, ElevationViewport vp) {
    if (d.pointerCount > 1) {
      setState(() {
        _isPinchingElevation = true;
        _elevScaleAtPinchStart = _elevUserScale;
      });
      return;
    }

    final mode = ref.read(editorModeProvider);

    if (mode == EditorMode.view) {
      setState(() {
        _elevPanDragStart = d.localFocalPoint;
        _elevPanAtDragStart = _elevUserPan;
      });
      return;
    }

    if (mode != EditorMode.select) return;

    final selected = ref.read(selectedObjectProvider);
    if (selected is WallOpening) {
      final handle = _hitTestResizeHandles(d.localFocalPoint, selected, vp);
      setState(() {
        _activeHandle = handle;
        _panStartCanvas = d.localFocalPoint;
        _panOpeningSnapshot = selected;
      });
    } else {
      final handle = _hitTestCornerHandles(d.localFocalPoint, elev, wall, vp);
      if (handle != ElevationHandle.none) {
        setState(() {
          _activeHandle = handle;
          _panStartCanvas = d.localFocalPoint;
          _panLevelsSnapshot = elev.levels;
        });
      }
    }
  }

  void _handleElevationScaleUpdate(ScaleUpdateDetails d, Size canvasSize, Wall wall, WallElevation elev) {
    if (d.pointerCount > 1 || _isPinchingElevation) {
      final newScale = (_elevScaleAtPinchStart * d.scale)
          .clamp(_kElevMinUserScale, _kElevMaxUserScale);

      final focalLocal = d.localFocalPoint;
      final maxH = math.max(
          elev.levels.effectiveLeftHeight, elev.levels.effectiveRightHeight);
      final oldVp = ElevationViewport(
          wallLength: wall.length,
          wallHeight: maxH > 0 ? maxH : elev.levels.coronacion,
          canvasSize: canvasSize,
          userScale: _elevUserScale,
          userPan: _elevUserPan,
      );
      final localX = oldVp.toLocalX(focalLocal.dx);
      final localY = oldVp.toLocalY(focalLocal.dy);

      final provisionalVp = ElevationViewport(
        wallLength: wall.length,
        wallHeight: oldVp.wallHeight,
        canvasSize: canvasSize,
        userScale: newScale,
      );
      final newCanvasX = provisionalVp.toCanvasX(localX);
      final newCanvasY = provisionalVp.toCanvasY(localY);

      setState(() {
        _elevUserPan = focalLocal - Offset(newCanvasX, newCanvasY);
        _elevUserScale = newScale;
      });
      return;
    }

    final mode = ref.read(editorModeProvider);

    if (mode == EditorMode.view && _elevPanDragStart != null) {
      setState(() {
        _elevUserPan = _elevPanAtDragStart + (d.localFocalPoint - _elevPanDragStart!);
      });
      return;
    }

    if (_panStartCanvas == null) return;

    final maxH = math.max(
        elev.levels.effectiveLeftHeight, elev.levels.effectiveRightHeight);
    final vp = ElevationViewport(
      wallLength: wall.length,
      wallHeight: maxH > 0 ? maxH : elev.levels.coronacion,
      canvasSize: canvasSize,
      userScale: _elevUserScale,
      userPan: _elevUserPan,
    );

    final delta = d.localFocalPoint - _panStartCanvas!;
    final dLocalX = delta.dx / vp.scale;
    final dLocalY = -delta.dy / vp.scale;

    if (_activeHandle == ElevationHandle.nodeLeft ||
        _activeHandle == ElevationHandle.nodeRight) {
      final snap = _panLevelsSnapshot!;
      final newH = vp.toLocalY(d.localFocalPoint.dy).clamp(0.1, 10.0);

      final updated = _activeHandle == ElevationHandle.nodeLeft
          ? snap.copyWith(
              leftHeight: newH,
              coronacion: math.max(newH, snap.effectiveRightHeight))
          : snap.copyWith(
              rightHeight: newH,
              coronacion: math.max(snap.effectiveLeftHeight, newH));

      ref.read(wallElevationsProvider.notifier)
          .upsertElevation(elev.copyWith(levels: updated));

    } else if (_activeHandle == ElevationHandle.nodeCenter) {
      final snap = _panLevelsSnapshot!;
      final newH = vp.toLocalY(d.localFocalPoint.dy).clamp(0.1, 10.0);
      final updated = snap.copyWith(
        leftHeight: newH,
        rightHeight: newH,
        coronacion: newH,
      );
      ref.read(wallElevationsProvider.notifier)
          .upsertElevation(elev.copyWith(levels: updated));

    } else if (_panOpeningSnapshot != null) {
      final orig = _panOpeningSnapshot!;
      if (_activeHandle == ElevationHandle.none) {
        final settings = ref.read(projectSettingsProvider);
        final rawX = (orig.xOffset + dLocalX).clamp(0.0, wall.length - orig.width);
        final rawY = (orig.sillHeight + dLocalY).clamp(0.0, elev.levels.coronacion - orig.height);
        final newX = WallCslService.snapXSmart(rawX, 0.05, elev, wall,
            snapToOpenings: settings.snap.snapToOpenings);
        final newY = WallCslService.snapYSmart(rawY, 0.05, elev, wall.length,
            snapToNms: settings.snap.snapToNMS,
            snapToOpenings: settings.snap.snapToOpenings);
        final updated = orig.copyWith(xOffset: newX, sillHeight: newY);
        const uc = EditWallElevationUseCase();
        ref.read(wallElevationsProvider.notifier).upsertElevation(
              uc.updateOpening(elev, updated),
            );
        ref.read(selectedObjectProvider.notifier).state = updated;
      }
    }
  }

  void _handleElevationScaleEnd(ScaleEndDetails d) {
    setState(() {
      _isPinchingElevation = false;
      _elevPanDragStart = null;
      _panStartCanvas = null;
      _panOpeningSnapshot = null;
      _panLevelsSnapshot = null;
      _activeHandle = ElevationHandle.none;
    });
  }

  ElevationHandle _hitTestResizeHandles(Offset pos, WallOpening o, ElevationViewport vp) {
    final rect = vp.toCanvasRect(o);
    const r = 24.0;
    if ((pos - rect.topLeft).distance < r) return ElevationHandle.topLeft;
    if ((pos - rect.topRight).distance < r) return ElevationHandle.topRight;
    if ((pos - rect.bottomLeft).distance < r) return ElevationHandle.bottomLeft;
    if ((pos - rect.bottomRight).distance < r) return ElevationHandle.bottomRight;
    return ElevationHandle.none;
  }

  ElevationHandle _hitTestCornerHandles(Offset pos, WallElevation elev, Wall wall, ElevationViewport vp) {
    const r = 28.0;
    if ((pos - vp.leftNodeCanvas(elev)).distance < r) return ElevationHandle.nodeLeft;
    if ((pos - vp.rightNodeCanvas(elev, wall.length)).distance < r) return ElevationHandle.nodeRight;
    final cPos = vp.centerNodeCanvas(elev, wall.length);
    if ((pos - cPos).dx.abs() < 20 && (pos - cPos).dy.abs() < 16) return ElevationHandle.nodeCenter;
    return ElevationHandle.none;
  }
}
