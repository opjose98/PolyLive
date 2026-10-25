// =============================================================================
// DraftingController.ts — Cota, texto, etiqueta, coordenada, línea, polígono,
// viga, cercha y correa (F6b)
// =============================================================================
//
// Lógica pura, como los demás controladores: recibe puntos ya en coordenadas
// de la VISTA (y ya enganchados a nodos por quien los traduce) y publica un
// estado. Deshacer/rehacer propio: crear, editar y borrar.
//
//   A→B (arrastre):  cota, línea, viga, cercha
//   un toque:        texto y etiqueta (la vista pide el texto), coordenada, correa
//   polígono:        toques que agregan vértices; tocar cerca del primero o
//                    "Cerrar" lo termina
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { generateId } from '../../domain/objects/base';
import { DRAFT_DEFAULTS, DraftItem, DraftKind, DraftView, ONE_POINT_KINDS, TWO_POINT_KINDS, dimensionLine, segmentLength, trussSegments, viewKeyOf } from '../../domain/drafting/drafting';
import type { DraftStore } from '../../infrastructure/sqlite/DraftStore';
import type { IObjectStore } from '../../domain/objects';
import { Command, ICommand } from '../commands/Command';

export interface DraftingState {
  readonly loaded: boolean;
  readonly items: readonly DraftItem[];
  readonly tool: DraftKind | null;
  /** Propiedades con que nacen los elementos (píldoras de la BPC). */
  readonly props: Readonly<Record<string, number>>;
  /** Arrastre A→B en curso. */
  readonly draft: { readonly view: DraftView; readonly kind: DraftKind; readonly a: Point2D; readonly b: Point2D } | null;
  /** Polígono en curso (vértices). */
  readonly polygon: { readonly view: DraftView; readonly points: readonly Point2D[] } | null;
  /** Toque con Texto o Etiqueta: la vista pide el texto. */
  readonly pendingText: { readonly view: DraftView; readonly kind: 'text' | 'tag'; readonly at: Point2D; readonly targetId?: string; readonly suggested: string } | null;
  readonly selectedId: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

type Op = { kind: 'create' | 'delete'; id: string } | { kind: 'edit'; before: DraftItem; after: DraftItem };
type Listener = (s: DraftingState) => void;

/**
 * Historia compartida (la CommandStack del levantamiento): con ella, deshacer
 * sigue el orden real de las acciones, sean muros o cotas.
 */
interface SharedHistory {
  execute(command: ICommand): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  canUndo(): boolean;
  canRedo(): boolean;
}

/** Una operación del dibujo como comando de la historia compartida. Idempotente: re-aplicarla no cambia nada. */
class DraftOpCommand extends Command {
  readonly type = 'DraftOp';
  constructor(
    private readonly op: Op,
    private readonly store: DraftStore,
  ) {
    super();
  }
  async execute(_store: IObjectStore): Promise<void> {
    await applyOp(this.store, this.op, false);
  }
  async undo(_store: IObjectStore): Promise<void> {
    await applyOp(this.store, this.op, true);
  }
}

async function applyOp(store: DraftStore, op: Op, reverse: boolean): Promise<void> {
  if (op.kind === 'edit') await store.update(reverse ? op.before : op.after);
  else await store.setDeleted(op.id, op.kind === 'create' ? reverse : !reverse);
}

/** Largo mínimo de un elemento A→B (m): por debajo es un toque, no un trazo. */
const MIN_DRAFT_LENGTH = 0.05;

export class DraftingController {
  private state: DraftingState = {
    loaded: false,
    items: [],
    tool: null,
    props: {},
    draft: null,
    polygon: null,
    pendingText: null,
    selectedId: null,
    canUndo: false,
    canRedo: false,
  };
  private listeners: Listener[] = [];
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];

  /** Aviso a la pantalla: 'push' (nueva acción) o 'undo'/'redo' de la historia compartida (puede haber movido muros). */
  private historyListener: ((kind: 'push' | 'undo' | 'redo') => void) | null = null;

  constructor(
    private readonly store: DraftStore,
    private readonly spaceId: string,
    private levelId = '',
    private readonly history: SharedHistory | null = null,
  ) {}

  onHistory(l: ((kind: 'push' | 'undo' | 'redo') => void) | null): void {
    this.historyListener = l;
  }

  private syncHistory(): void {
    if (this.history) this.patch({ canUndo: this.history.canUndo(), canRedo: this.history.canRedo() });
  }

  getState(): DraftingState {
    return this.state;
  }

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  private patch(p: Partial<DraftingState>): void {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l(this.state);
  }

  setLevel(levelId: string): void {
    this.levelId = levelId;
  }

  async load(): Promise<void> {
    const items = await this.store.list(this.spaceId);
    this.patch({ loaded: true, items, selectedId: items.some((i) => i.id === this.state.selectedId) ? this.state.selectedId : null });
  }

  setTool(tool: DraftKind | null, props: Readonly<Record<string, number>> = {}): void {
    this.patch({ tool, props: tool ? { ...DRAFT_DEFAULTS[tool], ...props } : {}, draft: null, polygon: null, pendingText: null });
  }

  /** Elementos de una vista (en planta, solo los del nivel activo). */
  itemsIn(view: DraftView): DraftItem[] {
    const key = viewKeyOf(view);
    return this.state.items.filter((i) => viewKeyOf(i.view) === key && (view.kind !== 'plan' || !this.levelId || !i.levelId || i.levelId === this.levelId));
  }

  get selected(): DraftItem | null {
    return this.state.items.find((i) => i.id === this.state.selectedId) ?? null;
  }

  select(id: string | null): void {
    this.patch({ selectedId: id });
  }

  // -------------------------------------------------------------------------
  // Gestos
  // -------------------------------------------------------------------------

  /**
   * Toque. Con herramienta de un toque crea (o pide el texto); con Polígono
   * agrega un vértice (o cierra si se toca el primero). Sin herramienta,
   * selecciona el elemento bajo el dedo. `tag` = objeto tocado (para Etiqueta)
   * y el texto sugerido.
   */
  async tap(view: DraftView, p: Point2D, tol: number, tag?: { targetId: string; text: string }): Promise<boolean> {
    const tool = this.state.tool;
    if (tool === 'polygon') {
      const cur = this.state.polygon;
      if (cur && cur.points.length >= 3 && segmentLength(cur.points[0], p) <= tol) {
        await this.closePolygon();
        return true;
      }
      this.patch({ polygon: { view, points: [...(cur && viewKeyOf(cur.view) === viewKeyOf(view) ? cur.points : []), p] } });
      return true;
    }
    if (tool === 'text') {
      this.patch({ pendingText: { view, kind: 'text', at: p, suggested: '' } });
      return true;
    }
    if (tool === 'tag') {
      if (!tag) return true;
      this.patch({ pendingText: { view, kind: 'tag', at: p, targetId: tag.targetId, suggested: tag.text } });
      return true;
    }
    if (tool === 'coordinate' || tool === 'purlin') {
      await this.create(view, tool, [p], '');
      return true;
    }
    if (tool) return true;
    const hit = this.hitTest(view, p, tol);
    this.patch({ selectedId: hit?.id ?? null });
    return hit !== null;
  }

  begin(view: DraftView, p: Point2D): void {
    const tool = this.state.tool;
    if (!tool || !TWO_POINT_KINDS.includes(tool)) return;
    this.patch({ draft: { view, kind: tool, a: p, b: p }, selectedId: null });
  }

  move(p: Point2D): void {
    const d = this.state.draft;
    if (d) this.patch({ draft: { ...d, b: p } });
  }

  cancel(): void {
    if (this.state.draft) this.patch({ draft: null });
  }

  async end(p?: Point2D): Promise<DraftItem | null> {
    if (p) this.move(p);
    const d = this.state.draft;
    this.patch({ draft: null });
    if (!d || segmentLength(d.a, d.b) < MIN_DRAFT_LENGTH) return null;
    // Un corte nace con nombre correlativo del espacio (Corte 1, Corte 2…): es lo que se lista y se abre.
    const name = d.kind === 'section' ? `Corte ${this.state.items.filter((i) => i.kind === 'section').length + 1}` : '';
    return this.create(d.view, d.kind, [d.a, d.b], name);
  }

  async submitText(text: string): Promise<DraftItem | null> {
    const pt = this.state.pendingText;
    this.patch({ pendingText: null });
    if (!pt || !text.trim()) return null;
    return this.create(pt.view, pt.kind, [pt.at], text.trim(), pt.targetId);
  }

  cancelText(): void {
    if (this.state.pendingText) this.patch({ pendingText: null });
  }

  async closePolygon(): Promise<DraftItem | null> {
    const cur = this.state.polygon;
    this.patch({ polygon: null });
    if (!cur || cur.points.length < 3) return null;
    return this.create(cur.view, 'polygon', cur.points, '');
  }

  undoPolygonPoint(): void {
    const cur = this.state.polygon;
    if (!cur) return;
    this.patch({ polygon: cur.points.length > 1 ? { ...cur, points: cur.points.slice(0, -1) } : null });
  }

  private async create(view: DraftView, kind: DraftKind, points: readonly Point2D[], text: string, targetId?: string): Promise<DraftItem> {
    const item: DraftItem = {
      id: generateId() as string,
      spaceId: this.spaceId,
      view,
      levelId: view.kind === 'plan' ? this.levelId : '',
      kind,
      points,
      text,
      props: { ...DRAFT_DEFAULTS[kind], ...this.state.props },
      ...(targetId ? { targetId } : {}),
      createdAt: new Date().toISOString(),
    };
    await this.store.add(item);
    await this.push({ kind: 'create', id: item.id });
    this.patch({ items: [...this.state.items, item], selectedId: ONE_POINT_KINDS.includes(kind) || kind === 'polygon' ? null : item.id });
    return item;
  }

  // -------------------------------------------------------------------------
  // Edición
  // -------------------------------------------------------------------------

  async edit(id: string, change: { text?: string; props?: Record<string, number>; points?: readonly Point2D[] }): Promise<void> {
    const before = this.state.items.find((i) => i.id === id);
    if (!before) return;
    const after: DraftItem = {
      ...before,
      ...(change.text !== undefined && { text: change.text }),
      ...(change.points && { points: change.points }),
      props: { ...before.props, ...change.props },
    };
    await this.store.update(after);
    await this.push({ kind: 'edit', before, after });
    this.patch({ items: this.state.items.map((i) => (i.id === id ? after : i)) });
  }

  async remove(id: string): Promise<void> {
    await this.store.setDeleted(id, true);
    await this.push({ kind: 'delete', id });
    this.patch({ items: this.state.items.filter((i) => i.id !== id), selectedId: this.state.selectedId === id ? null : this.state.selectedId });
  }

  private async push(op: Op): Promise<void> {
    if (this.history) {
      await this.history.execute(new DraftOpCommand(op, this.store));
      this.syncHistory();
      this.historyListener?.('push');
      return;
    }
    this.undoStack.push(op);
    this.redoStack = [];
    this.patch({ canUndo: true, canRedo: false });
  }

  /** Tras deshacer/rehacer desde otra parte de la historia compartida: relee el dibujo. */
  async refresh(): Promise<void> {
    await this.load();
    this.syncHistory();
  }

  async undo(): Promise<void> {
    if (this.history) {
      await this.history.undo();
      await this.refresh();
      this.historyListener?.('undo');
      return;
    }
    const op = this.undoStack.pop();
    if (!op) return;
    await this.apply(op, true);
    this.redoStack.push(op);
    await this.load();
    this.patch({ canUndo: this.undoStack.length > 0, canRedo: true });
  }

  async redo(): Promise<void> {
    if (this.history) {
      await this.history.redo();
      await this.refresh();
      this.historyListener?.('redo');
      return;
    }
    const op = this.redoStack.pop();
    if (!op) return;
    await this.apply(op, false);
    this.undoStack.push(op);
    await this.load();
    this.patch({ canUndo: true, canRedo: this.redoStack.length > 0 });
  }

  private async apply(op: Op, reverse: boolean): Promise<void> {
    await applyOp(this.store, op, reverse);
  }

  // -------------------------------------------------------------------------
  // Consultas
  // -------------------------------------------------------------------------

  /** Elemento más cercano a `p` (dentro de `tol`) en la vista. */
  hitTest(view: DraftView, p: Point2D, tol: number): DraftItem | null {
    let best: DraftItem | null = null;
    let bestD = tol;
    for (const i of this.itemsIn(view)) {
      const d = distanceToItem(i, p);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }
}

function distToSeg(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Distancia de un punto al elemento (a lo que se ve dibujado). */
export function distanceToItem(i: DraftItem, p: Point2D): number {
  const pts = i.points;
  if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
  if (i.kind === 'dimension') {
    const l = dimensionLine(pts[0], pts[1], i.props.offset ?? 0);
    return Math.min(distToSeg(p, l.a, l.b), distToSeg(p, pts[0], pts[1]));
  }
  if (i.kind === 'truss') {
    return Math.min(...trussSegments(pts[0], pts[1], i.props.depth ?? 0.6).map(([a, b]) => distToSeg(p, a, b)));
  }
  let d = Infinity;
  const closed = i.kind === 'polygon';
  for (let k = 0; k < pts.length - (closed ? 0 : 1); k++) d = Math.min(d, distToSeg(p, pts[k], pts[(k + 1) % pts.length]));
  return d;
}
