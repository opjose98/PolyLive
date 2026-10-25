// =============================================================================
// useEditorDrafting.ts — El dibujo técnico conectado al editor de planta
// =============================================================================
//
// Lo que el dibujo necesita del levantamiento: qué objeto hay bajo el dedo
// (Etiqueta), dónde está su centro (línea de referencia) y cómo rotular una
// coordenada (N/E si el proyecto está amarrado). Más los textos de la BPC.
// =============================================================================

import { useCallback, useMemo } from 'react';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController } from '../../../application/editor/EditorController';
import { gridLabel, isGeoreferenced, localLabel } from '../../../application/geo/coordinateText';
import { DraftItem, DraftKind, itemLength, polygonMetrics } from '../../../domain/drafting/drafting';
import { modelToGrid, type Georeference } from '../../../domain/geo/georeference';
import { Column } from '../../../domain/objects/column';
import { Door } from '../../../domain/objects/door';
import { Wall } from '../../../domain/objects/wall';
import { Window } from '../../../domain/objects/window';
import { useDrafting } from './useDrafting';

/** Lo que dice la BPC de un elemento de dibujo seleccionado. */
export function draftDetail(i: DraftItem): string {
  if (i.kind === 'polygon') return `${polygonMetrics(i.points).area.toFixed(2)} m²`;
  if (i.kind === 'text' || i.kind === 'tag') return i.text.split(/\n/)[0];
  if (i.kind === 'coordinate') return 'Punto rotulado';
  return `${itemLength(i).toFixed(2)} m`;
}

/** Qué hacer con cada herramienta de dibujo técnico (texto de la BPC). */
export const DRAFT_HINT: Record<DraftKind, string> = {
  dimension: 'Arrastra de un punto a otro · se pega a los nodos',
  text: 'Toca donde va el texto',
  tag: 'Toca un muro, columna, vano o recinto',
  coordinate: 'Toca el punto a rotular',
  line: 'Arrastra de un punto a otro',
  polygon: 'Toca los vértices · toca el primero o "Cerrar polígono"',
  beam: 'Arrastra el eje de la viga',
  truss: 'Arrastra de apoyo a apoyo',
  purlin: 'Toca donde va la correa (en sección)',
  section: 'Arrastra la línea de corte · se mira hacia su izquierda · «Ver corte» la abre',
};

/** Texto que propone la Etiqueta para el objeto tocado. */
function tagText(o: unknown): string | null {
  if (o instanceof Wall) {
    return `Muro · ${Math.round(Number(o.thickness) * 100)} cm · ${Number(o.length).toFixed(2)} m${o.material ? ` · ${o.material}` : ''}`;
  }
  if (o instanceof Column) {
    return `Columna ${Math.round(Number(o.dimensionX) * 100)}${o.isCircular ? ' Ø' : `×${Math.round(Number(o.dimensionY ?? o.dimensionX) * 100)}`} cm`;
  }
  if (o instanceof Door) return `Puerta ${Number(o.width).toFixed(2)} × ${Number(o.height).toFixed(2)}`;
  if (o instanceof Window) return `Ventana ${Number(o.width).toFixed(2)} × ${Number(o.height).toFixed(2)}`;
  return null;
}

interface EditorDraftingInput {
  readonly services: AppServices;
  readonly editor: EditorController;
  readonly spaceId: string;
  readonly levelId: string;
  readonly geo: Georeference | null;
  readonly palette: { readonly label: string; readonly selection: string };
  readonly touchTolerancePx: number;
}

export function useEditorDrafting({ services, editor, spaceId, levelId, geo, palette, touchTolerancePx }: EditorDraftingInput) {
  const coordText = useCallback(
    (p: { x: number; y: number }) => (isGeoreferenced(geo) ? gridLabel(modelToGrid(geo, spaceId, p)) : localLabel(p)),
    [geo, spaceId],
  );
  const tagAt = useCallback(
    (x: number, y: number) => {
      const o = editor.objectAt(x, y, touchTolerancePx);
      const text = tagText(o);
      if (o && text) return { targetId: o.id as string, text };
      const z = editor.zoneAt(x, y);
      if (z?.id) return { targetId: z.id, text: `${z.name ?? 'Recinto'}\n${(z.netArea ?? z.area).toFixed(2)} m²` };
      return null;
    },
    [editor, touchTolerancePx],
  );
  const targetCenter = useCallback((id: string) => editor.objectCenter(id), [editor]);
  // Estable: si cambiara en cada render, el dibujo (y la planta entera) se regrabaría cada vez.
  const colors = useMemo(() => ({ ink: palette.label, accent: palette.selection }), [palette.label, palette.selection]);
  return useDrafting({ services, spaceId, editor, levelId, touchTolerancePx, coordText, tagAt, targetCenter, colors });
}
