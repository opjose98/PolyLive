// =============================================================================
// bpcContext.ts — Qué muestra la Barra de Propiedades Contextual
// Portado de: polylive-mockup/js/components/bpc.js y bpc-alzado.js
// =============================================================================
//
// Prioridad: herramienta activa > objeto seleccionado > lienzo.
// =============================================================================

import type { PropValues } from './catalog';

export interface ActiveTool {
  readonly categoryId: string;
  readonly toolId: string;
  readonly label: string;
  readonly categoryLabel: string;
  readonly props: PropValues;
  /** Forma de creación elegida (nivel 3), si la herramienta tiene. */
  readonly methodId?: string;
  readonly methodLabel?: string;
}

export interface SelectionSummary {
  readonly typeLabel: string;
  readonly detail?: string;
  readonly props: PropValues;
}

export type BpcContext =
  | { readonly kind: 'tool'; readonly tool: ActiveTool }
  | { readonly kind: 'selection'; readonly selection: SelectionSummary }
  | {
      readonly kind: 'canvas';
      readonly viewLabel: string;
      readonly scaleLabel: string;
      readonly zoomLabel: string;
      /** Título del contexto vacío ("Lienzo" en planta, "Alzado" en alzado). */
      readonly title?: string;
      /** Datos extra del contexto vacío (el muro activo y su lado, en alzado). */
      readonly items?: readonly string[];
    };

interface BpcInput {
  readonly tool: ActiveTool | null;
  readonly selection: SelectionSummary | null;
  readonly viewLabel: string;
  readonly scaleDenominator: string;
  readonly zoomPercent: number;
  readonly canvasTitle?: string;
  readonly canvasItems?: readonly string[];
}

export function resolveBpcContext(input: BpcInput): BpcContext {
  if (input.tool) return { kind: 'tool', tool: input.tool };
  if (input.selection) return { kind: 'selection', selection: input.selection };
  const denom = input.scaleDenominator.trim();
  return {
    kind: 'canvas',
    viewLabel: input.viewLabel,
    scaleLabel: `1:${denom || '—'}`,
    zoomLabel: `${Math.round(input.zoomPercent)}%`,
    ...(input.canvasTitle && { title: input.canvasTitle }),
    ...(input.canvasItems && { items: input.canvasItems }),
  };
}
