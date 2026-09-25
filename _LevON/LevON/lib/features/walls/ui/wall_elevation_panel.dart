import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:levon/features/walls/domain/wall.dart';
import 'package:levon/features/walls/domain/wall_elevation.dart';
import 'package:levon/features/walls/application/elevation/edit_wall_elevation_use_case.dart';
import 'package:levon/features/walls/application/wall_csl_service.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/walls/ui/wall_elevation_painter.dart';
import 'package:levon/core/utils/unit_service.dart';

// ── Herramienta activa en el WEP ──────────────────────────────────────────────

enum _ElevationTool { select, createDoor, createWindow, createOpening, delete }

// ── Panel principal ───────────────────────────────────────────────────────────

/// Wall Elevation Panel (WEP) — editor local de elevación de un muro.
///
/// Apertura: doble-tap en el canvas principal → showDialog(WallElevationPanel).
/// Aislado del canvas principal — no reconstruye ni afecta la escena de planta.
///
/// Herramientas:
///   select  — seleccionar, mover (drag) y redimensionar (resize handles) openings;
///             arrastrar nodos de esquina (nodeLeft/nodeRight) para culatas.
///   create  — tap en canvas coloca el opening en ese punto CSL X.
///   delete  — primer tap marca en rojo (pendiente); segundo tap elimina.
///
/// Snaps (configurables en barra de ajustes):
///   - Snap a niveles NMS (umbral, dintel, base, coronación)
///   - Snap a bordes y centros de openings existentes
///   - Paso de precisión configurable
class WallElevationPanel extends ConsumerStatefulWidget {
  final Wall wall;

  const WallElevationPanel({super.key, required this.wall});

  @override
  ConsumerState<WallElevationPanel> createState() =>
      _WallElevationPanelState();
}

class _WallElevationPanelState extends ConsumerState<WallElevationPanel> {
  static const _uc = EditWallElevationUseCase();

  // ── Tool state ──────────────────────────────────────────────────────────────

  _ElevationTool _tool = _ElevationTool.select;
  String? _selectedOpeningId;
  String? _deletePendingId;

  // ── Snap settings (locales, no persistidos) ────────────────────────────────

  bool _snapToNms = true;
  bool _snapToOpenings = true;
  bool _showSnapBar = false;
  double _snapStep = 0.05; // 5 cm por defecto

  // ── Drag / resize state ────────────────────────────────────────────────────

  ElevationHandle _activeHandle = ElevationHandle.none;
  Offset? _panStartCanvas;
  WallOpening? _panOpeningSnapshot;
  VerticalLevels? _panLevelsSnapshot;
  ElevationViewport? _panViewport; // viewport fijo durante el gesto

  // ── Canvas size (actualizado desde LayoutBuilder) ─────────────────────────

  Size _canvasSize = const Size(600, 400);

  // ── Helpers de acceso ──────────────────────────────────────────────────────

  Wall get _wall => widget.wall;

  WallElevation _currentElevation() {
    final elevations = ref.read(wallElevationsProvider);
    return _uc.getOrCreate(_wall.id, _wall.height, elevations);
  }

  WallElevation _watchElevation() {
    final elevations = ref.watch(wallElevationsProvider);
    return _uc.getOrCreate(_wall.id, _wall.height, elevations);
  }

  void _upsert(WallElevation updated) {
    ref.read(wallElevationsProvider.notifier).upsertElevation(updated);
  }

  ElevationViewport _makeViewport(WallElevation elev, Size size) {
    final maxH = math.max(
      elev.levels.effectiveLeftHeight,
      elev.levels.effectiveRightHeight,
    );
    return ElevationViewport(
      wallLength: _wall.length,
      wallHeight: maxH > 0 ? maxH : elev.levels.coronacion,
      canvasSize: size,
    );
  }

  // ── Snap helpers ───────────────────────────────────────────────────────────

  double _snapLocalX(double localX, WallElevation elev) {
    return WallCslService.snapXSmart(
      localX,
      _snapStep,
      elev,
      _wall,
      snapToOpenings: _snapToOpenings,
    );
  }

  double _snapLocalY(double localY, WallElevation elev) {
    return WallCslService.snapYSmart(
      localY,
      _snapStep,
      elev,
      _wall.length,
      snapToNms: _snapToNms,
      snapToOpenings: _snapToOpenings,
    );
  }

  // ── Interacción principal ──────────────────────────────────────────────────

  void _onTapUp(TapUpDetails d, ElevationViewport vp) {
    final pos = d.localPosition;
    final elev = _currentElevation();

    switch (_tool) {
      case _ElevationTool.select:
        _handleSelectTap(pos, vp, elev);

      case _ElevationTool.createDoor:
        _placeOpening(pos, vp, elev, OpeningType.door);

      case _ElevationTool.createWindow:
        _placeOpening(pos, vp, elev, OpeningType.window);

      case _ElevationTool.createOpening:
        _placeOpening(pos, vp, elev, OpeningType.opening);

      case _ElevationTool.delete:
        _handleDeleteTap(pos, vp, elev);
    }
  }

  void _handleSelectTap(Offset pos, ElevationViewport vp, WallElevation elev) {
    for (final o in elev.openings) {
      if (vp.toCanvasRect(o).contains(pos)) {
        setState(() {
          _selectedOpeningId = o.id;
          _deletePendingId = null;
        });
        return;
      }
    }
    setState(() {
      _selectedOpeningId = null;
      _deletePendingId = null;
    });
  }

  void _handleDeleteTap(Offset pos, ElevationViewport vp, WallElevation elev) {
    for (final o in elev.openings) {
      if (vp.toCanvasRect(o).contains(pos)) {
        if (_deletePendingId == o.id) {
          // Segundo tap → eliminar
          _upsert(_uc.removeOpening(elev, o.id));
          setState(() {
            _deletePendingId = null;
            _selectedOpeningId = null;
          });
        } else {
          // Primer tap → marcar
          setState(() => _deletePendingId = o.id);
        }
        return;
      }
    }
    setState(() => _deletePendingId = null);
  }

  void _placeOpening(
    Offset canvasPos,
    ElevationViewport vp,
    WallElevation elev,
    OpeningType type,
  ) {
    final localX = vp.toLocalX(canvasPos.dx);
    final defaults = _openingDefaults(type, elev);
    final xOffset =
        (localX - defaults.width / 2).clamp(0.0, _wall.length - defaults.width);
    final opening = WallOpening(
      type: type,
      xOffset: xOffset,
      width: defaults.width.clamp(0.1, _wall.length),
      sillHeight: defaults.sill,
      height: defaults.height.clamp(0.1, elev.levels.coronacion - defaults.sill),
    );
    final result = _uc.addOpening(elev, _wall, opening);
    _upsert(result.elevation);
    setState(() {
      _tool = _ElevationTool.select;
      _selectedOpeningId = opening.id;
    });
  }

  ({double width, double height, double sill}) _openingDefaults(
    OpeningType type,
    WallElevation elev,
  ) {
    return switch (type) {
      OpeningType.door => (width: 0.90, height: 2.10, sill: 0.0),
      OpeningType.window => (width: 1.20, height: 1.20, sill: 0.90),
      OpeningType.opening => (width: 0.90, height: 2.00, sill: 0.0),
    };
  }

  // ── Pan / drag gestures ────────────────────────────────────────────────────

  void _onPanStart(DragStartDetails d) {
    final elev = _currentElevation();
    final vp = _makeViewport(elev, _canvasSize);
    _panViewport = vp;
    _panStartCanvas = d.localPosition;

    // 1. ¿Dragging un handle de resize?
    if (_selectedOpeningId != null) {
      final selOpening =
          elev.openings.where((o) => o.id == _selectedOpeningId).firstOrNull;
      if (selOpening != null) {
        final handle = _hitTestResizeHandles(d.localPosition, selOpening, vp);
        if (handle != ElevationHandle.none) {
          setState(() {
            _activeHandle = handle;
            _panOpeningSnapshot = selOpening;
          });
          return;
        }
        // ¿Dragging el cuerpo del opening seleccionado?
        if (vp.toCanvasRect(selOpening).contains(d.localPosition)) {
          setState(() {
            _activeHandle = ElevationHandle.none;
            _panOpeningSnapshot = selOpening;
          });
          return;
        }
      }
    }

    // 2. ¿Tap en cualquier otro opening (no seleccionado)?
    for (final o in elev.openings) {
      if (vp.toCanvasRect(o).contains(d.localPosition)) {
        setState(() {
          _selectedOpeningId = o.id;
          _activeHandle = ElevationHandle.none;
          _panOpeningSnapshot = o;
        });
        return;
      }
    }

    // 3. ¿Dragging un nodo de esquina (culata)?
    final leftNode = vp.leftNodeCanvas(elev);
    final rightNode = vp.rightNodeCanvas(elev, _wall.length);
    const nodeR = ElevationViewport.kNodeHandleRadius + 4.0;

    if ((d.localPosition - leftNode).distance < nodeR) {
      setState(() {
        _activeHandle = ElevationHandle.nodeLeft;
        _panLevelsSnapshot = elev.levels;
      });
      return;
    }
    if ((d.localPosition - rightNode).distance < nodeR) {
      setState(() {
        _activeHandle = ElevationHandle.nodeRight;
        _panLevelsSnapshot = elev.levels;
      });
      return;
    }

    // No hay hit → limpiar
    setState(() {
      _activeHandle = ElevationHandle.none;
      _panOpeningSnapshot = null;
      _panLevelsSnapshot = null;
    });
  }

  void _onPanUpdate(DragUpdateDetails d) {
    final vp = _panViewport;
    if (vp == null || _panStartCanvas == null) return;

    final elev = _currentElevation();
    final delta = d.localPosition - _panStartCanvas!;
    final dLocalX = delta.dx / vp.scale;
    final dLocalY = -delta.dy / vp.scale; // Y invertido

    // ── Drag corner node ──────────────────────────────────────────────────────
    if (_activeHandle == ElevationHandle.nodeLeft ||
        _activeHandle == ElevationHandle.nodeRight) {
      final snap = _panLevelsSnapshot;
      if (snap == null) return;

      final newY = d.localPosition.dy;
      var newH = vp.toLocalY(newY).clamp(0.1, double.infinity);
      newH = _snapLocalY(newH, elev);

      final updated = _activeHandle == ElevationHandle.nodeLeft
          ? snap.copyWith(
              leftHeight: newH,
              coronacion: math.max(newH, snap.effectiveRightHeight),
            )
          : snap.copyWith(
              rightHeight: newH,
              coronacion: math.max(snap.effectiveLeftHeight, newH),
            );
      _upsert(elev.copyWith(levels: updated));
      return;
    }

    // ── Resize opening ────────────────────────────────────────────────────────
    if (_activeHandle != ElevationHandle.none &&
        _panOpeningSnapshot != null) {
      _applyResize(elev, dLocalX, dLocalY);
      return;
    }

    // ── Move opening ──────────────────────────────────────────────────────────
    if (_panOpeningSnapshot != null) {
      _applyMove(elev, dLocalX, dLocalY);
    }
  }

  void _onPanEnd(DragEndDetails d) {
    setState(() {
      _activeHandle = ElevationHandle.none;
      _panOpeningSnapshot = null;
      _panLevelsSnapshot = null;
      _panStartCanvas = null;
      _panViewport = null;
    });
  }

  void _applyMove(WallElevation elev, double dX, double dY) {
    final orig = _panOpeningSnapshot!;
    var newX = (orig.xOffset + dX).clamp(0.0, _wall.length - orig.width);
    var newY = (orig.sillHeight + dY).clamp(
      0.0,
      elev.levels.coronacion - orig.height,
    );
    newX = _snapLocalX(newX, elev);
    newY = _snapLocalY(newY, elev);

    _upsert(_uc.updateOpening(
      elev,
      orig.copyWith(xOffset: newX, sillHeight: newY),
    ));
  }

  void _applyResize(WallElevation elev, double dX, double dY) {
    final orig = _panOpeningSnapshot!;
    final h = _activeHandle;

    double x = orig.xOffset;
    double w = orig.width;
    double sy = orig.sillHeight;
    double oh = orig.height;

    // Ajustar según el handle activo
    if (h == ElevationHandle.left ||
        h == ElevationHandle.topLeft ||
        h == ElevationHandle.bottomLeft) {
      final newX = (orig.xOffset + dX).clamp(0.0, orig.xOffset + orig.width - 0.1);
      w = orig.xOffset + orig.width - newX;
      x = newX;
    }
    if (h == ElevationHandle.right ||
        h == ElevationHandle.topRight ||
        h == ElevationHandle.bottomRight) {
      w = (orig.width + dX).clamp(0.1, _wall.length - orig.xOffset);
    }
    if (h == ElevationHandle.bottom ||
        h == ElevationHandle.bottomLeft ||
        h == ElevationHandle.bottomRight) {
      final newSill = (orig.sillHeight + dY).clamp(
        0.0,
        orig.sillHeight + orig.height - 0.1,
      );
      oh = orig.sillHeight + orig.height - newSill;
      sy = newSill;
    }
    if (h == ElevationHandle.top ||
        h == ElevationHandle.topLeft ||
        h == ElevationHandle.topRight) {
      oh = (orig.height + dY).clamp(0.1, elev.levels.coronacion - orig.sillHeight);
    }

    x = _snapLocalX(x, elev);
    sy = _snapLocalY(sy, elev);

    _upsert(_uc.updateOpening(
      elev,
      orig.copyWith(xOffset: x, width: w, sillHeight: sy, height: oh),
    ));
  }

  // ── Hit testing ───────────────────────────────────────────────────────────

  ElevationHandle _hitTestResizeHandles(
    Offset pos,
    WallOpening o,
    ElevationViewport vp,
  ) {
    final rect = vp.toCanvasRect(o);
    const r = ElevationViewport.kHandleRadius + 4.0;

    final handles = [
      (ElevationHandle.topLeft, rect.topLeft),
      (ElevationHandle.topRight, rect.topRight),
      (ElevationHandle.bottomLeft, rect.bottomLeft),
      (ElevationHandle.bottomRight, rect.bottomRight),
      (ElevationHandle.left, rect.centerLeft),
      (ElevationHandle.right, rect.centerRight),
      (ElevationHandle.top, rect.topCenter),
      (ElevationHandle.bottom, rect.bottomCenter),
    ];

    for (final (handle, hpos) in handles) {
      if ((pos - hpos).distance < r) return handle;
    }
    return ElevationHandle.none;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  void _removeSelected() {
    if (_selectedOpeningId == null) return;
    final elev = _currentElevation();
    _upsert(_uc.removeOpening(elev, _selectedOpeningId!));
    setState(() => _selectedOpeningId = null);
  }

  void _toggleChainMode(bool value) {
    _upsert(_uc.setChainMode(_currentElevation(), value));
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final elevation = _watchElevation();
    final settings = ref.watch(projectSettingsProvider);
    final quant = WallQuantification.compute(elevation, _wall.length);

    // Computar validación
    final validationMap = <String, ValidationSeverity>{};
    for (final o in elevation.openings) {
      final r = WallCslService.validateOpening(o, elevation, _wall);
      if (r.severity != ValidationSeverity.valid) {
        validationMap[o.id] = r.severity;
      }
    }

    return Scaffold(
      backgroundColor: LevonColors.canvasBg,
      appBar: AppBar(
        backgroundColor: Colors.white,
        title: const Text(
          'Elevación de muro',
          style: TextStyle(
            color: LevonColors.textPrimary,
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new, size: 18, color: LevonColors.navy),
          onPressed: () => Navigator.of(context).pop(),
        ),
        actions: [
          Row(
            children: [
              const Text('Encadenar',
                  style: TextStyle(
                      fontSize: 11, color: LevonColors.textSecondary)),
              const SizedBox(width: 4),
              Switch(
                value: elevation.chainModeEnabled,
                onChanged: _toggleChainMode,
                activeThumbColor: LevonColors.navy,
                materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              ),
              const SizedBox(width: 8),
            ],
          ),
        ],
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_showSnapBar) _buildSnapBar(),
          if (_showSnapBar) const Divider(height: 1),
          Expanded(
            child: LayoutBuilder(builder: (_, constraints) {
              _canvasSize = Size(constraints.maxWidth, constraints.maxHeight);
              final vp = _makeViewport(elevation, _canvasSize);
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (d) => _onTapUp(d, vp),
                onPanStart: _tool == _ElevationTool.select ? _onPanStart : null,
                onPanUpdate: _tool == _ElevationTool.select ? _onPanUpdate : null,
                onPanEnd: _tool == _ElevationTool.select ? _onPanEnd : null,
                child: CustomPaint(
                  painter: WallElevationPainter(
                    wall: _wall,
                    elevation: elevation,
                    selectedOpeningId: _tool == _ElevationTool.delete
                        ? _deletePendingId
                        : _selectedOpeningId,
                    unitSystem: settings.defaults.baseUnit,
                    precision: settings.precision.lengthPrecision,
                    validationState: validationMap,
                    activeHandle: _activeHandle,
                    showHandles: _tool == _ElevationTool.select,
                  ),
                  child: const SizedBox.expand(),
                ),
              );
            }),
          ),
          const Divider(height: 1),
          _buildQuantBar(quant, settings.defaults.baseUnit),
          const Divider(height: 1),
          _buildActionBar(elevation),
        ],
      ),
      bottomNavigationBar: _buildMainToolbar(),
    );
  }

  // ── Snap bar ───────────────────────────────────────────────────────────────

  Widget _buildSnapBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      color: LevonColors.surface,
      child: Row(
        children: [
          const Text('Snap:',
              style: TextStyle(fontSize: 11, color: LevonColors.textSecondary)),
          const SizedBox(width: 8),
          _snapChip('NMS', _snapToNms,
              () => setState(() => _snapToNms = !_snapToNms)),
          const SizedBox(width: 6),
          _snapChip('Aperturas', _snapToOpenings,
              () => setState(() => _snapToOpenings = !_snapToOpenings)),
          const SizedBox(width: 12),
          const Text('Paso:',
              style: TextStyle(fontSize: 11, color: LevonColors.textSecondary)),
          const SizedBox(width: 6),
          ...[0.01, 0.05, 0.10, 0.20].map((step) => Padding(
                padding: const EdgeInsets.only(right: 4),
                child: _snapChip(
                  '${(step * 100).round()} cm',
                  _snapStep == step,
                  () => setState(() => _snapStep = step),
                ),
              )),
        ],
      ),
    );
  }

  Widget _snapChip(String label, bool active, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: active
              ? LevonColors.navy.withValues(alpha: 0.12)
              : Colors.transparent,
          border: Border.all(
            color: active ? LevonColors.navy : LevonColors.divider,
          ),
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 10,
            color: active ? LevonColors.navy : LevonColors.textSecondary,
            fontWeight: active ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  // ── Main Toolbar ───────────────────────────────────────────────────────────

  Widget _buildMainToolbar() {
    return Container(
      color: Colors.white,
      padding: EdgeInsets.only(
        left: 8,
        right: 8,
        top: 8,
        bottom: 8 + MediaQuery.of(context).padding.bottom,
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _toolBtn(
            Icons.near_me_outlined,
            'Seleccionar',
            _tool == _ElevationTool.select,
            () => setState(() {
              _tool = _ElevationTool.select;
              _selectedOpeningId = null;
              _deletePendingId = null;
            }),
          ),
          _toolBtn(
            Icons.door_front_door_outlined,
            'Puerta',
            _tool == _ElevationTool.createDoor,
            () => setState(() {
              _tool = _ElevationTool.createDoor;
              _selectedOpeningId = null;
              _deletePendingId = null;
            }),
          ),
          _toolBtn(
            Icons.window_outlined,
            'Ventana',
            _tool == _ElevationTool.createWindow,
            () => setState(() {
              _tool = _ElevationTool.createWindow;
              _selectedOpeningId = null;
              _deletePendingId = null;
            }),
          ),
          _toolBtn(
            Icons.crop_free_outlined,
            'Hueco',
            _tool == _ElevationTool.createOpening,
            () => setState(() {
              _tool = _ElevationTool.createOpening;
              _selectedOpeningId = null;
              _deletePendingId = null;
            }),
          ),
          _toolBtn(
            Icons.delete_outline,
            'Eliminar',
            _tool == _ElevationTool.delete,
            () => setState(() {
              _tool = _ElevationTool.delete;
              _selectedOpeningId = null;
              _deletePendingId = null;
            }),
            color: LevonColors.errorRed,
          ),
          IconButton(
            icon: Icon(
              Icons.tune_outlined,
              color: _showSnapBar ? LevonColors.navy : LevonColors.textSecondary,
            ),
            onPressed: () => setState(() => _showSnapBar = !_showSnapBar),
            tooltip: 'Ajustes de snap',
          ),
        ],
      ),
    );
  }

  Widget _toolBtn(
    IconData icon,
    String label,
    bool active,
    VoidCallback onTap, {
    Color color = LevonColors.navy,
  }) {
    return Tooltip(
      message: label,
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: LevonDuration.fast,
          curve: Curves.easeOut,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          constraints: const BoxConstraints(minHeight: 48),
          decoration: BoxDecoration(
            color: active
                ? (color == LevonColors.errorRed ? LevonColors.errorRed : LevonColors.yellow)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(LevonRadius.pill),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 18,
                color: active
                    ? (color == LevonColors.errorRed ? Colors.white : LevonColors.navy)
                    : color.withValues(alpha: 0.85),
              ),
              AnimatedSize(
                duration: LevonDuration.fast,
                child: active
                    ? Row(children: [
                        const SizedBox(width: 6),
                        Text(
                          label,
                          style: TextStyle(
                            color: color == LevonColors.errorRed ? Colors.white : LevonColors.navy,
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

  // ── Quant bar ──────────────────────────────────────────────────────────────

  Widget _buildQuantBar(WallQuantification quant, UnitSystem unit) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 7),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _quantChip('Bruta', UnitFormatter.area(quant.grossArea, unit),
              LevonColors.textSecondary),
          _quantChip('Aperturas', UnitFormatter.area(quant.openingArea, unit),
              LevonColors.warnOrange),
          _quantChip(
              'Neta', UnitFormatter.area(quant.netArea, unit), LevonColors.okGreen),
        ],
      ),
    );
  }

  Widget _quantChip(String label, String value, Color color) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(value,
            style: TextStyle(
                fontSize: 13, fontWeight: FontWeight.w700, color: color)),
        const SizedBox(height: 2),
        Text(label,
            style: const TextStyle(
                fontSize: 10, color: LevonColors.textSecondary)),
      ],
    );
  }

  // ── Action bar ─────────────────────────────────────────────────────────────

  Widget _buildActionBar(WallElevation elevation) {
    final hasSelection = _selectedOpeningId != null;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      child: Row(
        children: [
          if (hasSelection) ...[
            TextButton.icon(
              icon: const Icon(Icons.delete_outline,
                  size: 15, color: LevonColors.errorRed),
              label: const Text('Eliminar hueco',
                  style:
                      TextStyle(color: LevonColors.errorRed, fontSize: 11)),
              onPressed: _removeSelected,
            ),
          ],
          const Spacer(),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Cerrar',
                style: TextStyle(
                    fontSize: 12, color: LevonColors.textSecondary)),
          ),
        ],
      ),
    );
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

/// Abre el WEP como pantalla completa para el muro dado.
Future<void> openWallElevationPanel(BuildContext context, Wall wall) {
  return Navigator.push(
    context,
    MaterialPageRoute(builder: (_) => WallElevationPanel(wall: wall)),
  );
}
