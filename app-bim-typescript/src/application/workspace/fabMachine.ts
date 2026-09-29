// =============================================================================
// fabMachine.ts — Máquina de estados del FAB de creación (drill-down)
// Portado de: polylive-mockup/js/components/fab-create.js
// =============================================================================
//
//   closed      [+] --principal--> categories [−]
//   categories  [−] --principal--> closed
//   categories  --categoría-->     tools [←]
//   tools       [←] --principal--> categories   (retrocede UN nivel)
//   tools       --herramienta-->   closed        (la herramienta queda activa)
//   tools       --herramienta con formas--> methods [←]  (nivel 3)
//   methods     [←] --principal--> tools
//   methods     --forma-->         closed        (herramienta + forma activas)
// =============================================================================

export type FabState =
  | { readonly level: 'closed' }
  | { readonly level: 'categories' }
  | { readonly level: 'tools'; readonly categoryId: string }
  | { readonly level: 'methods'; readonly categoryId: string; readonly toolId: string };

export const FAB_CLOSED: FabState = { level: 'closed' };

export function pressFabMain(state: FabState): FabState {
  switch (state.level) {
    case 'closed':
      return { level: 'categories' };
    case 'categories':
      return FAB_CLOSED;
    case 'tools':
      return { level: 'categories' };
    case 'methods':
      return { level: 'tools', categoryId: state.categoryId };
  }
}

/** Abre el nivel 3 de una herramienta que tiene formas de creación. */
export function openFabMethods(state: FabState, toolId: string): FabState {
  return state.level === 'tools' ? { level: 'methods', categoryId: state.categoryId, toolId } : state;
}

export function pickFabCategory(state: FabState, categoryId: string): FabState {
  return state.level === 'categories' ? { level: 'tools', categoryId } : state;
}

/** Ícono del botón principal en cada estado. */
export function fabMainIcon(state: FabState): 'plus' | 'minus' | 'arrow-left' {
  return state.level === 'closed' ? 'plus' : state.level === 'categories' ? 'minus' : 'arrow-left';
}
