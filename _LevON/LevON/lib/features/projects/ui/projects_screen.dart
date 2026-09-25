import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/bim/services/bim_code_generator.dart';
import 'package:levon/persistence/project_repository.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/projects/ui/widgets/project_card.dart';
import 'package:levon/features/projects/ui/widgets/bim_project_dialog.dart';
import 'package:levon/features/projects/ui/widgets/project_context_menu.dart';

/// Pantalla de listado de proyectos BIM — contenedor BIM superior.
///
/// Diseño lightweight: lista con BIM code badge, nombre y metadata.
/// Los espacios son la entidad visual primaria con preview real del canvas.
///
/// Features:
/// - Lista de [ProjectCard] con diseño compacto y escaneable
/// - Buscador expandible en AppBar (por nombre y código BIM)
/// - Menú contextual (long-press) con rename, duplicate, delete
/// - Diálogo [BIMProjectDialog] para creación de proyectos
class ProjectsScreen extends ConsumerStatefulWidget {
  const ProjectsScreen({super.key});

  @override
  ConsumerState<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends ConsumerState<ProjectsScreen> {
  bool _searchActive = false;
  final _searchCtrl = TextEditingController();
  final _searchFocus = FocusNode();

  @override
  void dispose() {
    _searchCtrl.dispose();
    _searchFocus.dispose();
    super.dispose();
  }

  void _activateSearch() {
    setState(() => _searchActive = true);
    _searchFocus.requestFocus();
  }

  void _deactivateSearch() {
    _searchCtrl.clear();
    ref.read(projectSearchQueryProvider.notifier).state = '';
    setState(() => _searchActive = false);
  }

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) return const _WebNotSupportedScreen();

    final projectsAsync = ref.watch(filteredProjectsProvider);

    return Scaffold(
      key: const Key('projects_scaffold'),
      appBar: _buildAppBar(),
      body: projectsAsync.when(
        loading: () => const Center(
          key: Key('projects_loading'),
          child: CircularProgressIndicator(),
        ),
        error: (e, _) => Center(
          key: const Key('projects_error'),
          child: Text('Error cargando proyectos: $e'),
        ),
        data: (projects) {
          if (projects.isEmpty && _searchActive) {
            return _buildEmptySearch();
          }
          if (projects.isEmpty) {
            return _buildEmptyProjects();
          }
          return ListView.separated(
            key: const Key('projects_list'),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            itemCount: projects.length + 1, // +1 for NewProjectCard
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (ctx, i) {
              if (i == projects.length) {
                return Padding(
                  padding: const EdgeInsets.only(top: 4, bottom: 12),
                  child: NewProjectCard(
                    onTap: () => _showNewProjectDialog(context),
                  ),
                );
              }
              final p = projects[i];
              return ProjectCard(
                key: Key('project_card_${p.id}'),
                project: p,
                onTap: () => context.push('/projects/${p.id}/workspaces'),
                onLongPress: () => _showProjectContextMenu(context, p),
              );
            },
          );
        },
      ),
    );
  }

  PreferredSizeWidget _buildAppBar() {
    if (_searchActive) {
      return AppBar(
        key: const Key('projects_appbar_search'),
        leading: IconButton(
          key: const Key('btn_cerrar_busqueda'),
          icon: const Icon(Icons.arrow_back),
          tooltip: 'Cancelar búsqueda',
          onPressed: _deactivateSearch,
        ),
        title: TextField(
          key: const Key('input_buscar_proyecto'),
          controller: _searchCtrl,
          focusNode: _searchFocus,
          decoration: const InputDecoration(
            hintText: 'Buscar por nombre o código BIM…',
            border: InputBorder.none,
            hintStyle: TextStyle(color: LevonColors.textSecondary),
          ),
          style: const TextStyle(fontSize: 16),
          onChanged: (q) {
            ref.read(projectSearchQueryProvider.notifier).state = q;
          },
        ),
        actions: [
          if (_searchCtrl.text.isNotEmpty)
            IconButton(
              key: const Key('btn_limpiar_busqueda'),
              icon: const Icon(Icons.clear),
              tooltip: 'Limpiar',
              onPressed: () {
                _searchCtrl.clear();
                ref.read(projectSearchQueryProvider.notifier).state = '';
                setState(() {});
              },
            ),
          const SizedBox(width: 4),
        ],
      );
    }

    return AppBar(
      key: const Key('projects_appbar'),
      title: SvgPicture.asset(
        'assets/images/levon_mark.svg',
        height: 34,
        semanticsLabel: 'LevON Logo',
      ),
      actions: [
        IconButton(
          key: const Key('btn_buscar_proyecto'),
          icon: const Icon(Icons.search_rounded),
          tooltip: 'Buscar proyecto',
          onPressed: _activateSearch,
        ),
        IconButton(
          key: const Key('btn_nuevo_proyecto'),
          icon: const Icon(Icons.add_circle_outline),
          tooltip: 'Nuevo proyecto',
          onPressed: () => _showNewProjectDialog(context),
        ),
        const SizedBox(width: 4),
      ],
    );
  }

  Widget _buildEmptySearch() {
    return Center(
      key: const Key('projects_search_empty'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.search_off_rounded,
              size: 56, color: LevonColors.textDisabled),
          const SizedBox(height: 16),
          Text(
            'Sin resultados',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: LevonColors.textSecondary,
                ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Prueba con otro nombre o código BIM',
            style: TextStyle(
                color: LevonColors.textDisabled, fontSize: 13),
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyProjects() {
    return Center(
      key: const Key('projects_empty'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.folder_open_outlined,
              size: 64, color: LevonColors.textDisabled),
          const SizedBox(height: 16),
          Text(
            'Sin proyectos',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  color: LevonColors.textSecondary,
                ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Crea tu primer proyecto BIM',
            style: TextStyle(color: LevonColors.textDisabled, fontSize: 13),
          ),
          const SizedBox(height: 24),
          FilledButton.icon(
            key: const Key('btn_crear_primer_proyecto'),
            icon: const Icon(Icons.add),
            label: const Text('Crear Proyecto'),
            onPressed: () => _showNewProjectDialog(context),
          ),
        ],
      ),
    );
  }

  // ── Acciones ──────────────────────────────────────────────────────────────

  Future<void> _showNewProjectDialog(BuildContext context) async {
    final formData = await BIMProjectDialog.show(context, ref);
    if (formData == null || !mounted) return;

    final project = formData.toNewProject();
    await ref.read(projectRepositoryProvider).saveProject(project);
    ref.invalidate(projectsListProvider);
  }

  void _showProjectContextMenu(BuildContext context, ProjectSummary p) {
    ProjectContextMenu.show(
      context,
      project: p,
      onRename: () => _renameProject(context, p),
      onDuplicate: () => _duplicateProject(context, p),
      onExport: () => _exportProject(context, p),
      onDelete: () => _confirmDeleteProject(context, p),
    );
  }

  Future<void> _renameProject(
      BuildContext context, ProjectSummary summary) async {
    final project =
        await ref.read(projectRepositoryProvider).loadProject(summary.id);

    if (!mounted) return;

    final allProjects = await ref.read(projectRepositoryProvider).listProjects();
    final existingCodes = {
      for (final p in allProjects)
        if (p.bimCode != null && p.id != summary.id) p.bimCode!
    };

    if (!mounted) return;

    final formData = await showDialog<BIMProjectFormData>(
      context: this.context,
      barrierDismissible: false,
      builder: (_) => BIMProjectDialog(
        initialProject: summary,
        existingCodes: existingCodes,
      ),
    );

    if (formData == null || !mounted) return;

    final updated = project.copyWith(
      title: formData.title,
      bimCode: formData.bimCode,
      description: formData.description,
      discipline: formData.discipline,
      author: formData.author,
    );

    await ref.read(projectRepositoryProvider).saveProject(updated);
    ref.invalidate(projectsListProvider);
  }

  Future<void> _duplicateProject(
      BuildContext context, ProjectSummary summary) async {
    final original =
        await ref.read(projectRepositoryProvider).loadProject(summary.id);

    final allProjects = await ref.read(projectRepositoryProvider).listProjects();
    final existingCodes = {
      for (final p in allProjects)
        if (p.bimCode != null) p.bimCode!
    };

    final newCode = BimCodeGenerator.generateProjectCode(existingCodes);

    final duplicated = Project(
      title: '${original.title} (copia)',
      bimCode: newCode,
      description: original.description,
      discipline: original.discipline,
      author: original.author,
      spaces: Map.fromEntries(
        original.spaces.entries.map((e) => MapEntry(
          e.key,
          SpaceGeometry(
            id: e.value.id,
            name: e.value.name,
            walls: e.value.walls,
            columns: e.value.columns,
            wallElevations: e.value.wallElevations,
          ),
        )),
      ),
    );

    await ref.read(projectRepositoryProvider).saveProject(duplicated);
    ref.invalidate(projectsListProvider);

    if (mounted) {
      ScaffoldMessenger.of(this.context).showSnackBar(
        SnackBar(
          content:
              Text('Proyecto duplicado como "$newCode: ${duplicated.title}"'),
          behavior: SnackBarBehavior.floating,
        ),
      );
    }
  }

  void _exportProject(BuildContext context, ProjectSummary summary) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Abrir el proyecto para exportarlo desde el editor'),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  void _confirmDeleteProject(BuildContext context, ProjectSummary p) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        key: const Key('dialog_confirmar_eliminar'),
        title: const Text('Eliminar Proyecto'),
        content: RichText(
          text: TextSpan(
            style: Theme.of(context).textTheme.bodyMedium,
            children: [
              const TextSpan(text: '¿Eliminar '),
              if (p.bimCode != null)
                TextSpan(
                  text: '${p.bimCode} ',
                  style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      fontFamily: 'monospace'),
                ),
              TextSpan(
                text: '"${p.title}"',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              const TextSpan(text: '?\nEsta acción no se puede deshacer.'),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: LevonColors.errorRed),
            onPressed: () {
              Navigator.pop(context);
              _deleteProject(p.id);
            },
            child: const Text('Eliminar'),
          ),
        ],
      ),
    );
  }

  Future<void> _deleteProject(String id) async {
    await ref.read(projectRepositoryProvider).deleteProject(id);
    ref.invalidate(projectsListProvider);
  }
}

// ─── WEB NOT SUPPORTED ────────────────────────────────────────────────────────

class _WebNotSupportedScreen extends StatelessWidget {
  const _WebNotSupportedScreen();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(
              'assets/images/levon_logo.svg',
              width: 140,
              height: 140,
            ),
            const SizedBox(height: 24),
            Text(
              'LevON',
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: LevonColors.navy,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'Disponible en Android y Windows',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: LevonColors.textSecondary,
                  ),
            ),
            const SizedBox(height: 4),
            const Text(
              'El almacenamiento de archivos no está disponible en navegadores.',
              textAlign: TextAlign.center,
              style:
                  TextStyle(color: LevonColors.textSecondary, fontSize: 13),
            ),
          ],
        ),
      ),
    );
  }
}
