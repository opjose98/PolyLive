// =============================================================================
// ProgressController.ts — Avance de obra (M3): pintar, borrar, cortes, cantidades
// =============================================================================
//
// Lógica pura (sin React ni Skia), como EditorController: recibe puntos ya en
// coordenadas del SOPORTE (planta del modelo para suelos, (u, v) del muro para
// caras) y publica un estado inmutable. La vista decide qué soporte hay bajo
// el dedo y traduce coordenadas.
//
// Herramientas:
//   brush   pincel con ancho (m)          eraser  borrador con el mismo ancho
//   fill    toque = todo el soporte       rect    arrastre = rectángulo
//
// Deshacer/rehacer es propio del Avance (no comparte la historia del
// levantamiento): un trazo es un paso; deshacer lo borra de forma lógica.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { generateId } from '../../domain/objects/base';
import { Activity, ACTIVITY_COLORS, ProgressCut, ProgressMark, ProgressShape, ProgressTarget, QuantityPart, QuantityRow, Support, coverageRuns, cutCoverages, cutLabel, insideSupport, markGain, orderedCuts, quantities, quantityParts, supportArea, supportGrid, targetKey, todayIso } from '../../domain/progress/progress';
import type { ProgressStore } from '../../infrastructure/sqlite/ProgressStore';

export type ProgressTool = 'brush' | 'eraser' | 'fill' | 'rect';

interface ProgressDraft {
  readonly target: ProgressTarget;
  readonly tool: 'brush' | 'eraser' | 'rect';
  readonly points: readonly Point2D[];
  /** Donde está el dedo ahora (el trazo llega hasta aquí aunque el punto no se haya agregado). */
  readonly tip: Point2D;
  readonly width: number;
  readonly color: string;
}

/** Capa de dibujo de un soporte: rectángulos de celdas pintadas, con su color. */
interface ProgressLayer {
  readonly targetKey: string;
  readonly color: string;
  /** 1 = corte activo; menos = cortes anteriores (tenue). */
  readonly opacity: number;
  readonly runs: readonly { x: number; y: number; w: number; h: number }[];
}

export interface ProgressState {
  readonly loaded: boolean;
  readonly activities: readonly Activity[];
  /** Incluye las quitadas del catálogo (para nombrar lo ya pintado). */
  readonly allActivities: readonly Activity[];
  readonly cuts: readonly ProgressCut[];
  readonly activityId: string | null;
  readonly cutId: string | null;
  readonly marks: readonly ProgressMark[];
  readonly tool: ProgressTool | null;
  /** Ancho del pincel (m). */
  readonly brushWidth: number;
  readonly draft: ProgressDraft | null;
  /** Sube cada vez que termina un trazo (guardado, rechazado o cancelado): el lienzo borra su trazo vivo. */
  readonly strokeSeq: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly notice: { kind: 'info' | 'error' | 'success'; message: string } | null;
}

type Listener = (s: ProgressState) => void;

/** Opacidad de lo pintado en cortes anteriores al activo. */
const PREVIOUS_CUT_OPACITY = 0.35;

export class ProgressController {
  private state: ProgressState = {
    loaded: false,
    activities: [],
    allActivities: [],
    cuts: [],
    activityId: null,
    cutId: null,
    marks: [],
    tool: null,
    brushWidth: 0.3,
    draft: null,
    strokeSeq: 0,
    canUndo: false,
    canRedo: false,
    notice: null,
  };
  private listeners: Listener[] = [];
  private supports = new Map<string, Support>();
  private undoStack: string[] = [];
  private redoStack: string[] = [];
  private layerCache: { marks: readonly ProgressMark[]; cutId: string | null; supports: Map<string, Support>; previous: boolean; layers: ProgressLayer[] } | null =
    null;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly store: ProgressStore,
    /** Dueño del catálogo y los cortes: el proyecto (o el espacio, si no tiene proyecto). */
    private readonly projectKey: string,
    private readonly spaceId: string,
    private operator = '',
  ) {}

  getState(): ProgressState {
    return this.state;
  }

  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  private patch(p: Partial<ProgressState>): void {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l(this.state);
  }

  private notify(kind: 'info' | 'error' | 'success', message: string): void {
    this.patch({ notice: { kind, message } });
  }

  clearNotice(): void {
    if (this.state.notice) this.patch({ notice: null });
  }

  setOperator(name: string): void {
    this.operator = name;
  }

  // -------------------------------------------------------------------------
  // Carga y catálogo
  // -------------------------------------------------------------------------

  async load(): Promise<void> {
    const [activities, allActivities, cuts, marks] = await Promise.all([
      this.store.listActivities(this.projectKey),
      this.store.allActivities(this.projectKey),
      this.store.listCuts(this.projectKey),
      this.store.listMarks(this.spaceId),
    ]);
    const activityId = activities.some((a) => a.id === this.state.activityId) ? this.state.activityId : activities[0]?.id ?? null;
    // Por defecto, el corte más reciente.
    const cutId = cuts.some((c) => c.id === this.state.cutId) ? this.state.cutId : cuts[cuts.length - 1]?.id ?? null;
    this.patch({ loaded: true, activities, allActivities, cuts, marks, activityId, cutId });
  }

  setActivity(id: string): void {
    if (this.state.activities.some((a) => a.id === id)) this.patch({ activityId: id });
  }

  setCut(id: string): void {
    if (this.state.cuts.some((c) => c.id === id)) this.patch({ cutId: id });
  }

  async addActivity(name: string, color?: string): Promise<void> {
    const c = color ?? ACTIVITY_COLORS[this.state.allActivities.length % ACTIVITY_COLORS.length];
    const id = await this.store.addActivity(this.projectKey, name, c);
    await this.load();
    this.patch({ activityId: id });
  }

  async editActivity(id: string, edit: { name?: string; color?: string }): Promise<void> {
    await this.store.updateActivity(id, edit);
    await this.load();
  }

  async removeActivity(id: string): Promise<void> {
    await this.store.deleteActivity(id);
    await this.load();
  }

  /** Nuevo corte (por defecto hoy) y queda activo. */
  async addCut(date = todayIso(), label = ''): Promise<ProgressCut> {
    const cut = await this.store.addCut(this.projectKey, date, label);
    await this.load();
    this.patch({ cutId: cut.id });
    return cut;
  }

  async editCut(id: string, edit: { date?: string; label?: string }): Promise<void> {
    await this.store.updateCut(id, edit);
    await this.load();
  }

  get activeActivity(): Activity | null {
    return this.state.activities.find((a) => a.id === this.state.activityId) ?? null;
  }

  get activeCut(): ProgressCut | null {
    return this.state.cuts.find((c) => c.id === this.state.cutId) ?? null;
  }

  // -------------------------------------------------------------------------
  // Soportes (los calcula la vista a partir de suelos y muros)
  // -------------------------------------------------------------------------

  setSupports(supports: ReadonlyMap<string, Support>): void {
    this.supports = new Map(supports);
    this.layerCache = null;
  }

  supportOf(target: ProgressTarget): Support | null {
    return this.supports.get(targetKey(target)) ?? null;
  }

  /** Suelo bajo un punto de la planta, o `null`. */
  floorAt(world: Point2D, floors: readonly { zoneId: string }[]): ProgressTarget | null {
    for (const f of floors) {
      const t: ProgressTarget = { kind: 'floor', zoneId: f.zoneId };
      const s = this.supportOf(t);
      if (s && insideSupport(s, world)) return t;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Herramientas
  // -------------------------------------------------------------------------

  setTool(tool: ProgressTool | null): void {
    this.patch({ tool, draft: null });
  }

  setBrushWidth(m: number): void {
    this.patch({ brushWidth: Math.max(0.02, Math.min(3, m)) });
  }

  /** ¿Se puede pintar? Avisa qué falta (corte, actividad). */
  private ready(): boolean {
    if (!this.state.cutId) {
      this.notify('info', 'Crea un corte (fecha del reporte) antes de pintar.');
      return false;
    }
    if (!this.state.activityId) {
      this.notify('info', 'Elige una actividad.');
      return false;
    }
    return true;
  }

  private color(): string {
    return this.activeActivity?.color ?? '#1E88E5';
  }

  begin(target: ProgressTarget, p: Point2D): void {
    const tool = this.state.tool;
    if (tool !== 'brush' && tool !== 'eraser' && tool !== 'rect') return;
    if (!this.supportOf(target) || !this.ready()) {
      this.rejectStroke();
      return;
    }
    this.patch({ draft: { target, tool, points: [p], tip: p, width: this.state.brushWidth, color: this.color() } });
  }

  /** El trazo que empezó no va a ningún lado (sin soporte bajo el dedo, sin corte): el lienzo borra su trazo vivo. */
  rejectStroke(): void {
    this.patch({ strokeSeq: this.state.strokeSeq + 1 });
  }

  move(p: Point2D): void {
    const d = this.state.draft;
    if (!d) return;
    if (d.tool === 'rect') {
      this.patch({ draft: { ...d, points: [d.points[0], p], tip: p } });
      return;
    }
    const last = d.points[d.points.length - 1];
    // La punta sigue siempre al dedo; un punto solo se agrega cada octavo de ancho
    // (antes, cada cuarto: el trazo quedaba 7,5 cm detrás del dedo con 30 cm de pincel).
    if (Math.hypot(p.x - last.x, p.y - last.y) < Math.max(0.01, d.width / 8)) {
      this.patch({ draft: { ...d, tip: p } });
      return;
    }
    this.patch({ draft: { ...d, points: [...d.points, p], tip: p } });
  }

  cancel(): void {
    if (this.state.draft) this.patch({ draft: null, strokeSeq: this.state.strokeSeq + 1 });
  }

  async end(p?: Point2D): Promise<void> {
    if (p) this.move(p);
    const d = this.state.draft;
    if (!d) return;
    let shape: ProgressShape | null = null;
    if (d.tool === 'rect') {
      const [a, b = a] = d.points;
      if (Math.abs(a.x - b.x) >= 0.02 && Math.abs(a.y - b.y) >= 0.02) shape = { kind: 'rect', a, b };
    } else {
      const last = d.points[d.points.length - 1];
      const points = Math.hypot(d.tip.x - last.x, d.tip.y - last.y) > 1e-6 ? [...d.points, d.tip] : d.points;
      shape = { kind: 'stroke', points, width: d.width };
    }
    if (!shape) {
      this.patch({ draft: null, strokeSeq: this.state.strokeSeq + 1 });
      return;
    }
    await this.addMark(d.target, shape, d.tool === 'eraser', true);
  }

  /** Relleno: todo el soporte con la actividad activa. */
  async fill(target: ProgressTarget): Promise<void> {
    if (!this.supportOf(target) || !this.ready()) return;
    await this.addMark(target, { kind: 'fill' }, false);
  }

  /**
   * Agrega una marca. Si lo que pinta ya está ejecutado con la misma actividad
   * en un corte anterior, no se guarda (nada nuevo) o se avisa cuánto se
   * descontó: no se cobra dos veces la misma obra.
   */
  private addMark(target: ProgressTarget, shape: ProgressShape, erase: boolean, endsStroke = false): Promise<void> {
    const mark: ProgressMark = {
      id: generateId() as string,
      spaceId: this.spaceId,
      cutId: this.state.cutId!,
      activityId: this.state.activityId!,
      target,
      shape,
      erase,
      operator: this.operator,
      createdAt: new Date().toISOString(),
    };
    const stroke = endsStroke ? { draft: null, strokeSeq: this.state.strokeSeq + 1 } : {};
    const support = this.supportOf(target);
    if (support && !erase) {
      const gain = markGain(support, this.state.marks, this.state.cuts, mark);
      if (gain.added < 1e-6) {
        this.patch(stroke);
        if (gain.alreadyDone > 1e-6) this.notify('info', `${this.activeActivity?.name ?? 'Esa actividad'} ya está ejecutada ahí en un corte anterior: no se cuenta otra vez.`);
        return Promise.resolve();
      }
      if (gain.alreadyDone > 0.005) {
        this.notify('info', `Se descontaron ${gain.alreadyDone.toFixed(2)} m² ya ejecutados en cortes anteriores.`);
      }
    }
    // Se ve al instante; la escritura va en cola (pintar rápido no debe chocar en SQLite).
    this.undoStack.push(mark.id);
    this.redoStack = [];
    this.patch({ ...stroke, marks: [...this.state.marks, mark], canUndo: true, canRedo: false });
    const run = () => this.store.addMark(mark);
    this.writes = this.writes.then(run, run).catch(() => {
      this.notify('error', 'No se pudo guardar el trazo.');
    });
    return this.writes;
  }

  async undo(): Promise<void> {
    const id = this.undoStack.pop();
    if (!id) return;
    await this.writes;
    await this.store.setMarkDeleted(id, true);
    this.redoStack.push(id);
    this.patch({ marks: this.state.marks.filter((m) => m.id !== id), canUndo: this.undoStack.length > 0, canRedo: true });
  }

  async redo(): Promise<void> {
    const id = this.redoStack.pop();
    if (!id) return;
    await this.store.setMarkDeleted(id, false);
    this.undoStack.push(id);
    const marks = await this.store.listMarks(this.spaceId);
    this.patch({ marks, canUndo: true, canRedo: this.redoStack.length > 0 });
  }

  // -------------------------------------------------------------------------
  // Dibujo y cantidades
  // -------------------------------------------------------------------------

  /**
   * Capas a dibujar: por soporte y actividad, lo pintado en el corte activo
   * (opaco) y, si `previous`, lo acumulado en los cortes anteriores (tenue).
   * Se recalculan solo cuando cambian las marcas, el corte o los soportes.
   */
  layers(previous = true): ProgressLayer[] {
    const c = this.layerCache;
    const s = this.state;
    if (c && c.marks === s.marks && c.cutId === s.cutId && c.supports === this.supports && c.previous === previous) return c.layers;
    const layers = this.layersFor(s.cutId, previous, s.marks);
    this.layerCache = { marks: s.marks, cutId: s.cutId, supports: this.supports, previous, layers };
    return layers;
  }

  /**
   * Capas de un corte cualquiera (para los reportes): lo del corte opaco y,
   * si `previous`, lo de los cortes anteriores tenue. Sin duplicados: lo de
   * un corte nunca repite lo ya ejecutado antes con la misma actividad.
   */
  layersFor(cutId: string | null, previous = true, marks: readonly ProgressMark[] = this.state.marks, onlyKeys?: ReadonlySet<string>): ProgressLayer[] {
    const s = this.state;
    const ids = orderedCuts(s.cuts).map((x) => x.id);
    const k = cutId ? ids.indexOf(cutId) : -1;
    const upTo = k >= 0 ? ids.slice(0, k + 1) : ids;
    const colorOf = new Map(s.allActivities.map((a) => [a.id, a.color]));
    const layers: ProgressLayer[] = [];
    const byTarget = new Map<string, ProgressMark[]>();
    for (const m of marks) {
      const key = targetKey(m.target);
      if (onlyKeys && !onlyKeys.has(key)) continue;
      const list = byTarget.get(key);
      if (list) list.push(m);
      else byTarget.set(key, [m]);
    }
    for (const [key, ms] of byTarget) {
      const support = this.supports.get(key);
      if (!support || support.outline.length < 3) continue;
      const g = supportGrid(support);
      for (const a of [...new Set(ms.map((m) => m.activityId))]) {
        const per = cutCoverages(g, ms.filter((m) => m.activityId === a), upTo);
        const color = colorOf.get(a) ?? '#888888';
        if (previous && k > 0) {
          const prev = coverageRuns(g, per.get(upTo[k - 1])!.after);
          if (prev.length) layers.push({ targetKey: key, color, opacity: PREVIOUS_CUT_OPACITY, runs: prev });
        }
        const own = k >= 0 ? per.get(cutId!)!.own : null;
        const now = own ? coverageRuns(g, own) : [];
        if (now.length) layers.push({ targetKey: key, color, opacity: 1, runs: now });
      }
    }
    return layers;
  }

  /** Cantidades del corte activo (o del indicado). */
  quantities(cutId = this.state.cutId): QuantityRow[] {
    if (!cutId) return [];
    return quantities(this.supports, this.state.marks, this.state.cuts, cutId);
  }

  /** Partes ejecutadas (rectángulos con medidas) de un corte, para la memoria. */
  parts(cutId: string): QuantityPart[] {
    return quantityParts(this.supports, this.state.marks, this.state.cuts, cutId);
  }

  /** Todos los soportes conocidos (para reportar también los que no tienen avance). */
  get supportKeys(): string[] {
    return [...this.supports.keys()];
  }

  /** Área de un soporte (m²). */
  supportAreaOf(key: string): number {
    const s = this.supports.get(key);
    return s ? supportArea(s) : 0;
  }

  /** Nombre del corte para rótulos. */
  cutName(id: string): string {
    const c = this.state.cuts.find((x) => x.id === id);
    return c ? cutLabel(c) : 'Corte';
  }
}
