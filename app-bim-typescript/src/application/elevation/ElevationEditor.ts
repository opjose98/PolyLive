// =============================================================================
// ElevationEditor.ts — Cerebro de la vista de alzado (F4)
// =============================================================================
//
// El equivalente de EditorController para el alzado de un muro: lógica PURA
// (sin React ni Skia) que recibe puntos de pantalla, los lleva al sistema
// local del muro (CSL: X a lo largo del eje desde su inicio, Y altura desde su
// base más baja), decide qué hacer y publica un estado inmutable.
//
// LADO A / B: se mira el muro desde una de sus dos caras. Lado A = la cara a
// la izquierda del eje (normal (−uy, ux) en el mundo de la planta): desde ahí
// el inicio del muro queda a la izquierda. El lado B es su espejo: X de
// pantalla invertida. Los huecos se guardan siempre en CSL, así que cambiar de
// lado no toca los datos.
//
// PERFIL: si el muro tiene restricciones de nivel (vertical.ts), el alzado
// dibuja y mide su perfil real, no la culata guardada con el alzado.
// =============================================================================

import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { ElevationSnapshot, ElevationSnapshotCommand, VanoSnapshot } from '../commands/ElevationSnapshotCommand';
import { revitObjectId } from '../../domain/objects/base';
import { LEVEL_PROP, ProjectMarker } from '../../domain/objects/marker';
import { LevelElevations, WallProfile, WallVertical, profileBottom, profileHeight, profileProblem, resolveWallProfile, wallVerticalOf } from '../../domain/objects/vertical';
import { OpeningType, WallElevation, WallOpening, WallOpeningId, WallQuantification, computeQuantification, effectiveLeftHeight, effectiveRightHeight, levelsFromProfile, openingEnd, openingTop, OPENING_DEFAULTS } from '../../domain/objects/wall-elevation';
import { diagnostics, reportFailure } from '../../shared/diagnostics';
import type { AppServices } from '../AppServices';
import { ElevationSeverity, ElevationViewport, snapXSmart, snapYSmart } from './WallElevationService';

export type ElevationTool = 'select' | OpeningType;
export type WallSide = 'A' | 'B';

export interface LevelLine {
  readonly id: string;
  readonly name: string;
  /** Altura en el CSL (0 = base más baja del muro). */
  readonly y: number;
  /** Cota absoluta del nivel, m. */
  readonly cota: number;
}

export interface ElevationEditorState {
  readonly wall: Wall | null;
  /** Alzado a dibujar y medir (con el perfil real si el muro tiene niveles). */
  readonly elevation: WallElevation | null;
  readonly profile: WallProfile | null;
  readonly vertical: WallVertical | null;
  readonly levelLines: readonly LevelLine[];
  /** Cota absoluta del CSL 0. */
  readonly baseElevation: number;
  readonly tool: ElevationTool;
  readonly side: WallSide;
  readonly viewport: ElevationViewport;
  readonly selectedId: WallOpeningId | null;
  /** Hueco arrastrado en su posición en vivo (no persistido). */
  readonly dragPreview: WallOpening | null;
  readonly busy: boolean;
  readonly notice: { kind: 'info' | 'error' | 'success'; message: string } | null;
}

type ElevationListener = (s: ElevationEditorState) => void;

const MIN_SCALE = 10;
const MAX_SCALE = 1200;

export class ElevationEditor {
  private readonly services: AppServices;
  private readonly wallId: string;
  private state: ElevationEditorState;
  private listeners: ElevationListener[] = [];
  private stored: WallElevation | null = null;
  private levels: readonly ProjectMarker[] = [];
  private size = { w: 360, h: 480 };
  private drag: { origin: { x: number; y: number }; opening: WallOpening; moved: boolean } | null = null;

  constructor(params: { services: AppServices; wallId: string; levels?: readonly ProjectMarker[] }) {
    this.services = params.services;
    this.wallId = params.wallId;
    this.levels = params.levels ?? [];
    this.state = {
      wall: null,
      elevation: null,
      profile: null,
      vertical: null,
      levelLines: [],
      baseElevation: 0,
      tool: 'select',
      side: 'A',
      viewport: { scale: 80, offsetX: 40, offsetY: 400 },
      selectedId: null,
      dragPreview: null,
      busy: false,
      notice: null,
    };
  }

  // --- Suscripción ----------------------------------------------------------

  getState(): ElevationEditorState {
    return this.state;
  }

  subscribe(l: ElevationListener): () => void {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((x) => x !== l);
    };
  }

  private patch(p: Partial<ElevationEditorState>): void {
    this.state = { ...this.state, ...p };
    for (const l of this.listeners) l(this.state);
  }

  private notify(kind: 'info' | 'error' | 'success', message: string): void {
    this.patch({ notice: { kind, message } });
  }

  clearNotice(): void {
    if (this.state.notice) this.patch({ notice: null });
  }

  private fail(err: unknown, fallback: string): void {
    this.notify('error', reportFailure('elevation', err, fallback));
  }

  // --- Carga ----------------------------------------------------------------

  get wallLength(): number {
    return this.state.wall ? (this.state.wall.length as number) : 0;
  }

  get levelElevations(): LevelElevations {
    return new Map(this.levels.map((m) => [m.id, m.value] as [string, number]));
  }

  setLevels(levels: readonly ProjectMarker[]): void {
    this.levels = levels;
    if (this.state.wall && this.stored) this.publish(this.state.wall, this.stored);
  }

  /** Lee el muro y su alzado. `fit` encuadra la vista (la primera vez). */
  async load(fit = true): Promise<void> {
    try {
      const wall = await this.services.store.readObject(revitObjectId(this.wallId));
      if (!(wall instanceof Wall)) {
        this.patch({ wall: null, elevation: null });
        this.notify('error', 'El muro ya no existe.');
        return;
      }
      this.stored = await this.services.elevations.getElevation(wall);
      this.publish(wall, this.stored);
      if (fit) this.zoomToFit();
    } catch (err) {
      // La vista llama a load() sin esperar: un error aquí no debe quedar
      // como promesa rechazada sin manejar.
      diagnostics.error('elevation', 'No se pudo leer el alzado del muro', err);
      this.notify('error', 'No se pudo leer el alzado del muro.');
    }
  }

  private publish(wall: Wall, stored: WallElevation): void {
    const base = this.levels.find((m) => m.isBase)?.id ?? '';
    const vertical = wallVerticalOf(wall, base, LEVEL_PROP);
    const profile = wall.vertical ? resolveWallProfile(vertical, this.levelElevations) : null;
    const elevation = profile ? { ...stored, levels: levelsFromProfile(profile) } : stored;
    const baseElevation = profile ? profileBottom(profile) : this.levelElevations.get(vertical.start.baseLevelId) ?? 0;
    const selectedId = elevation.openings.some((o) => o.id === this.state.selectedId) ? this.state.selectedId : null;
    this.patch({
      wall,
      elevation,
      profile,
      vertical,
      baseElevation,
      levelLines: this.levels.map((m) => ({ id: m.id, name: m.name, y: m.value - baseElevation, cota: m.value })),
      selectedId,
    });
  }

  // --- Vista ----------------------------------------------------------------

  setSize(w: number, h: number): void {
    const changed = Math.abs(w - this.size.w) > 1 || Math.abs(h - this.size.h) > 1;
    this.size = { w, h };
    if (changed && this.state.wall) this.zoomToFit();
  }

  get maxHeight(): number {
    const e = this.state.elevation;
    if (!e) return 3;
    return Math.max(e.levels.coronacion, effectiveLeftHeight(e.levels), effectiveRightHeight(e.levels));
  }

  /** Encuadra el muro con margen para las etiquetas de nivel (izquierda) y el cromo. */
  zoomToFit(): void {
    const L = Math.max(this.wallLength, 0.1);
    const H = Math.max(this.maxHeight, 0.1);
    // A la izquierda quedan los rótulos de nivel (≈70 px): el muro empieza después.
    const padX = 84;
    const padTop = 150;
    const padBottom = 140;
    const scale = clamp(
      Math.min((this.size.w - padX * 2) / L, (this.size.h - padTop - padBottom) / H),
      MIN_SCALE,
      MAX_SCALE,
    );
    this.patch({
      viewport: {
        scale,
        offsetX: (this.size.w - L * scale) / 2,
        offsetY: padTop + (this.size.h - padTop - padBottom + H * scale) / 2,
      },
    });
  }

  setViewport(v: ElevationViewport): void {
    this.patch({ viewport: { ...v, scale: clamp(v.scale, MIN_SCALE, MAX_SCALE) } });
  }

  zoomAround(fx: number, fy: number, factor: number): void {
    const v = this.state.viewport;
    const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
    const k = scale / v.scale;
    this.patch({ viewport: { scale, offsetX: fx - (fx - v.offsetX) * k, offsetY: fy - (fy - v.offsetY) * k } });
  }

  /**
   * Aplica de una vez lo que un gesto movió la vista: escala `s` alrededor del
   * origen de pantalla y desplazamiento `dx, dy` (px). El lienzo anima el gesto
   * por su cuenta y solo entrega el resultado al soltar.
   */
  applyViewDelta(s: number, dx: number, dy: number): void {
    const v = this.state.viewport;
    const scale = clamp(v.scale * s, MIN_SCALE, MAX_SCALE);
    const k = scale / v.scale;
    this.patch({ viewport: { scale, offsetX: dx + v.offsetX * k, offsetY: dy + v.offsetY * k } });
  }

  zoomBy(factor: number): void {
    this.zoomAround(this.size.w / 2, this.size.h / 2, factor);
  }

  /** Pantalla → CSL, con el espejo del lado B. */
  toCsl(x: number, y: number): { x: number; y: number } {
    const v = this.state.viewport;
    const sx = (x - v.offsetX) / v.scale;
    return { x: this.state.side === 'B' ? this.wallLength - sx : sx, y: (v.offsetY - y) / v.scale };
  }

  /** CSL → pantalla, con el espejo del lado B. */
  toScreen(p: { x: number; y: number }): { x: number; y: number } {
    const v = this.state.viewport;
    const x = this.state.side === 'B' ? this.wallLength - p.x : p.x;
    return { x: x * v.scale + v.offsetX, y: v.offsetY - p.y * v.scale };
  }

  setSide(side: WallSide): void {
    if (side !== this.state.side) this.patch({ side });
  }

  setTool(tool: ElevationTool): void {
    this.patch({ tool, selectedId: tool === 'select' ? this.state.selectedId : null });
  }

  select(id: WallOpeningId | null): void {
    this.patch({ selectedId: id });
  }

  get selected(): WallOpening | null {
    return this.state.elevation?.openings.find((o) => o.id === this.state.selectedId) ?? null;
  }

  // --- Derivados ------------------------------------------------------------

  get quantification(): WallQuantification | null {
    return this.state.elevation ? computeQuantification(this.state.elevation, this.wallLength) : null;
  }

  get severityByOpening(): ReadonlyMap<string, ElevationSeverity> {
    const map = new Map<string, ElevationSeverity>();
    const e = this.state.elevation;
    if (!e) return map;
    for (const o of e.openings) map.set(o.id as string, this.services.elevations.validateOpening(o, e, this.wallLength).severity);
    return map;
  }

  /** Hueco bajo un punto de pantalla. */
  openingAt(x: number, y: number, tolPx: number): WallOpening | null {
    const e = this.state.elevation;
    if (!e) return null;
    const p = this.toCsl(x, y);
    const tol = tolPx / this.state.viewport.scale;
    // El de arriba (último dibujado) gana.
    for (let i = e.openings.length - 1; i >= 0; i--) {
      const o = e.openings[i];
      if (p.x >= o.xOffset - tol && p.x <= openingEnd(o) + tol && p.y >= o.sillHeight - tol && p.y <= openingTop(o) + tol) return o;
    }
    return null;
  }

  // --- Gestos ---------------------------------------------------------------

  /**
   * Toque: con Seleccionar elige el hueco bajo el dedo; con Puerta/Ventana/Hueco
   * coloca uno nuevo CENTRADO en el toque y ajustado al muro.
   */
  async tap(x: number, y: number, tolPx: number, dims?: { width?: number; height?: number; sillHeight?: number }): Promise<void> {
    const { elevation, wall, tool } = this.state;
    if (!elevation || !wall || this.state.busy) return;
    if (tool === 'select') {
      this.patch({ selectedId: this.openingAt(x, y, tolPx)?.id ?? null });
      return;
    }
    const width = dims?.width ?? OPENING_DEFAULTS[tool].width;
    const L = this.wallLength;
    const p = this.toCsl(x, y);
    const tol = tolPx / this.state.viewport.scale;
    const left = snapXSmart(p.x - width / 2, elevation, L, tol);
    const xOffset = clamp(left, 0, Math.max(0, L - width));
    await this.runUndoable('No se pudo crear el hueco.', async () => {
      const r = await this.services.elevations.addOpening(elevation, wall, {
        type: tool,
        xOffset,
        width,
        height: dims?.height,
        sillHeight: dims?.sillHeight,
      });
      this.stored = r.elevation;
      this.publish(wall, r.elevation);
      this.patch({ selectedId: r.opening.id });
      if (r.validation.severity === 'warning' && r.validation.message) this.notify('info', r.validation.message);
    });
  }

  /** Empieza a arrastrar el hueco seleccionado si el dedo lo toca. */
  beginDrag(x: number, y: number, tolPx: number): boolean {
    const sel = this.selected;
    if (!sel || this.state.tool !== 'select') return false;
    const hit = this.openingAt(x, y, tolPx);
    if (!hit || hit.id !== sel.id) return false;
    this.drag = { origin: this.toCsl(x, y), opening: sel, moved: false };
    this.patch({ dragPreview: sel });
    return true;
  }

  updateDrag(x: number, y: number, tolPx: number): void {
    const d = this.drag;
    const e = this.state.elevation;
    if (!d || !e) return;
    const p = this.toCsl(x, y);
    const tol = tolPx / this.state.viewport.scale;
    const o = d.opening;
    const L = this.wallLength;
    // Se engancha el borde o el centro del hueco más cercano a una referencia
    // (extremos y centro del muro, bordes y centros de los otros huecos).
    const rawX = o.xOffset + (p.x - d.origin.x);
    const candidates = [
      snapXSmart(rawX, e, L, tol, o.id),
      snapXSmart(rawX + o.width, e, L, tol, o.id) - o.width,
      snapXSmart(rawX + o.width / 2, e, L, tol, o.id) - o.width / 2,
    ];
    const snapped = candidates.filter((c) => Math.abs(c - rawX) > 1e-9);
    const best = snapped.length ? snapped.reduce((a, b) => (Math.abs(b - rawX) < Math.abs(a - rawX) ? b : a)) : rawX;
    const xOffset = clamp(best, 0, Math.max(0, L - o.width));
    // Las puertas no se despegan del suelo: solo se mueven en X.
    const sillHeight =
      o.type === 'door' ? o.sillHeight : Math.max(0, snapYSmart(o.sillHeight + (p.y - d.origin.y), e, tol, o.id));
    d.moved = d.moved || Math.abs(xOffset - o.xOffset) > 1e-4 || Math.abs(sillHeight - o.sillHeight) > 1e-4;
    this.patch({ dragPreview: { ...o, xOffset, sillHeight } });
  }

  cancelDrag(): void {
    this.drag = null;
    if (this.state.dragPreview) this.patch({ dragPreview: null });
  }

  async endDrag(): Promise<void> {
    const d = this.drag;
    const preview = this.state.dragPreview;
    this.drag = null;
    if (!d || !preview || !d.moved) {
      this.patch({ dragPreview: null });
      return;
    }
    await this.updateSelected({ xOffset: preview.xOffset, sillHeight: preview.sillHeight });
    this.patch({ dragPreview: null });
  }

  // --- Edición --------------------------------------------------------------

  async updateSelected(updates: Partial<Omit<WallOpening, 'id'>>): Promise<void> {
    const { elevation, wall } = this.state;
    const sel = this.selected;
    if (!elevation || !wall || !sel) return;
    await this.runUndoable('No se pudo aplicar el cambio.', async () => {
      const r = await this.services.elevations.updateOpening(elevation, wall, sel.id, updates);
      this.stored = r.elevation;
      this.publish(wall, r.elevation);
      if (r.validation.severity === 'warning' && r.validation.message) this.notify('info', r.validation.message);
    });
  }

  async removeSelected(): Promise<void> {
    const { elevation, wall } = this.state;
    const sel = this.selected;
    if (!elevation || !wall || !sel) return;
    await this.runUndoable('No se pudo eliminar el hueco.', async () => {
      this.stored = await this.services.elevations.removeOpening(elevation, sel.id);
      this.patch({ selectedId: null });
      this.publish(wall, this.stored);
      this.notify('success', 'Hueco eliminado.');
    });
  }

  /** Nuevas restricciones de nivel del muro (un paso de deshacer). */
  async saveVertical(next: WallVertical): Promise<boolean> {
    const wall = this.state.wall;
    if (!wall) return false;
    const p = resolveWallProfile(next, this.levelElevations);
    const problem = profileProblem(p);
    if (problem) {
      this.notify('error', problem);
      return false;
    }
    let ok = false;
    await this.run('No se pudo cambiar la altura.', async () => {
      await this.services.useCases.updateObjectProperty.execute({
        objectId: wall.id,
        property: 'vertical',
        newValue: next,
        also: { height: profileHeight(p) },
      });
      await this.load(false);
      ok = true;
    });
    return ok;
  }

  /**
   * Continuidad: los muros que comparten un extremo con este toman, en ese
   * extremo, su misma restricción de base y tope. Devuelve cuántos cambió.
   */
  async propagateToConnected(): Promise<number> {
    const { wall, vertical } = this.state;
    if (!wall || !vertical) return 0;
    const base = this.levels.find((m) => m.isBase)?.id ?? '';
    let updated = 0;
    await this.run('No se pudieron igualar los muros conectados.', async () => {
      const objects = await this.services.store.listObjects(wall.roomId);
      const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-3;
      for (const other of objects) {
        if (!(other instanceof Wall) || other.id === wall.id) continue;
        const ov = wallVerticalOf(other, base, LEVEL_PROP);
        let next = ov;
        for (const [pt, ext] of [[wall.startPoint, vertical.start], [wall.endPoint, vertical.end]] as const) {
          if (near(other.startPoint, pt)) next = { ...next, start: ext };
          if (near(other.endPoint, pt)) next = { ...next, end: ext };
        }
        if (next === ov) continue;
        const p = resolveWallProfile(next, this.levelElevations);
        if (profileProblem(p)) continue;
        await this.services.useCases.updateObjectProperty.execute({
          objectId: other.id,
          property: 'vertical',
          newValue: next,
          also: { height: profileHeight(p) },
        });
        updated++;
      }
    });
    return updated;
  }

  /** Alzado guardado + vanos del muro en planta: lo que una edición puede cambiar. */
  private async snapshot(wall: Wall): Promise<ElevationSnapshot> {
    const vanos = new Map<string, VanoSnapshot | null>();
    for (const o of await this.services.store.listObjects(wall.roomId)) {
      if ((o instanceof Door || o instanceof Window) && (o.parentWallId as string) === (wall.id as string)) {
        vanos.set(o.id as string, {
          offsetAlongWall: o.offsetAlongWall as number,
          width: o.width as number,
          height: o.height as number,
        });
      }
    }
    return { elevation: this.stored ?? (await this.services.elevations.getElevation(wall)), vanos };
  }

  /**
   * Como `run`, y además registra la edición como UN paso de deshacer en la
   * historia compartida con la planta (alzado + vanos, antes y después).
   */
  private async runUndoable(fallback: string, fn: () => Promise<void>): Promise<void> {
    const wall = this.state.wall;
    if (!wall) return;
    const before = await this.snapshot(wall);
    await this.run(fallback, async () => {
      await fn();
      const after = await this.snapshot(wall);
      const svc = this.services.elevations;
      await this.services.commandStack.execute(new ElevationSnapshotCommand((e) => svc.saveElevation(e), before, after));
    });
  }

  private async run(fallback: string, fn: () => Promise<void>): Promise<void> {
    this.patch({ busy: true });
    try {
      await fn();
    } catch (err) {
      this.fail(err, fallback);
    } finally {
      this.patch({ busy: false });
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
