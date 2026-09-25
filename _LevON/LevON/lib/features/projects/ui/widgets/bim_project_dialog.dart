import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/bim/services/bim_code_generator.dart';
import 'package:levon/persistence/project_repository.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/ui/theme/levon_tokens.dart';

/// Diálogo de creación/edición de proyectos BIM.
///
/// Reemplaza el `AlertDialog` simple con un formulario BIM completo:
/// nombre, código BIM, descripción, disciplina, autor, unidades y precisión.
///
/// Uso:
/// ```dart
/// final result = await BIMProjectDialog.show(context, ref);
/// if (result != null) { /* crear proyecto con result */ }
/// ```
class BIMProjectDialog extends ConsumerStatefulWidget {
  /// Si se pasa [initialProject], el diálogo opera en modo edición (rename).
  final ProjectSummary? initialProject;

  /// Conjunto de códigos BIM existentes para validar unicidad.
  final Set<String> existingCodes;

  const BIMProjectDialog({
    super.key,
    this.initialProject,
    required this.existingCodes,
  });

  /// Muestra el diálogo y retorna el [BIMProjectFormData] si el usuario confirma,
  /// o null si cancela.
  static Future<BIMProjectFormData?> show(
    BuildContext context,
    WidgetRef ref, {
    ProjectSummary? initialProject,
  }) async {
    // Cargar proyectos actuales para validar unicidad del código
    final projects = await ref.read(projectRepositoryProvider).listProjects();
    final existingCodes = {
      for (final p in projects)
        if (p.bimCode != null) p.bimCode!
    };

    if (!context.mounted) return null;

    return showDialog<BIMProjectFormData>(
      context: context,
      barrierDismissible: false,
      builder: (_) => BIMProjectDialog(
        initialProject: initialProject,
        existingCodes: existingCodes,
      ),
    );
  }

  @override
  ConsumerState<BIMProjectDialog> createState() => _BIMProjectDialogState();
}

class _BIMProjectDialogState extends ConsumerState<BIMProjectDialog> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _codeCtrl;
  late final TextEditingController _descCtrl;
  late final TextEditingController _authorCtrl;

  String _discipline = 'Arquitectura';
  String _codeError = '';

  bool get _isEditing => widget.initialProject != null;

  @override
  void initState() {
    super.initState();
    final proj = widget.initialProject;
    _nameCtrl = TextEditingController(text: proj?.title ?? '');
    _codeCtrl = TextEditingController(
      text: proj?.bimCode ??
          BimCodeGenerator.generateProjectCode(widget.existingCodes),
    );
    _descCtrl = TextEditingController(text: proj?.description ?? '');
    _authorCtrl = TextEditingController(text: '');
    _discipline = proj?.discipline.isNotEmpty == true
        ? proj!.discipline
        : 'Arquitectura';
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _codeCtrl.dispose();
    _descCtrl.dispose();
    _authorCtrl.dispose();
    super.dispose();
  }

  bool _validateCode(String code) {
    final normalized = BimCodeGenerator.normalize(code);
    if (normalized.isEmpty) {
      setState(() => _codeError = 'El código no puede estar vacío');
      return false;
    }
    if (!BimCodeGenerator.isValidCode(normalized)) {
      setState(
          () => _codeError = 'Formato inválido. Ej: BIM001, ARC042, LEV007');
      return false;
    }
    // Al editar, el mismo código del proyecto es válido
    final isOwnCode = widget.initialProject?.bimCode == normalized;
    if (!isOwnCode && widget.existingCodes.contains(normalized)) {
      setState(() => _codeError = 'Código ya existe en otro proyecto');
      return false;
    }
    setState(() => _codeError = '');
    return true;
  }

  void _onSubmit() {
    final name = _nameCtrl.text.trim();
    final code = BimCodeGenerator.normalize(_codeCtrl.text);

    if (name.isEmpty) return;
    if (!_validateCode(code)) return;

    Navigator.of(context).pop(BIMProjectFormData(
      title: name,
      bimCode: code,
      description: _descCtrl.text.trim(),
      discipline: _discipline,
      author: _authorCtrl.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final isEditing = _isEditing;

    return AlertDialog(
      key: const Key('bim_project_dialog'),
      title: Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: LevonColors.navy,
              borderRadius: BorderRadius.circular(6),
            ),
            child: const Icon(Icons.architecture,
                color: Colors.white, size: 18),
          ),
          const SizedBox(width: 10),
          Text(
            isEditing ? 'Editar Proyecto' : 'Nuevo Proyecto BIM',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
          ),
        ],
      ),
      content: SizedBox(
        width: 400,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              // ── Nombre ──────────────────────────────────────────────────
              TextField(
                key: const Key('input_project_name'),
                controller: _nameCtrl,
                autofocus: true,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Nombre del Proyecto *',
                  hintText: 'Ej. Casa García, Edificio Colón',
                  prefixIcon: Icon(Icons.label_outline, size: 18),
                ),
                onSubmitted: (_) => _onSubmit(),
              ),
              const SizedBox(height: 14),

              // ── Código BIM ───────────────────────────────────────────────
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: TextField(
                      key: const Key('input_bim_code'),
                      controller: _codeCtrl,
                      textCapitalization: TextCapitalization.characters,
                      decoration: InputDecoration(
                        labelText: 'Código BIM *',
                        hintText: 'BIM001',
                        errorText: _codeError.isEmpty ? null : _codeError,
                        prefixIcon: const Icon(Icons.qr_code_2, size: 18),
                        helperText: 'Único, ej: BIM001, ARC042',
                      ),
                      onChanged: (v) {
                        _validateCode(v);
                      },
                    ),
                  ),
                  const SizedBox(width: 8),
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Tooltip(
                      message: 'Generar código automático',
                      child: IconButton(
                        key: const Key('btn_generar_codigo_bim'),
                        icon: const Icon(Icons.auto_fix_high_outlined),
                        onPressed: () {
                          final newCode = BimCodeGenerator.generateProjectCode(
                            widget.existingCodes,
                          );
                          _codeCtrl.text = newCode;
                          _validateCode(newCode);
                        },
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),

              // ── Descripción ───────────────────────────────────────────────
              TextField(
                key: const Key('input_project_description'),
                controller: _descCtrl,
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
                decoration: const InputDecoration(
                  labelText: 'Descripción',
                  hintText: 'Levantamiento arquitectónico de…',
                  prefixIcon: Icon(Icons.notes_outlined, size: 18),
                ),
              ),
              const SizedBox(height: 14),

              // ── Disciplina ────────────────────────────────────────────────
              DropdownButtonFormField<String>(
                key: const Key('dropdown_discipline'),
                initialValue: _discipline,
                decoration: const InputDecoration(
                  labelText: 'Disciplina',
                  prefixIcon: Icon(Icons.category_outlined, size: 18),
                ),
                items: const [
                  'Arquitectura',
                  'Estructuras',
                  'MEP',
                  'Urbanismo',
                  'Interiores',
                  'Otro',
                ].map((d) => DropdownMenuItem(value: d, child: Text(d))).toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _discipline = v);
                },
              ),
              const SizedBox(height: 14),

              // ── Autor ─────────────────────────────────────────────────────
              TextField(
                key: const Key('input_project_author'),
                controller: _authorCtrl,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Autor / Responsable',
                  hintText: 'Nombre del arquitecto o empresa',
                  prefixIcon: Icon(Icons.person_outline, size: 18),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          key: const Key('btn_cancelar_dialog'),
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Cancelar'),
        ),
        FilledButton.icon(
          key: const Key('btn_crear_proyecto'),
          icon: Icon(isEditing ? Icons.check : Icons.add, size: 16),
          label: Text(isEditing ? 'Guardar' : 'Crear Proyecto'),
          onPressed: _onSubmit,
        ),
      ],
    );
  }
}

/// Datos del formulario BIM retornados por [BIMProjectDialog].
class BIMProjectFormData {
  final String title;
  final String bimCode;
  final String description;
  final String discipline;
  final String author;

  const BIMProjectFormData({
    required this.title,
    required this.bimCode,
    required this.description,
    required this.discipline,
    required this.author,
  });

  /// Convierte los datos del formulario en un nuevo [Project].
  Project toNewProject() => Project(
        title: title,
        bimCode: bimCode,
        description: description,
        discipline: discipline,
        author: author,
      );
}
