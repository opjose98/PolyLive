import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/features/overlays/settings/settings_widgets.dart';
import 'package:levon/core/utils/unit_service.dart';
import 'package:levon/core/utils/precision_service.dart';

class SettingsContent extends ConsumerWidget {
  const SettingsContent({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(projectSettingsProvider);
    final notifier = ref.read(projectSettingsProvider.notifier);

    return SingleChildScrollView(
      padding: const EdgeInsets.only(bottom: 40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // ── PROYECTO ────────────────────────────────────────────────────────
          SettingsSection(
            title: 'Proyecto',
            children: [
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: _ProjectNameField(
                  initialName: settings.info.projectName,
                  onSave: (name) {
                    notifier.updateSettings(settings.copyWith(
                      info: settings.info.copyWith(projectName: name),
                    ));
                    // Sincronizar nombre con la entidad project activa.
                    final project = ref.read(projectProvider);
                    if (project != null) {
                      ref.read(projectProvider.notifier).state =
                          project.copyWith(title: name);
                    }
                  },
                ),
              ),
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: DropdownButtonFormField<UnitSystem>(
                  initialValue: settings.defaults.baseUnit,
                  decoration: const InputDecoration(labelText: 'Unidades Base'),
                  items: UnitSystem.values.map((u) {
                    return DropdownMenuItem(
                      value: u,
                      child: Text(UnitFormatter.unitName(u)),
                    );
                  }).toList(),
                  onChanged: (v) {
                    if (v != null) {
                      notifier.updateSettings(settings.copyWith(
                        defaults: settings.defaults.copyWith(baseUnit: v),
                      ));
                    }
                  },
                ),
              ),
            ],
          ),

          // ── PRECISIÓN Y SNAP ────────────────────────────────────────────────
          SettingsSection(
            title: 'Precisión y Snap',
            children: [
              SettingsSwitchRow(
                title: 'Snap a Nodos',
                value: settings.snap.snapToNodes,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                      snap: settings.snap.copyWith(snapToNodes: v)),
                ),
              ),
              SettingsSwitchRow(
                title: 'Snap a Grid',
                value: settings.snap.snapToGrid,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                      snap: settings.snap.copyWith(snapToGrid: v)),
                ),
              ),
              SettingsSwitchRow(
                title: 'Snap Angular',
                subtitle: 'Ajusta el ángulo al dibujar muros',
                value: settings.snap.angleSnapping,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                      snap: settings.snap.copyWith(angleSnapping: v)),
                ),
              ),
              // Selector de paso angular — visible solo cuando angleSnapping activo
              if (settings.snap.angleSnapping)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                  child: DropdownButtonFormField<int>(
                    initialValue: settings.snap.snapAngleStepDegrees,
                    decoration: const InputDecoration(
                      labelText: 'Paso angular',
                      isDense: true,
                    ),
                    items: const [10, 15, 30, 45, 60, 90].map((deg) {
                      return DropdownMenuItem(
                        value: deg,
                        child: Text('$deg°'),
                      );
                    }).toList(),
                    onChanged: (v) {
                      if (v != null) {
                        notifier.updateSettings(settings.copyWith(
                          snap: settings.snap.copyWith(snapAngleStepDegrees: v),
                        ));
                      }
                    },
                  ),
                ),
            ],
          ),

          // ── PRECISIÓN ───────────────────────────────────────────────────────
          SettingsSection(
            title: 'Precisión',
            children: [
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: DropdownButtonFormField<LengthPrecision>(
                  initialValue: settings.precision.lengthPrecision,
                  decoration: const InputDecoration(
                    labelText: 'Precisión de Longitud',
                    helperText: 'Afecta display, ribbons, labels y snap',
                  ),
                  items: LengthPrecision.values.map((p) {
                    return DropdownMenuItem(
                      value: p,
                      child: Text(PrecisionService.precisionName(p)),
                    );
                  }).toList(),
                  onChanged: (v) {
                    if (v != null) {
                      notifier.updateSettings(settings.copyWith(
                        precision: settings.precision
                            .copyWith(lengthPrecision: v),
                      ));
                    }
                  },
                ),
              ),
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: DropdownButtonFormField<int>(
                  initialValue: settings.precision.areaPrecision,
                  decoration: const InputDecoration(
                    labelText: 'Decimales de Área',
                    isDense: true,
                  ),
                  items: [0, 1, 2, 3].map((d) {
                    return DropdownMenuItem(
                      value: d,
                      child: Text('$d decimal${d == 1 ? '' : 'es'}'),
                    );
                  }).toList(),
                  onChanged: (v) {
                    if (v != null) {
                      notifier.updateSettings(settings.copyWith(
                        precision:
                            settings.precision.copyWith(areaPrecision: v),
                      ));
                    }
                  },
                ),
              ),
              Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: DropdownButtonFormField<int>(
                  initialValue: settings.precision.exportPrecision,
                  decoration: const InputDecoration(
                    labelText: 'Precisión de Exportación (DXF/IFC)',
                    helperText: 'Decimales en coordenadas exportadas',
                    isDense: true,
                  ),
                  items: [3, 4, 5, 6].map((d) {
                    return DropdownMenuItem(
                      value: d,
                      child: Text('$d dec — ${_exportPrecisionLabel(d)}'),
                    );
                  }).toList(),
                  onChanged: (v) {
                    if (v != null) {
                      notifier.updateSettings(settings.copyWith(
                        precision:
                            settings.precision.copyWith(exportPrecision: v),
                      ));
                    }
                  },
                ),
              ),
            ],
          ),

          // ── GRID ────────────────────────────────────────────────────────────
          SettingsSection(
            title: 'Grid',
            children: [
              SettingsSwitchRow(
                title: 'Mostrar Grid',
                value: settings.grid.showGrid,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(grid: settings.grid.copyWith(showGrid: v)),
                ),
              ),
              SettingsSliderRow(
                title: 'Tamaño de Celda',
                value: settings.grid.gridSize,
                min: 0.10,
                max: 2.0,
                divisions: 38,
                labelBuilder: (v) => UnitFormatter.length(v, settings.defaults.baseUnit),
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(grid: settings.grid.copyWith(gridSize: v)),
                ),
              ),
            ],
          ),

          // ── VISUALIZACIÓN ───────────────────────────────────────────────────
          SettingsSection(
            title: 'Visualización',
            children: [
              SettingsSwitchRow(
                title: 'Escala Anotativa',
                subtitle: 'Nodos y textos mantienen tamaño en pantalla',
                value: settings.visual.annotativeScaling,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                    visual: settings.visual.copyWith(annotativeScaling: v),
                  ),
                ),
              ),
              SettingsSwitchRow(
                title: 'Mostrar Habitaciones',
                value: settings.visual.showRooms,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                    visual: settings.visual.copyWith(showRooms: v),
                  ),
                ),
              ),
            ],
          ),

          // ── COMPORTAMIENTO ──────────────────────────────────────────────────
          SettingsSection(
            title: 'Comportamiento del Editor',
            children: [
              SettingsSwitchRow(
                title: 'Lupa de Precisión',
                subtitle: 'Muestra un zoom 2x al dibujar',
                value: settings.behavior.magnifierEnabled,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                    behavior: settings.behavior.copyWith(magnifierEnabled: v),
                  ),
                ),
              ),
              SettingsSwitchRow(
                title: 'Detección Automática (Rooms)',
                subtitle: 'Actualiza habitaciones al cerrar polígonos',
                value: settings.behavior.autoRoomDetection,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                    behavior: settings.behavior.copyWith(autoRoomDetection: v),
                  ),
                ),
              ),
              SettingsSwitchRow(
                title: 'Confirmar al Eliminar',
                subtitle: 'Pide confirmación antes de borrar elementos',
                value: settings.behavior.deleteConfirmation,
                onChanged: (v) => notifier.updateSettings(
                  settings.copyWith(
                    behavior: settings.behavior.copyWith(deleteConfirmation: v),
                  ),
                ),
              ),
            ],
          ),
          // ── ALMACENAMIENTO ──────────────────────────────────────────────────
          SettingsSection(
            title: 'Almacenamiento',
            children: [
              _PathPickerRow(
                label: 'Carpeta de Exportación',
                subtitle: 'DXF, IFC y .levon',
                currentPath: settings.storage.defaultExportPath,
                onPathSelected: (path) async {
                  // Guardar en settings del proyecto
                  notifier.updateSettings(settings.copyWith(
                    storage: settings.storage.copyWith(defaultExportPath: path),
                  ));
                  // Persistir globalmente en preferencias del dispositivo
                  await ref
                      .read(globalPrefsServiceProvider)
                      .saveDefaultExportPath(path);
                },
                onClear: () async {
                  notifier.updateSettings(settings.copyWith(
                    storage: settings.storage.copyWith(clearExportPath: true),
                  ));
                  await ref
                      .read(globalPrefsServiceProvider)
                      .clearDefaultExportPath();
                },
              ),
              _PathPickerRow(
                label: 'Carpeta de Proyectos',
                subtitle: 'Archivos .levon editables',
                currentPath: settings.storage.defaultProjectPath,
                onPathSelected: (path) async {
                  notifier.updateSettings(settings.copyWith(
                    storage:
                        settings.storage.copyWith(defaultProjectPath: path),
                  ));
                  await ref
                      .read(globalPrefsServiceProvider)
                      .saveDefaultProjectPath(path);
                },
                onClear: () async {
                  notifier.updateSettings(settings.copyWith(
                    storage: settings.storage.copyWith(clearProjectPath: true),
                  ));
                  await ref
                      .read(globalPrefsServiceProvider)
                      .clearDefaultProjectPath();
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

String _exportPrecisionLabel(int decimals) => switch (decimals) {
      3 => '≈ 1 mm',
      4 => '≈ 0.1 mm',
      5 => '≈ 0.01 mm',
      6 => '≈ 0.001 mm',
      _ => '',
    };

// ─── CAMPO EDITABLE NOMBRE PROYECTO ─────────────────────────────────────────

/// TextField con controller propio para evitar pérdida de foco al reconstruir.
class _ProjectNameField extends StatefulWidget {
  final String initialName;
  final void Function(String) onSave;

  const _ProjectNameField({required this.initialName, required this.onSave});

  @override
  State<_ProjectNameField> createState() => _ProjectNameFieldState();
}

class _ProjectNameFieldState extends State<_ProjectNameField> {
  late TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.initialName);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: _ctrl,
      decoration: const InputDecoration(labelText: 'Nombre del Proyecto'),
      onSubmitted: widget.onSave,
      onTapOutside: (_) => widget.onSave(_ctrl.text),
    );
  }
}

// ─── SELECTOR DE CARPETA ──────────────────────────────────────────────────────

/// Fila de configuración que muestra una ruta de carpeta con botones para
/// elegirla mediante el selector nativo del sistema y limpiarla.
///
/// Compatible con Android y Windows/Desktop a través de [FilePicker].
class _PathPickerRow extends StatelessWidget {
  final String label;
  final String subtitle;
  final String? currentPath;
  final Future<void> Function(String) onPathSelected;
  final Future<void> Function() onClear;

  const _PathPickerRow({
    required this.label,
    required this.subtitle,
    required this.currentPath,
    required this.onPathSelected,
    required this.onClear,
  });

  Future<void> _pickDirectory(BuildContext context) async {
    // Abrir el selector de carpetas nativo del sistema operativo
    final result = await FilePicker.platform.getDirectoryPath(
      dialogTitle: 'Elegir $label',
      initialDirectory: currentPath,
      lockParentWindow: true,
    );
    if (result != null) {
      await onPathSelected(result);
    }
  }

  @override
  Widget build(BuildContext context) {
    final hasPath = currentPath != null && currentPath!.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label,
                        style: const TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w500)),
                    Text(subtitle,
                        style:
                            const TextStyle(fontSize: 12, color: Colors.grey)),
                  ],
                ),
              ),
              // Botón "Elegir" — abre el selector nativo
              TextButton.icon(
                onPressed: () => _pickDirectory(context),
                icon: const Icon(Icons.folder_open_outlined, size: 16),
                label: const Text('Elegir'),
                style: TextButton.styleFrom(
                  visualDensity: VisualDensity.compact,
                ),
              ),
              // Botón de limpiar — solo visible si hay una ruta configurada
              if (hasPath)
                IconButton(
                  icon: const Icon(Icons.clear, size: 16),
                  tooltip: 'Limpiar ruta',
                  onPressed: onClear,
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          // Mostrar la ruta actual si está configurada
          if (hasPath)
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(
                currentPath!,
                style: const TextStyle(
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: Colors.black87,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
            )
          else
            Container(
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: const Text(
                'Sin configurar — se usará la carpeta por defecto del sistema',
                style: TextStyle(fontSize: 11, color: Colors.grey),
              ),
            ),
        ],
      ),
    );
  }
}
