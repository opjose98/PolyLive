import 'package:flutter/material.dart';
import 'package:levon/persistence/project_repository.dart';
import 'package:levon/ui/theme/levon_tokens.dart';

/// Menú contextual de proyecto (long-press sobre ProjectCard).
///
/// Opciones: Renombrar, Duplicar, Exportar, Eliminar.
/// Todas las acciones excepto "Eliminar" son funcionales.
class ProjectContextMenu extends StatelessWidget {
  final ProjectSummary project;
  final VoidCallback onRename;
  final VoidCallback onDuplicate;
  final VoidCallback onExport;
  final VoidCallback onDelete;

  const ProjectContextMenu({
    super.key,
    required this.project,
    required this.onRename,
    required this.onDuplicate,
    required this.onExport,
    required this.onDelete,
  });

  /// Muestra el menú contextual como bottom sheet modal.
  static void show(
    BuildContext context, {
    required ProjectSummary project,
    required VoidCallback onRename,
    required VoidCallback onDuplicate,
    required VoidCallback onExport,
    required VoidCallback onDelete,
  }) {
    showModalBottomSheet(
      context: context,
      useRootNavigator: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => ProjectContextMenu(
        project: project,
        onRename: onRename,
        onDuplicate: onDuplicate,
        onExport: onExport,
        onDelete: onDelete,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        key: const Key('project_context_menu'),
        mainAxisSize: MainAxisSize.min,
        children: [
          // ── Header ────────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 8),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: LevonColors.navy,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Center(
                    child: Text(
                      project.bimCode ?? '—',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        fontFamily: 'monospace',
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        project.title,
                        style: const TextStyle(
                          fontWeight: FontWeight.w700,
                          fontSize: 15,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (project.discipline.isNotEmpty)
                        Text(
                          project.discipline,
                          style: const TextStyle(
                            color: LevonColors.textSecondary,
                            fontSize: 12,
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

          // ── Acciones ─────────────────────────────────────────────────────
          ListTile(
            key: const Key('menu_renombrar_proyecto'),
            leading: const Icon(Icons.edit_outlined, size: 20),
            title: const Text('Editar / Renombrar'),
            subtitle: const Text('Nombre, código BIM, descripción'),
            onTap: () {
              Navigator.pop(context);
              onRename();
            },
          ),
          ListTile(
            key: const Key('menu_duplicar_proyecto'),
            leading: const Icon(Icons.copy_outlined, size: 20),
            title: const Text('Duplicar Proyecto'),
            subtitle: const Text('Copia con nuevo código BIM'),
            onTap: () {
              Navigator.pop(context);
              onDuplicate();
            },
          ),
          ListTile(
            key: const Key('menu_exportar_proyecto'),
            leading: const Icon(Icons.ios_share_outlined, size: 20),
            title: const Text('Exportar .levon'),
            subtitle: const Text('Compartir entre dispositivos'),
            onTap: () {
              Navigator.pop(context);
              onExport();
            },
          ),
          const Divider(height: 1),
          ListTile(
            key: const Key('menu_eliminar_proyecto'),
            leading: const Icon(Icons.delete_outline,
                color: LevonColors.errorRed, size: 20),
            title: const Text('Eliminar',
                style: TextStyle(color: LevonColors.errorRed)),
            subtitle: const Text('No se puede deshacer'),
            onTap: () {
              Navigator.pop(context);
              onDelete();
            },
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}
