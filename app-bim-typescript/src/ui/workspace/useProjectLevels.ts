// =============================================================================
// useProjectLevels — Niveles y fases del espacio de trabajo (son de cada espacio)
// =============================================================================
//
// Une las tres piezas que antes vivían sueltas en la pantalla:
//   MarkerStore (persistencia y validación) → workspaceStore (selectores de
//   rango) → EditorController (qué se ve, se calca o es "existente").
// Crear, renombrar, borrar o cambiar la cota pasa SIEMPRE por MarkerStore y
// luego se recarga: hay una sola fuente de verdad.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import type { AppServices } from '../../application/AppServices';
import type { EditorController } from '../../application/editor/EditorController';
import { editorScopes, levelViewOf } from '../../application/workspace/levelScope';
import type { MarkerKind, ProjectMarker } from '../../domain/objects/marker';
import { workspaceStore } from '../../state/workspaceStore';
import type { RangeEditHandlers } from './RangeSelector';
import { toast } from '../primitives';
import { haptic } from '../design/haptics';

export function useProjectLevels({
  services,
  projectId,
  spaceId,
  editor,
}: {
  services: AppServices;
  projectId?: string;
  spaceId: string;
  editor: EditorController;
}) {
  const scope = useMemo(() => (projectId ? { projectId, spaceId } : null), [projectId, spaceId]);
  const levelsState = useStore(workspaceStore, (s) => s.levels);
  const phasesState = useStore(workspaceStore, (s) => s.phases);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    if (!scope) return;
    const toItem = (m: ProjectMarker) => ({ id: m.id, name: m.name, value: m.value, base: m.isBase });
    const [lv, ph] = await Promise.all([services.markers.list(scope, 'level'), services.markers.list(scope, 'phase')]);
    const ws = workspaceStore.getState();
    ws.setRangeItems('levels', lv.map(toItem));
    ws.setRangeItems('phases', ph.map(toItem));
    setLoaded(true);
  }, [services, scope]);

  useEffect(() => {
    reload().catch(() => toast('No se pudieron leer los niveles del proyecto.', { kind: 'error' }));
  }, [reload]);

  const view = useMemo(() => levelViewOf(levelsState, phasesState), [levelsState, phasesState]);

  // El editor ve lo que dicen los selectores.
  useEffect(() => {
    if (!loaded) return;
    const { level, phase } = editorScopes(view);
    editor.setScope(level, phase);
  }, [editor, loaded, view]);

  const handlersFor = useCallback(
    (kind: MarkerKind, label: string): RangeEditHandlers => {
      const failed = () => toast(`No se pudo guardar el ${label.toLowerCase()}.`, { kind: 'error' });
      return {
        onAdd: () => {
          if (!scope) return;
          services.markers
            .add(scope, kind, label)
            .then(() => {
              haptic.commit();
              return reload();
            })
            .catch(failed);
        },
        onRemove: (id) => {
          if (!scope) return;
          services.markers
            .remove(scope, id)
            .then((ok) => {
              if (ok) toast(`${label} eliminado: lo que tenía pasa a la base`, { kind: 'info' });
              return reload();
            })
            .catch(failed);
        },
        onRename: (id, name) => {
          if (scope) services.markers.rename(scope, id, name).then(reload).catch(failed);
        },
        onSetValue: async (id, value) => {
          if (!scope) return 'invalid';
          const r = await services.markers.setValue(scope, id, value);
          if (r.ok) {
            await reload();
            return null;
          }
          return r.reason === 'not-found' ? 'invalid' : r.reason;
        },
      };
    },
    [services, scope, reload],
  );
  const levelHandlers = useMemo(() => handlersFor('level', 'Nivel'), [handlersFor]);
  const phaseHandlers = useMemo(() => handlersFor('phase', 'Fase'), [handlersFor]);

  /** Niveles como marcadores del proyecto (los usa el alzado). */
  const projectLevels = useMemo<ProjectMarker[]>(
    () =>
      view.levels.map((i) => ({
        id: i.id,
        projectId: projectId ?? '',
        spaceId,
        kind: 'level' as const,
        name: i.name,
        value: i.value,
        isBase: !!i.base,
      })),
    [view.levels, projectId, spaceId],
  );

  return { loaded, view, levelHandlers, phaseHandlers, projectLevels };
}
