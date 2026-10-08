// =============================================================================
// ReviewController.ts — Revisión (M4): marcar, comentar, resolver
// =============================================================================
//
// Lógica pura, como EditorController y ProgressController: recibe puntos ya
// en coordenadas de la VISTA (planta o cara de muro) y publica un estado.
//
//   freehand / arrow / rect / cloud  → arrastrar dibuja; al soltar nace la
//                                      observación y queda seleccionada para
//                                      escribir el comentario;
//   text                             → tocar fija el punto y la vista pide el texto;
//   sin herramienta                  → tocar una marca o su número la selecciona.
//
// Deshacer/rehacer propio: crear y borrar observaciones.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { generateId } from '../../domain/objects/base';
import {
  Markup,
  MarkupKind,
  REVIEW_COLORS,
  ReviewItem,
  ReviewStatus,
  ReviewView,
  anchorOf,
  distanceToMarkup,
  isMeaningful,
  viewKey,
} from '../../domain/review/review';
import type { ReviewStore } from '../../infrastructure/sqlite/ReviewStore';

export interface ReviewDraft {
  readonly view: ReviewView;
  readonly kind: Exclude<MarkupKind, 'text'>;
  readonly points: readonly Point2D[];
  readonly color: string;
}

export interface ReviewState {
  readonly loaded: boolean;
  readonly items: readonly ReviewItem[];
  readonly tool: MarkupKind | null;
  readonly color: string;
  readonly draft: ReviewDraft | null;
  readonly selectedId: string | null;
  /** Punto donde el operador tocó con la herramienta Texto: la vista pide el texto. */
  readonly pendingText: { readonly view: ReviewView; readonly at: Point2D } | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

type Listener = (s: ReviewState) => void;
type Op = { kind: 'create' | 'delete'; id: string };

export class ReviewController {
  private state: ReviewState = {
    loaded: false,
    items: [],
    tool: null,
    color: REVIEW_COLORS[0],
    draft: null,
    selectedId: null,
    pendingText: null,
    canUndo: false,
    canRedo: false,
  };
  private listeners: Listener[] = [];
  private undoStack: Op[] = [];
  private redoStack: Op[] = [];
  private creating: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: ReviewStore,
    private readonly spaceId: string,
    private author = '',
  ) {}

  getState(): ReviewState {
    return this.state;
  }

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  private patch(p: Partial<ReviewState>): void {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l(this.state);
  }

  setAuthor(name: string): void {
    this.author = name;
  }

  async load(): Promise<void> {
    const items = await this.store.list(this.spaceId);
    this.patch({
      loaded: true,
      items,
      selectedId: items.some((i) => i.id === this.state.selectedId) ? this.state.selectedId : null,
    });
  }

  setTool(tool: MarkupKind | null): void {
    this.patch({ tool, draft: null, pendingText: null });
  }

  setColor(color: string): void {
    this.patch({ color });
  }

  /** Siguiente color de la paleta (botón de la BPC). */
  cycleColor(): void {
    const i = REVIEW_COLORS.indexOf(this.state.color as (typeof REVIEW_COLORS)[number]);
    this.patch({ color: REVIEW_COLORS[(i + 1) % REVIEW_COLORS.length] });
  }

  get selected(): ReviewItem | null {
    return this.state.items.find((i) => i.id === this.state.selectedId) ?? null;
  }

  select(id: string | null): void {
    this.patch({ selectedId: id });
  }

  /** Observaciones de una vista, filtradas por estado. */
  itemsIn(view: ReviewView, show: { open: boolean; resolved: boolean }): ReviewItem[] {
    const key = viewKey(view);
    return this.state.items.filter((i) => viewKey(i.view) === key && (i.status === 'open' ? show.open : show.resolved));
  }

  // -------------------------------------------------------------------------
  // Gestos (coordenadas de la vista)
  // -------------------------------------------------------------------------

  /**
   * Toque. Con Texto pide el texto; sin herramienta selecciona la marca más
   * cercana dentro de `tol` (o deselecciona). Devuelve `true` si lo atendió.
   */
  tap(view: ReviewView, p: Point2D, tol: number, show: { open: boolean; resolved: boolean }): boolean {
    if (this.state.tool === 'text') {
      this.patch({ pendingText: { view, at: p } });
      return true;
    }
    if (this.state.tool) return true;
    let best: ReviewItem | null = null;
    let bestD = tol;
    for (const i of this.itemsIn(view, show)) {
      const d = Math.min(distanceToMarkup(p, i.markup), Math.hypot(p.x - anchorOf(i.markup).x, p.y - anchorOf(i.markup).y));
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    }
    this.patch({ selectedId: best?.id ?? null });
    return best !== null;
  }

  begin(view: ReviewView, p: Point2D): void {
    const tool = this.state.tool;
    if (!tool || tool === 'text') return;
    this.patch({ draft: { view, kind: tool, points: [p], color: this.state.color }, selectedId: null });
  }

  move(p: Point2D, minStep = 0): void {
    const d = this.state.draft;
    if (!d) return;
    if (d.kind !== 'freehand') {
      this.patch({ draft: { ...d, points: [d.points[0], p] } });
      return;
    }
    const last = d.points[d.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < minStep) return;
    this.patch({ draft: { ...d, points: [...d.points, p] } });
  }

  cancel(): void {
    if (this.state.draft) this.patch({ draft: null });
  }

  /** Suelta el dedo: si la marca tiene tamaño, nace la observación (seleccionada). */
  async end(p: Point2D | undefined, minSize: number): Promise<ReviewItem | null> {
    if (p) this.move(p);
    const d = this.state.draft;
    this.patch({ draft: null });
    if (!d) return null;
    const markup: Markup =
      d.kind === 'freehand'
        ? { kind: 'freehand', points: d.points }
        : ({ kind: d.kind, a: d.points[0], b: d.points[1] ?? d.points[0] } as Markup);
    if (!isMeaningful(markup, minSize)) return null;
    return this.create(d.view, markup, d.color, '');
  }

  /** Texto escrito para el punto pendiente. Texto vacío = no se crea nada. */
  async submitText(text: string): Promise<ReviewItem | null> {
    const pending = this.state.pendingText;
    this.patch({ pendingText: null });
    if (!pending || !text.trim()) return null;
    return this.create(pending.view, { kind: 'text', at: pending.at, text: text.trim() }, this.state.color, text.trim());
  }

  cancelText(): void {
    if (this.state.pendingText) this.patch({ pendingText: null });
  }

  private create(view: ReviewView, markup: Markup, color: string, comment: string): Promise<ReviewItem> {
    const run = async (): Promise<ReviewItem> => {
      const item: ReviewItem = {
        id: generateId() as string,
        spaceId: this.spaceId,
        number: await this.store.nextNumber(this.spaceId),
        view,
        markup,
        color,
        comment,
        author: this.author,
        createdAt: new Date().toISOString(),
        status: 'open',
      };
      await this.store.add(item);
      this.undoStack.push({ kind: 'create', id: item.id });
      this.redoStack = [];
      this.patch({ items: [...this.state.items, item], selectedId: item.id, canUndo: true, canRedo: false });
      return item;
    };
    // En cola: dos marcas seguidas no deben pedir el mismo número.
    const next = this.creating.then(run, run);
    this.creating = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  // -------------------------------------------------------------------------
  // Edición
  // -------------------------------------------------------------------------

  async editComment(id: string, comment: string): Promise<void> {
    await this.store.update(id, { comment });
    this.patchItem(id, { comment });
  }

  async editColor(id: string, color: string): Promise<void> {
    await this.store.update(id, { color });
    this.patchItem(id, { color });
  }

  async attachPhoto(id: string, photoId: string | null): Promise<void> {
    await this.store.update(id, { photoId });
    this.patchItem(id, { photoId: photoId ?? undefined });
  }

  async setStatus(id: string, status: ReviewStatus): Promise<void> {
    const at = new Date().toISOString();
    await this.store.setStatus(id, status, this.author, at);
    this.patchItem(id, status === 'resolved' ? { status, resolvedBy: this.author, resolvedAt: at } : { status, resolvedBy: undefined, resolvedAt: undefined });
  }

  async remove(id: string): Promise<void> {
    await this.store.setDeleted(id, true);
    this.undoStack.push({ kind: 'delete', id });
    this.redoStack = [];
    this.patch({
      items: this.state.items.filter((i) => i.id !== id),
      selectedId: this.state.selectedId === id ? null : this.state.selectedId,
      canUndo: true,
      canRedo: false,
    });
  }

  private patchItem(id: string, p: Partial<ReviewItem>): void {
    this.patch({ items: this.state.items.map((i) => (i.id === id ? { ...i, ...p } : i)) });
  }

  async undo(): Promise<void> {
    const op = this.undoStack.pop();
    if (!op) return;
    await this.creating;
    await this.store.setDeleted(op.id, op.kind === 'create');
    this.redoStack.push(op);
    await this.load();
    this.patch({ canUndo: this.undoStack.length > 0, canRedo: true });
  }

  async redo(): Promise<void> {
    const op = this.redoStack.pop();
    if (!op) return;
    await this.store.setDeleted(op.id, op.kind === 'delete');
    this.undoStack.push(op);
    await this.load();
    this.patch({ canUndo: true, canRedo: this.redoStack.length > 0 });
  }
}
