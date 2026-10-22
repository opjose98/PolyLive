// =============================================================================
// liveOverlay.ts — Lo que cambia con cada movimiento del dedo
// =============================================================================
//
// Trazar un muro o arrastrar un handle cambia el estado del editor ~30 veces
// por segundo. Si eso llegara a la pantalla entera, cada movimiento volvería a
// renderizar todo el cromo y a regrabar la planta completa: era la causa del
// lag y del parpadeo al dibujar.
//
// Por eso se separa en dos:
//   · estructural (pantalla + planta): qué objetos hay, qué está seleccionado,
//     si HAY un trazo o un arrastre en curso;
//   · vivo (solo el lienzo, capa superior barata): DÓNDE va el trazo, la
//     vista previa del objeto arrastrado, sus handles y el anillo de snap.
// El lienzo se suscribe a esta fuente con useSyncExternalStore; la pantalla
// ignora los cambios que solo son "vivos" (ver `sameStructure`).
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import type { RevitObjectBase, RevitObjectId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import type { Handle } from '../../application/canvas/SelectionService';
import type { EditorController, EditorState } from '../../application/editor/EditorController';

interface LiveOverlay {
  readonly wallDraft: EditorState['wallDraft'];
  /** El objeto arrastrado en su posición viva, con sus vanos. */
  readonly objects: readonly RevitObjectBase[];
  readonly selectedId: RevitObjectId | null;
  readonly handles: readonly Handle[];
  readonly snapIndicator: Point2D | null;
  /** Enganchado a un nodo (para la háptica al entrar). */
  readonly snapped: boolean;
}

export interface LiveSource {
  subscribe(onChange: () => void): () => void;
  get(): LiveOverlay;
}

const EMPTY: LiveOverlay = { wallDraft: null, objects: [], selectedId: null, handles: [], snapIndicator: null, snapped: false };

/** ¿Hay un arrastre en curso (o su vista previa todavía en pantalla)? */
export function isDragging(s: EditorState): boolean {
  return !!(s.draggingHandle || s.dragPreview);
}

/** Objeto arrastrado y sus vanos: se dibujan en la capa viva, no en la planta. */
export function draggedIds(s: EditorState): ReadonlySet<string> {
  const id = s.selectedId as string | null;
  if (!id || !isDragging(s)) return new Set();
  // El arrastrado, los muros que arrastra por sus uniones y los vanos de todos.
  const walls = new Set<string>([id, ...s.dragLinked.map((o) => o.id as string)]);
  const out = new Set<string>(walls);
  for (const o of s.objects) {
    if ((o instanceof Door || o instanceof Window) && walls.has(o.parentWallId as string)) out.add(o.id as string);
  }
  return out;
}

export function createLiveSource(editor: EditorController): LiveSource {
  let cacheKey: unknown[] = [];
  let cached = EMPTY;
  return {
    subscribe: (onChange) => editor.subscribe(() => onChange()),
    get: () => {
      const s = editor.getState();
      const key = [s.wallDraft, s.dragPreview, s.draggingHandle, s.dragSnappedToNode, s.dragLinked, s.objects, s.selectedId];
      if (key.every((k, i) => k === cacheKey[i])) return cached;
      cacheKey = key;
      if (!s.wallDraft && !isDragging(s)) {
        cached = EMPTY;
        return cached;
      }
      const preview = s.dragPreview;
      const objects: RevitObjectBase[] = [];
      if (preview) {
        objects.push(preview, ...s.dragLinked);
        const moving = new Set(objects.map((o) => o.id as string));
        for (const o of s.objects) {
          if ((o instanceof Door || o instanceof Window) && moving.has(o.parentWallId as string)) objects.push(o);
        }
      }
      const snapIndicator =
        s.dragSnappedToNode && preview instanceof Wall && s.draggingHandle
          ? s.draggingHandle.kind === 'start'
            ? preview.startPoint
            : preview.endPoint
          : null;
      cached = {
        wallDraft: s.wallDraft,
        objects,
        selectedId: preview ? preview.id : null,
        handles: preview ? editor.selectedHandles : [],
        snapIndicator,
        snapped: s.dragSnappedToNode || !!s.wallDraft?.snappedToNode,
      };
      return cached;
    },
  };
}

/**
 * ¿Cambió algo que la PANTALLA necesite? Lo vivo cuenta solo por su
 * presencia (empezó/terminó un trazo o un arrastre), no por su posición.
 */
export function sameStructure(a: EditorState, b: EditorState): boolean {
  for (const k of Object.keys(b) as (keyof EditorState)[]) {
    if (k === 'wallDraft') {
      if (!!a.wallDraft !== !!b.wallDraft || !!a.wallDraft?.start !== !!b.wallDraft?.start) return false;
    } else if (k === 'dragPreview') {
      if ((a.dragPreview?.id ?? null) !== (b.dragPreview?.id ?? null)) return false;
    } else if (k === 'draggingHandle') {
      if (!!a.draggingHandle !== !!b.draggingHandle) return false;
    } else if (k === 'dragSnappedToNode' || k === 'dragLinked') {
      // Los muros arrastrados por uniones viven en la capa viva, como el arrastrado.
      continue;
    } else if (a[k] !== b[k]) {
      return false;
    }
  }
  return true;
}
