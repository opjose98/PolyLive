import 'package:flutter/material.dart';
import 'package:levon/persistence/project_repository.dart';
import 'package:levon/ui/theme/levon_tokens.dart';

// ─── PROJECT LIST TILE ────────────────────────────────────────────────────────

/// Tarjeta de proyecto BIM en modo lightweight para la pantalla de listado.
///
/// Diseño: código BIM como badge lateral, nombre, descripción corta y metadata.
/// Prioriza velocidad de escaneo: muchos proyectos en poco espacio.
///
/// Los Spaces (entidades visuales principales) usan [SpaceCard] con preview.
class ProjectCard extends StatelessWidget {
  final ProjectSummary project;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  const ProjectCard({
    super.key,
    required this.project,
    required this.onTap,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    final hasBimCode = project.bimCode != null && project.bimCode!.isNotEmpty;
    final hasDiscipline = project.discipline.isNotEmpty;
    final hasDescription = project.description.isNotEmpty;

    return Card(
      key: Key('project_card_${project.id}'),
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        borderRadius: BorderRadius.circular(LevonRadius.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // ── BIM Code badge vertical ───────────────────────────────────
              _BimCodeBadge(
                code: hasBimCode ? project.bimCode! : '—',
                discipline: project.discipline,
              ),
              const SizedBox(width: 14),

              // ── Info ──────────────────────────────────────────────────────
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Nombre del proyecto
                    Text(
                      project.title,
                      style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 14,
                        color: LevonColors.textPrimary,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),

                    // Descripción (si existe)
                    if (hasDescription) ...[
                      const SizedBox(height: 2),
                      Text(
                        project.description,
                        style: const TextStyle(
                          color: LevonColors.textSecondary,
                          fontSize: 12,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],

                    const SizedBox(height: 6),

                    // Meta row: disciplina + fecha + elementos
                    Row(
                      children: [
                        if (hasDiscipline) ...[
                          _InlineBadge(project.discipline),
                          const SizedBox(width: 8),
                        ],
                        const Icon(
                          Icons.schedule_outlined,
                          size: 11,
                          color: LevonColors.textDisabled,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          _formatDate(project.updatedAt),
                          style: const TextStyle(
                            color: LevonColors.textSecondary,
                            fontSize: 11,
                          ),
                        ),
                        if (project.elementCount > 0) ...[
                          const Spacer(),
                          Text(
                            '${project.elementCount} elem.',
                            style: const TextStyle(
                              color: LevonColors.textDisabled,
                              fontSize: 10,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(width: 8),
              const Icon(
                Icons.chevron_right,
                color: LevonColors.textDisabled,
                size: 20,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatDate(DateTime date) {
    final now = DateTime.now();
    final diff = now.difference(date);
    if (diff.inMinutes < 1) return 'Ahora';
    if (diff.inHours < 1) return 'Hace ${diff.inMinutes} min';
    if (diff.inDays < 1) return 'Hace ${diff.inHours} h';
    if (diff.inDays == 1) return 'Ayer';
    if (diff.inDays < 7) return 'Hace ${diff.inDays} días';
    return '${date.day}/${date.month}/${date.year}';
  }
}

// ─── BIM CODE BADGE ───────────────────────────────────────────────────────────

/// Badge vertical para el código BIM del proyecto.
class _BimCodeBadge extends StatelessWidget {
  final String code;
  final String discipline;

  const _BimCodeBadge({required this.code, required this.discipline});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 54,
      height: 54,
      decoration: BoxDecoration(
        color: LevonColors.navy,
        borderRadius: BorderRadius.circular(LevonRadius.sm),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            code,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w800,
              fontFamily: 'monospace',
              letterSpacing: 0.6,
            ),
            textAlign: TextAlign.center,
          ),
          if (discipline.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              discipline.length > 4
                  ? discipline.substring(0, 3).toUpperCase()
                  : discipline.toUpperCase(),
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.55),
                fontSize: 8,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ─── INLINE BADGE ─────────────────────────────────────────────────────────────

class _InlineBadge extends StatelessWidget {
  final String text;
  const _InlineBadge(this.text);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: LevonColors.navy.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(LevonRadius.xs),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: LevonColors.navy,
          fontSize: 9,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
        ),
      ),
    );
  }
}

// ─── NEW PROJECT CARD ─────────────────────────────────────────────────────────

/// Tarjeta de "Nuevo Proyecto" al final del listado.
class NewProjectCard extends StatelessWidget {
  final VoidCallback onTap;
  const NewProjectCard({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      key: const Key('card_nuevo_proyecto'),
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
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: LevonColors.navy.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(LevonRadius.sm),
                ),
                child: const Icon(
                  Icons.add,
                  size: 28,
                  color: LevonColors.textDisabled,
                ),
              ),
              const SizedBox(width: 14),
              const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Nuevo Proyecto',
                    style: TextStyle(
                      color: LevonColors.textSecondary,
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                  SizedBox(height: 2),
                  Text(
                    'Crear desde cero',
                    style: TextStyle(
                      color: LevonColors.textDisabled,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
