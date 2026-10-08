// =============================================================================
// planRenderer.ts — Dibujo de la planta sobre ICanvasRenderer
// Basado en: Canvas2D-interacción.md, presupuesto-frame.md
// Portado de LevON: features/editor/ui/static_layer_painter.dart,
//                   preview_layer_painter.dart, overlays/labels_layer_painter.dart
// =============================================================================
//
// Función pura sobre `ICanvasRenderer`: se verifica con un renderer que
// registra llamadas, sin montar Skia.
//
// REPRESENTACIÓN DE PLANO (convenciones de dibujo arquitectónico, ISO 128 /
// NCS, y los filtros de fase de Revit):
//   · JERARQUÍA DE TRAZOS: lo CORTADO por el plano (caras de muro, columnas)
//     en trazo grueso; lo visible en medio; símbolos, tramas y cotas en fino.
//   · muro = dos caras con esquinas a inglete; los vanos lo cortan y dejan
//     jambas; los extremos sueltos se cierran con tapa. Relleno (poché) según
//     material: concreto/portante sólido, mampostería con trama a 45°,
//     tabique liviano (drywall) solo contorno;
//   · fase anterior ("existente") en medio tono y sin poché, como en Revit;
//   · puerta = hoja con espesor abierta a 90° + arco de giro fino;
//   · ventana = caras del muro de jamba a jamba + vidrio doble fino;
//   · columna = su sección real con poché sólido y trazo grueso;
//   · cota = línea de cota fina con trazos a 45° y el valor encima;
//   · recinto = solo los contornos CERRADOS que forman los muros.
//
// ORDEN DE CAPAS (de atrás hacia delante):
//   1. rejilla (si no la dibuja la GPU)   5. vanos (símbolos)
//   2. recintos cerrados                   6. muro en curso de trazado
//   3. muros (poché + caras)               7. fotos, selección, snap
//   4. columnas                            8. etiquetas
// =============================================================================

import type { ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';
import type { Point2D, CanvasTransform } from '../../domain/geometry/types';
import type { RevitObjectBase, RevitObjectId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Room } from '../../domain/objects/room';
import { Column } from '../../domain/objects/column';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { worldToScreen } from '../../domain/geometry/coordinates';
import { isPointInPolygon } from '../../domain/geometry/polygon-utils';
import type { Handle } from '../../application/canvas/SelectionService';
import { CANVAS_PALETTES, CanvasPalette } from '../design/canvasThemes';
import { sizes } from '../design/tokens';
import { buildWallOutlines, faceSegments, hatchSegments, WallOutline } from './wallGeometry';
import { drawSketch, SketchShape, withAlpha } from './sketch';

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface PlanScene {
  readonly objects: readonly RevitObjectBase[];
  readonly transform: CanvasTransform;
  readonly selectedId: RevitObjectId | null;
  readonly handles: readonly Handle[];
  readonly width: number;
  readonly height: number;
  readonly showGrid: boolean;
  /** Cotas de muro y áreas de recinto. */
  readonly showLabels: boolean;
  /** Objetos de otros niveles/fases: se dibujan como calco atenuado, debajo de todo. */
  readonly underlay?: readonly RevitObjectBase[];
  /** Ids de objetos de una fase anterior a la activa: se dibujan como existentes. */
  readonly existingIds?: ReadonlySet<string>;
  /** Mojones con posición en este espacio (Topografía, y visibles en Levantamiento). */
  readonly benchmarks?: readonly PlanBenchmark[];
  readonly selectedBenchmarkId?: string | null;
  /** Rótulos de coordenadas reales (Topografía, filtro "Rótulos de coordenadas"). */
  readonly coordLabels?: readonly { readonly position: Point2D; readonly lines: readonly string[] }[];
  /** Recintos cerrados (con identidad: id, nombre y área neta). */
  readonly rooms?: readonly PlanRoom[];
  /** Nombre a mostrar en el recinto principal si aún no tiene nombre propio. */
  readonly roomName?: string;
  /** Recinto seleccionado: se resalta su contorno a cara interior. */
  readonly selectedZoneId?: string | null;
  /** Herramientas de Topografía (M2b): puntos tocados, polígono de área y objetivo de replanteo. */
  readonly measure?: {
    readonly points: readonly Point2D[];
    readonly closed: boolean;
    readonly target: Point2D | null;
    readonly label?: string;
  } | null;
  /** Cuadrícula de coordenadas reales (líneas de E y N redondos). */
  readonly coordGrid?: readonly { readonly from: Point2D; readonly to: Point2D; readonly label: string }[] | null;
  /** Vanos genéricos (huecos sin puerta ni ventana) que cortan los muros. */
  readonly genericOpenings?: readonly { readonly wallId: string; readonly xOffset: number; readonly width: number }[];
  /** Avance de obra (M3): celdas pintadas por actividad (en metros del modelo). */
  readonly progressLayers?: readonly {
    readonly color: string;
    readonly opacity: number;
    readonly runs: readonly { x: number; y: number; w: number; h: number }[];
  }[];
  /** Dibujo técnico (F6b): cotas, textos, líneas, vigas… */
  readonly annotations?: readonly SketchShape[];
  /** Marcas de revisión (M4) y otros trazos guardados, encima de todo. */
  readonly markups?: readonly SketchShape[];
  /** Suelos (F6a): contorno neto de su recinto, con trama de piso. */
  readonly floors?: readonly { readonly id: string; readonly polygon: readonly Point2D[] }[];
  /** Muro en curso de trazado. */
  readonly wallDraft?: { start: Point2D | null; end: Point2D | null; snappedToNode: boolean } | null;
  /** Espesor (m) con que se previsualiza el muro en curso. */
  readonly draftThickness?: number;
  /** Mostrar los nudos (extremos de muro) como puntos de enganche. */
  readonly showNodes?: boolean;
  /** Muro marcado como destino de medición (herramienta Medir). */
  readonly measureTargetId?: string | null;
  readonly photoMarkers?: readonly {
    id: string;
    position: Point2D;
    direction?: number;
    label?: string;
  }[];
  readonly selectedPhotoMarkerId?: string | null;
  readonly palette?: CanvasPalette;
  readonly gridStyle?: { readonly lines: boolean; readonly dots: boolean };
  /** Píxeles de rejilla a dibujar fuera del viewport por cada lado. */
  readonly gridOverscanPx?: number;
  /** El extremo arrastrado está enganchado a un nodo: se marca con un anillo. */
  readonly snapIndicator?: Point2D | null;
}

export interface PlanRoom {
  readonly polygon: readonly Point2D[];
  readonly area: number;
  readonly centroid: Point2D;
  readonly id?: string;
  readonly name?: string;
  readonly netPolygon?: readonly Point2D[];
  readonly netArea?: number;
}

export interface PlanBenchmark {
  readonly id: string;
  readonly name: string;
  readonly position: Point2D;
  /** Tiene coordenadas reales Y posición en el dibujo: sirve para amarrar. */
  readonly control: boolean;
}

/** Color de los mojones (verde de Topografía). */
const BENCHMARK_COLOR = '#2E7D32';

/** Separación de la rejilla, en metros, elegida según el zoom (20–100 px por celda). */
export function gridStepMeters(scale: number): number {
  const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  for (const step of candidates) {
    if (step * scale >= 20) return step;
  }
  return candidates[candidates.length - 1];
}

type ToScreen = (p: Point2D) => Point2D;

/** Jerarquía de trazos (px, antes de `lineScale`). */
const STROKE = { cut: 2, medium: 1.2, thin: 0.75 } as const;
/** Paso de la trama de mampostería (px). */
const HATCH_PX = 6;

type WallRendering = 'solid' | 'hatch' | 'outline';

/**
 * Cómo se rellena un muro cortado. El material escrito manda (concreto,
 * ladrillo, bloque, drywall…); sin material, un portante se dibuja sólido y
 * un tabique con trama.
 */
export function wallRendering(material: string | undefined, isStructural: boolean): WallRendering {
  const m = (material ?? '').toLowerCase();
  if (/drywall|yeso|panel|superboard|board|madera|vidrio/.test(m)) return 'outline';
  if (/ladrillo|bloque|mamposter|adobe|piedra|tapia/.test(m)) return 'hatch';
  if (/concreto|hormig|reforzad|acero/.test(m)) return 'solid';
  return isStructural ? 'solid' : 'hatch';
}

interface Ctx {
  readonly r: ICanvasRenderer;
  readonly scene: PlanScene;
  readonly pal: CanvasPalette;
  readonly toScreen: ToScreen;
  readonly scale: number;
  /** Trazo fino de dibujo (caras, símbolos), en px. */
  readonly line: number;
  readonly walls: readonly Wall[];
  readonly wallsById: ReadonlyMap<string, Wall>;
  readonly outlines: ReadonlyMap<string, WallOutline>;
  readonly vanosByWall: ReadonlyMap<string, readonly (Door | Window)[]>;
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

/**
 * Capa viva (se regraba con cada movimiento del dedo, la planta no): el muro
 * en curso, el objeto que se arrastra con sus vanos y handles, y el anillo de
 * snap. Es barata porque solo contiene eso.
 */
export function drawPlanOverlay(r: ICanvasRenderer, scene: PlanScene): void {
  const ctx = makeCtx(r, scene);
  if (scene.objects.length) {
    drawWalls(ctx);
    drawColumns(ctx);
    drawVanos(ctx);
    drawSelection(ctx);
  }
  drawWallDraft(ctx);
  if (scene.snapIndicator) drawSnapIndicator(r, ctx.toScreen(scene.snapIndicator), ctx.pal);
}

function makeCtx(r: ICanvasRenderer, scene: PlanScene): Ctx {
  const pal = scene.palette ?? CANVAS_PALETTES.claro;
  const walls = scene.objects.filter((o): o is Wall => o instanceof Wall);
  const vanosByWall = new Map<string, (Door | Window)[]>();
  for (const o of scene.objects) {
    if (!(o instanceof Door) && !(o instanceof Window)) continue;
    const key = o.parentWallId as string;
    vanosByWall.set(key, [...(vanosByWall.get(key) ?? []), o]);
  }
  return {
    r,
    scene,
    pal,
    toScreen: (p) => worldToScreen(p, scene.transform),
    scale: scene.transform.scale,
    line: STROKE.thin * pal.lineScale,
    walls,
    wallsById: new Map(walls.map((w) => [w.id as string, w])),
    outlines: buildWallOutlines(
      walls
        .filter((w) => w.isStraight)
        .map((w) => ({ id: w.id as string, start: w.startPoint, end: w.endPoint, thickness: w.thickness as number })),
    ),
    vanosByWall,
  };
}

export function drawPlan(r: ICanvasRenderer, scene: PlanScene): void {
  const ctx = makeCtx(r, scene);
  const { pal } = ctx;

  if (scene.showGrid) drawGrid(r, scene, pal);
  if (scene.underlay?.length) drawUnderlay(r, scene.underlay, pal, ctx.toScreen, ctx.scale);
  drawRooms(ctx);
  if (scene.floors?.length) drawFloors(ctx);
  if (scene.progressLayers?.length) drawProgress(ctx);
  drawWalls(ctx);
  drawColumns(ctx);
  drawVanos(ctx);
  if (scene.genericOpenings?.length) drawGenericOpenings(ctx);
  if (scene.showNodes) drawNodes(ctx);
  drawWallDraft(ctx);
  if (scene.photoMarkers?.length) drawPhotoMarkers(ctx);
  if (scene.coordGrid?.length) drawCoordGrid(ctx);
  if (scene.coordLabels?.length) drawCoordLabels(ctx);
  if (scene.measure) drawMeasure(ctx);
  if (scene.benchmarks?.length) drawBenchmarks(ctx);
  drawSelection(ctx);
  if (scene.snapIndicator) drawSnapIndicator(r, ctx.toScreen(scene.snapIndicator), pal);
  if (scene.showLabels) drawLabels(ctx);
  if (scene.annotations?.length) drawSketch(r, scene.annotations, ctx.toScreen, ctx.scale);
  if (scene.markups?.length) drawSketch(r, scene.markups, ctx.toScreen, ctx.scale);
}

/** Avance: cada corrida de celdas pintadas como un rectángulo del color de su actividad. */
function drawProgress({ r, scene, scale, toScreen }: Ctx): void {
  // Medio píxel de solape: sin él se ven costuras entre filas de celdas.
  const pad = 0.5;
  for (const layer of scene.progressLayers ?? []) {
    r.setFillStyle(withAlpha(layer.color, 0.55 * layer.opacity));
    for (const run of layer.runs) {
      const p = toScreen({ x: run.x, y: run.y });
      r.fillRect(p.x - pad, p.y - pad, run.w * scale + pad * 2, run.h * scale + pad * 2);
    }
  }
}

// ---------------------------------------------------------------------------
// 1. Rejilla
// ---------------------------------------------------------------------------

function drawGrid(r: ICanvasRenderer, scene: PlanScene, pal: CanvasPalette): void {
  const { transform, width, height } = scene;
  const step = gridStepMeters(transform.scale);
  const stepPx = step * transform.scale;

  // La rejilla se ancla al ORIGEN DEL MUNDO, no al viewport: si resbalara al
  // panear dejaría de servir de referencia métrica.
  const pad = scene.gridOverscanPx ?? 0;
  const x0 = -pad;
  const y0 = -pad;
  const x1 = width + pad;
  const y1 = height + pad;
  const firstX = x0 + ((((transform.offsetX - x0) % stepPx) + stepPx) % stepPx);
  const firstY = y0 + ((((transform.offsetY - y0) % stepPx) + stepPx) % stepPx);
  const style = scene.gridStyle ?? { lines: true, dots: false };

  if (style.lines) {
    r.setLineWidth(0.5 * pal.lineScale);
    r.setStrokeStyle(pal.grid);
    for (let x = firstX; x < x1; x += stepPx) r.drawLine(x, y0, x, y1);
    for (let y = firstY; y < y1; y += stepPx) r.drawLine(x0, y, x1, y);
  }

  if (style.dots) {
    // Con líneas y puntos, los puntos marcan el centro de cada celda.
    const shift = style.lines ? stepPx / 2 : 0;
    const pts: { x: number; y: number }[] = [];
    for (let x = firstX - shift; x < x1; x += stepPx) {
      for (let y = firstY - shift; y < y1; y += stepPx) pts.push({ x, y });
    }
    r.setFillStyle(pal.gridDot);
    r.drawPoints(pts, pal.dotRadius);
  }

  r.setStrokeStyle(pal.gridMajor);
  r.setLineWidth(1 * pal.lineScale);
  if (transform.offsetX >= x0 && transform.offsetX <= x1) r.drawLine(transform.offsetX, y0, transform.offsetX, y1);
  if (transform.offsetY >= y0 && transform.offsetY <= y1) r.drawLine(x0, transform.offsetY, x1, transform.offsetY);
}

// ---------------------------------------------------------------------------
// Calco de otros niveles (underlay)
// ---------------------------------------------------------------------------

function drawUnderlay(
  r: ICanvasRenderer,
  objects: readonly RevitObjectBase[],
  pal: CanvasPalette,
  toScreen: ToScreen,
  scale: number,
): void {
  const walls = objects.filter((o): o is Wall => o instanceof Wall && o.isStraight);
  const outlines = buildWallOutlines(
    walls.map((w) => ({ id: w.id as string, start: w.startPoint, end: w.endPoint, thickness: w.thickness as number })),
  );
  r.setFillStyle(pal.underlay);
  for (const o of outlines.values()) r.fillPolygon(o.polygon.map(toScreen));
  for (const o of objects) {
    if (!(o instanceof Column)) continue;
    const shape = columnShape(o, toScreen, scale);
    if (shape.circle) r.fillCircle(shape.circle.c.x, shape.circle.c.y, shape.circle.r);
    else if (shape.poly) r.fillPolygon(shape.poly);
  }
}

// ---------------------------------------------------------------------------
// 2. Recintos cerrados
// ---------------------------------------------------------------------------

function drawRooms({ r, scene, pal, toScreen }: Ctx): void {
  for (const room of scene.rooms ?? []) {
    if (room.polygon.length < 3) continue;
    r.setFillStyle(pal.roomFill);
    r.fillPolygon(room.polygon.map(toScreen));
  }
  const sel = scene.selectedZoneId ? scene.rooms?.find((x) => x.id === scene.selectedZoneId) : undefined;
  if (sel) {
    const outline = (sel.netPolygon?.length ?? 0) >= 3 ? sel.netPolygon! : sel.polygon;
    r.setFillStyle(pal.selectionFill);
    r.fillPolygon(outline.map(toScreen));
    r.setStrokeStyle(pal.selection);
    r.setLineWidth(2 * pal.lineScale);
    r.strokePolygon(outline.map(toScreen));
  }
}

/** Paso de la trama de suelo (px): más abierta que la de mampostería. */
const FLOOR_HATCH_PX = 14;

/** Suelo: trama fina a 45° en las dos direcciones (losa en planta) y borde fino. */
function drawFloors({ r, scene, pal, toScreen }: Ctx): void {
  for (const f of scene.floors ?? []) {
    const poly = f.polygon.map(toScreen);
    r.setStrokeStyle(pal.roomStroke);
    r.setLineWidth(STROKE.thin * 0.8 * pal.lineScale);
    for (const angle of [Math.PI / 4, -Math.PI / 4]) {
      for (const [a, b] of hatchSegments(poly, FLOOR_HATCH_PX * pal.lineScale, angle)) r.drawLine(a.x, a.y, b.x, b.y);
    }
    r.setLineWidth(STROKE.thin * pal.lineScale);
    r.strokePolygon(poly);
  }
}

// ---------------------------------------------------------------------------
// 3. Muros
// ---------------------------------------------------------------------------

/** Intervalos [inicio, fin] (m, a lo largo del eje) que los vanos cortan en un muro. */
function gapsOf(ctx: Ctx, wall: Wall): [number, number][] {
  const len = wall.length as number;
  const gaps = (ctx.vanosByWall.get(wall.id as string) ?? []).map((v): [number, number] => {
    const a = Math.max(0, v.offsetAlongWall as number);
    return [a, Math.min(len, a + (v.width as number))];
  });
  for (const o of ctx.scene.genericOpenings ?? []) {
    if (o.wallId === (wall.id as string)) gaps.push([Math.max(0, o.xOffset), Math.min(len, o.xOffset + o.width)]);
  }
  return gaps;
}

/** Vano genérico: el hueco y el dintel en trazos finos (lo que queda por encima del corte). */
function drawGenericOpenings(ctx: Ctx): void {
  const { r, pal, toScreen } = ctx;
  r.setStrokeStyle(pal.ink);
  r.setLineWidth(STROKE.thin * pal.lineScale);
  for (const o of ctx.scene.genericOpenings ?? []) {
    const wall = ctx.wallsById.get(o.wallId);
    if (!wall) continue;
    const half = (wall.thickness as number) / 2;
    for (const side of [half, -half]) {
      const a = toScreen(wallPoint(wall, o.xOffset, side));
      const b = toScreen(wallPoint(wall, o.xOffset + o.width, side));
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const ux = (b.x - a.x) / len;
      const uy = (b.y - a.y) / len;
      for (let t = 0; t < len; t += 8) {
        const e = Math.min(len, t + 4);
        r.drawLine(a.x + ux * t, a.y + uy * t, a.x + ux * e, a.y + uy * e);
      }
    }
  }
}

/** Punto a distancia `along` del inicio del muro y `side` (m) hacia su izquierda. */
function wallPoint(wall: Wall, along: number, side: number): Point2D {
  const dx = wall.endPoint.x - wall.startPoint.x;
  const dy = wall.endPoint.y - wall.startPoint.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return { x: wall.startPoint.x + ux * along - uy * side, y: wall.startPoint.y + uy * along + ux * side };
}

function drawWalls(ctx: Ctx): void {
  const { r, pal, toScreen } = ctx;
  const cut = STROKE.cut * pal.lineScale;
  const thin = STROKE.thin * pal.lineScale;

  for (const wall of ctx.walls) {
    const outline = ctx.outlines.get(wall.id as string);
    const half = (wall.thickness as number) / 2;

    if (!outline) {
      // Muro curvo o degenerado: eje con su espesor.
      const a = toScreen(wall.startPoint);
      const b = toScreen(wall.endPoint);
      r.setStrokeStyle(pal.ink);
      r.setLineWidth(Math.max(2, (wall.thickness as number) * ctx.scale));
      r.drawLine(a.x, a.y, b.x, b.y);
      continue;
    }

    const poly = outline.polygon.map(toScreen);
    const existing = !!ctx.scene.existingIds?.has(wall.id as string);
    const kind = existing ? 'outline' : wallRendering(wall.material, wall.isStructural);

    // Poché: sólido, o fondo + trama; lo existente, medio tono sin trama.
    r.setFillStyle(existing ? pal.existingFill : kind === 'solid' ? pal.wallFill : pal.background);
    r.fillPolygon(poly);
    if (kind === 'hatch') {
      r.setStrokeStyle(pal.partition);
      r.setLineWidth(thin);
      for (const [a, b] of hatchSegments(poly, HATCH_PX * pal.lineScale)) r.drawLine(a.x, a.y, b.x, b.y);
    }

    const gaps = gapsOf(ctx, wall);
    // Hueco de cada vano: se "borra" el poché dentro del espesor.
    for (const [g0, g1] of gaps) {
      const e = half * 1.02;
      r.setFillStyle(pal.background);
      r.fillPolygon(
        [wallPoint(wall, g0, e), wallPoint(wall, g1, e), wallPoint(wall, g1, -e), wallPoint(wall, g0, -e)].map(toScreen),
      );
    }

    // Caras cortadas: trazo grueso (medio tono si es existente).
    r.setStrokeStyle(existing ? pal.existingInk : pal.ink);
    r.setLineWidth(existing ? STROKE.medium * pal.lineScale : cut);
    const [sL, eL, eR, sR] = outline.polygon;
    for (const [a, b] of [
      ...faceSegments(wall.startPoint, wall.endPoint, sL, eL, gaps),
      ...faceSegments(wall.startPoint, wall.endPoint, sR, eR, gaps),
    ]) {
      const pa = toScreen(a);
      const pb = toScreen(b);
      r.drawLine(pa.x, pa.y, pb.x, pb.y);
    }
    // Jambas: el muro se ve cortado, no interrumpido.
    for (const [g0, g1] of gaps) {
      for (const g of [g0, g1]) {
        const a = toScreen(wallPoint(wall, g, half));
        const b = toScreen(wallPoint(wall, g, -half));
        r.drawLine(a.x, a.y, b.x, b.y);
      }
    }
    if (outline.startFree) r.drawLine(poly[0].x, poly[0].y, poly[3].x, poly[3].y);
    if (outline.endFree) r.drawLine(poly[1].x, poly[1].y, poly[2].x, poly[2].y);

    if (ctx.scene.measureTargetId && (wall.id as string) === ctx.scene.measureTargetId) {
      const a = toScreen(wall.startPoint);
      const b = toScreen(wall.endPoint);
      r.setStrokeStyle(pal.snapNode);
      r.setLineWidth(3 * pal.lineScale);
      r.drawLine(a.x, a.y, b.x, b.y);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Columnas
// ---------------------------------------------------------------------------

function columnShape(col: Column, toScreen: ToScreen, scale: number): { circle?: { c: Point2D; r: number }; poly?: Point2D[] } {
  if (col.isCircular) {
    return { circle: { c: toScreen(col.position), r: Math.max(2, ((col.dimensionX as number) / 2) * scale) } };
  }
  const footprint = col.footprint();
  return footprint ? { poly: footprint.map(toScreen) } : {};
}

function drawColumns({ r, scene, pal, toScreen, scale }: Ctx): void {
  for (const obj of scene.objects) {
    if (!(obj instanceof Column)) continue;
    const shape = columnShape(obj, toScreen, scale);
    const existing = !!scene.existingIds?.has(obj.id as string);
    r.setFillStyle(existing ? pal.existingFill : pal.columnFill);
    r.setStrokeStyle(existing ? pal.existingInk : pal.ink);
    r.setLineWidth((existing ? STROKE.medium : STROKE.cut) * pal.lineScale);
    if (shape.circle) {
      r.fillCircle(shape.circle.c.x, shape.circle.c.y, shape.circle.r);
      r.strokeCircle(shape.circle.c.x, shape.circle.c.y, shape.circle.r);
    } else if (shape.poly) {
      r.fillPolygon(shape.poly);
      r.strokePolygon(shape.poly);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Vanos: símbolos de plano
// ---------------------------------------------------------------------------

/** Segmentos de un arco de 90° para que se vea curvo a cualquier zoom. */
const ARC_STEPS = 16;

function drawVanos(ctx: Ctx): void {
  const { r, pal, toScreen, line } = ctx;
  for (const [wallId, vanos] of ctx.vanosByWall) {
    const wall = ctx.wallsById.get(wallId);
    if (!wall) continue; // vano huérfano: no se dibuja donde no hay muro
    const half = (wall.thickness as number) / 2;
    const len = wall.length as number;

    for (const v of vanos) {
      const a = Math.max(0, v.offsetAlongWall as number);
      const b = Math.min(len, a + (v.width as number));
      const w = b - a;
      if (w <= 0) continue;

      const medium = STROKE.medium * pal.lineScale;
      if (v instanceof Door) {
        // Hoja abierta a 90° con su espesor (≈4 cm, mínimo legible), con la
        // bisagra en el inicio del vano sobre la cara izquierda; arco fino
        // hasta la jamba opuesta.
        const leafT = Math.max(0.04, 2 / ctx.scale);
        const leaf = [
          wallPoint(wall, a, half),
          wallPoint(wall, a, half + w),
          wallPoint(wall, a + leafT, half + w),
          wallPoint(wall, a + leafT, half),
        ].map(toScreen);
        r.setFillStyle(pal.background);
        r.fillPolygon(leaf);
        r.setStrokeStyle(pal.ink);
        r.setLineWidth(medium);
        r.strokePolygon(leaf);

        const arc: Point2D[] = [];
        for (let i = 0; i <= ARC_STEPS; i++) {
          const t = (i / ARC_STEPS) * (Math.PI / 2);
          arc.push(toScreen(wallPoint(wall, a + w * Math.sin(t), half + w * Math.cos(t))));
        }
        r.setStrokeStyle(pal.opening);
        r.setLineWidth(line);
        r.strokePolyline(arc);
      } else {
        // Ventana: las caras del muro siguen de jamba a jamba (antepecho) y
        // el vidrio, doble y fino, en el eje.
        r.setStrokeStyle(pal.ink);
        r.setLineWidth(medium);
        for (const side of [half, -half]) {
          const p0 = toScreen(wallPoint(wall, a, side));
          const p1 = toScreen(wallPoint(wall, b, side));
          r.drawLine(p0.x, p0.y, p1.x, p1.y);
        }
        r.setStrokeStyle(pal.opening);
        r.setLineWidth(line);
        const g = Math.max(half * 0.18, 1.2 / ctx.scale);
        for (const side of [g, -g]) {
          const p0 = toScreen(wallPoint(wall, a, side));
          const p1 = toScreen(wallPoint(wall, b, side));
          r.drawLine(p0.x, p0.y, p1.x, p1.y);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Nudos (puntos de enganche mientras se trazan muros)
// ---------------------------------------------------------------------------

function drawNodes({ r, pal, toScreen, walls }: Ctx): void {
  r.setFillStyle(pal.preview);
  for (const w of walls) {
    for (const p of [w.startPoint, w.endPoint]) {
      const s = toScreen(p);
      r.fillCircle(s.x, s.y, 3.5);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Muro en curso
// ---------------------------------------------------------------------------

function drawWallDraft(ctx: Ctx): void {
  const { r, scene, pal, toScreen } = ctx;
  const d = scene.wallDraft;
  if (!d) return;

  const start = d.start ? toScreen(d.start) : null;
  const end = d.end ? toScreen(d.end) : null;

  if (d.start && d.end) {
    const thickness = scene.draftThickness ?? 0.15;
    const outline = buildWallOutlines([{ id: 'draft', start: d.start, end: d.end, thickness }]).get('draft');
    if (outline) {
      const poly = outline.polygon.map(toScreen);
      r.setFillStyle(pal.selectionFill);
      r.fillPolygon(poly);
      r.setStrokeStyle(pal.preview);
      r.setLineWidth(1.5 * pal.lineScale);
      r.strokePolygon(poly);
    }
    // Cota y ángulo en vivo: longitud y dirección (0° = +X, antihorario con
    // la Y arriba, como los ejes) mientras se traza.
    const length = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
    if (start && end) {
      const deg = ((Math.atan2(-(d.end.y - d.start.y), d.end.x - d.start.x) * 180) / Math.PI + 360) % 360;
      r.setFillStyle(pal.preview);
      r.drawText(`${length.toFixed(2)} m · ${deg.toFixed(0)}°`, (start.x + end.x) / 2, (start.y + end.y) / 2 - 14, 13, 'center');
    }
  }

  r.setFillStyle(pal.preview);
  if (start) r.fillCircle(start.x, start.y, 5);
  if (end) {
    r.fillCircle(end.x, end.y, 4);
    if (d.snappedToNode) drawSnapIndicator(r, end, pal);
  }
}

// ---------------------------------------------------------------------------
// 7a. Marcadores de fotos (SPDS)
// ---------------------------------------------------------------------------

/** Radio del marcador en pantalla. Fijo: un marcador no tiene tamaño en metros. */
const PHOTO_MARKER_RADIUS_PX = 9;

function drawPhotoMarkers({ r, scene, pal, toScreen }: Ctx): void {
  for (const marker of scene.photoMarkers ?? []) {
    const p = toScreen(marker.position);
    const selected = marker.id === scene.selectedPhotoMarkerId;

    // Cono de visión: dice qué se estaba mirando, no solo dónde se estaba.
    if (marker.direction !== undefined) {
      const rad = (marker.direction * Math.PI) / 180;
      const spread = Math.PI / 6;
      const reach = PHOTO_MARKER_RADIUS_PX * 3.5;
      r.setFillStyle(pal.selectionFill);
      r.fillPolygon([
        p,
        { x: p.x + Math.cos(rad - spread) * reach, y: p.y + Math.sin(rad - spread) * reach },
        { x: p.x + Math.cos(rad + spread) * reach, y: p.y + Math.sin(rad + spread) * reach },
      ]);
    }

    r.setFillStyle(selected ? pal.selection : pal.photoMarker);
    r.fillCircle(p.x, p.y, PHOTO_MARKER_RADIUS_PX);
    r.setStrokeStyle(pal.handleFill);
    r.setLineWidth(2);
    r.strokeCircle(p.x, p.y, PHOTO_MARKER_RADIUS_PX);

    if (scene.showLabels && marker.label) {
      r.setFillStyle(pal.label);
      r.drawText(marker.label, p.x, p.y - PHOTO_MARKER_RADIUS_PX - 4, 10, 'center');
    }
  }
}

// ---------------------------------------------------------------------------
// 7a. Mojones y rótulos de coordenadas (Topografía)
// ---------------------------------------------------------------------------

/**
 * Mojón: triángulo (símbolo topográfico de punto de control) con un punto en
 * el vértice exacto. Relleno si es punto de control (tiene coordenadas reales
 * y posición); solo contorno si le falta una de las dos.
 */
function drawBenchmarks({ r, scene, pal, toScreen }: Ctx): void {
  const size = 11;
  for (const b of scene.benchmarks ?? []) {
    const p = toScreen(b.position);
    const selected = b.id === scene.selectedBenchmarkId;
    const tri = [
      { x: p.x, y: p.y - size * 1.25 },
      { x: p.x + size, y: p.y + size * 0.6 },
      { x: p.x - size, y: p.y + size * 0.6 },
    ];
    if (selected) {
      r.setFillStyle(pal.selectionFill);
      r.fillCircle(p.x, p.y, size * 2);
    }
    r.setFillStyle(b.control ? BENCHMARK_COLOR : pal.background);
    r.fillPolygon(tri);
    r.setStrokeStyle(selected ? pal.selection : BENCHMARK_COLOR);
    r.setLineWidth(2);
    r.strokePolygon(tri);
    r.setFillStyle(b.control ? pal.handleFill : BENCHMARK_COLOR);
    r.fillCircle(p.x, p.y, 2.5);
    r.setFillStyle(BENCHMARK_COLOR);
    r.drawText(b.name, p.x + size + 3, p.y - size * 0.4, 11, 'left');
  }
}

/** Rótulos E/N junto a cada punto; fondo del lienzo detrás para leerlos sobre muros. */
/** Cuadrícula de coordenadas: líneas finas verdes (topografía) con su valor en un extremo. */
function drawCoordGrid({ r, scene, toScreen, pal }: Ctx): void {
  r.setStrokeStyle('rgba(46, 125, 50, 0.45)');
  r.setLineWidth(0.8 * pal.lineScale);
  r.setFillStyle(BENCHMARK_COLOR);
  for (const l of scene.coordGrid ?? []) {
    const a = toScreen(l.from);
    const b = toScreen(l.to);
    r.drawLine(a.x, a.y, b.x, b.y);
    r.drawText(l.label, a.x + 4, a.y - 4, 9, 'left');
  }
}

const MEASURE_COLOR = '#2E7D32';

/** Inverso / Área / Replanteo: la geometría que el operador va tocando. */
function drawMeasure({ r, scene, toScreen, pal }: Ctx): void {
  const m = scene.measure;
  if (!m) return;
  const pts = m.points.map(toScreen);
  if (m.closed && pts.length >= 3) {
    r.setFillStyle('rgba(46, 125, 50, 0.14)');
    r.fillPolygon(pts);
  }
  r.setStrokeStyle(MEASURE_COLOR);
  r.setLineWidth(2 * pal.lineScale);
  if (pts.length >= 2) {
    if (m.closed) r.strokePolygon(pts);
    else r.strokePolyline(pts);
  }
  r.setFillStyle(MEASURE_COLOR);
  pts.forEach((p, i) => {
    r.fillCircle(p.x, p.y, 4);
    if (!m.closed || pts.length <= 12) r.drawText(String.fromCharCode(65 + (i % 26)), p.x + 6, p.y - 6, 11, 'left');
  });
  if (m.label && pts.length >= 2) {
    const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    r.drawText(m.label, mid.x, mid.y - 8, 11, 'center');
  }
  if (m.target) {
    const t = toScreen(m.target);
    r.setStrokeStyle(MEASURE_COLOR);
    r.setLineWidth(2 * pal.lineScale);
    r.strokeCircle(t.x, t.y, 12);
    r.drawLine(t.x - 18, t.y, t.x + 18, t.y);
    r.drawLine(t.x, t.y - 18, t.x, t.y + 18);
  }
}

function drawCoordLabels({ r, scene, pal, toScreen }: Ctx): void {
  for (const l of scene.coordLabels ?? []) {
    const p = toScreen(l.position);
    r.setFillStyle(BENCHMARK_COLOR);
    r.fillCircle(p.x, p.y, 2.5);
    const w = Math.max(...l.lines.map((t) => t.length)) * 6.6 + 8;
    r.setFillStyle(pal.background);
    r.fillRect(p.x + 5, p.y + 3, w, l.lines.length * 12 + 3);
    r.setFillStyle(pal.label);
    l.lines.forEach((t, i) => r.drawText(t, p.x + 8, p.y + 14 + i * 12, 9, 'left'));
  }
}

// ---------------------------------------------------------------------------
// 7b. Selección y handles
// ---------------------------------------------------------------------------

function drawSelection(ctx: Ctx): void {
  const { r, scene, pal, toScreen, scale } = ctx;
  if (!scene.selectedId) return;
  const selected = scene.objects.find((o) => o.id === scene.selectedId);
  if (!selected) return;

  const stroke = 2 * pal.lineScale;
  r.setStrokeStyle(pal.selection);
  r.setLineWidth(stroke);

  if (selected instanceof Wall) {
    const outline = ctx.outlines.get(selected.id as string);
    if (outline) {
      const poly = outline.polygon.map(toScreen);
      r.setFillStyle(pal.selectionFill);
      r.fillPolygon(poly);
      r.strokePolygon(poly);
    } else {
      const a = toScreen(selected.startPoint);
      const b = toScreen(selected.endPoint);
      r.setLineWidth(Math.max(4, (selected.thickness as number) * scale + 4));
      r.drawLine(a.x, a.y, b.x, b.y);
    }
  } else if (selected instanceof Column) {
    const shape = columnShape(selected, toScreen, scale);
    if (shape.circle) r.strokeCircle(shape.circle.c.x, shape.circle.c.y, shape.circle.r + 3);
    else if (shape.poly) r.strokePolygon(shape.poly);
  } else if (selected instanceof Room && selected.geometry.length >= 3) {
    r.strokePolygon(selected.geometry.map(toScreen));
  } else if (selected instanceof Door || selected instanceof Window) {
    const wall = ctx.wallsById.get(selected.parentWallId as string);
    if (wall) {
      const a = Math.max(0, selected.offsetAlongWall as number);
      const b = a + (selected.width as number);
      const e = (wall.thickness as number) * 0.75;
      const box = [wallPoint(wall, a, e), wallPoint(wall, b, e), wallPoint(wall, b, -e), wallPoint(wall, a, -e)];
      r.setFillStyle(pal.selectionFill);
      r.fillPolygon(box.map(toScreen));
      r.strokePolygon(box.map(toScreen));
    }
  }

  // Handles: círculo con borde, visibles sobre cualquier fondo.
  for (const handle of scene.handles) {
    const p = toScreen(handle.position);
    r.setFillStyle(pal.handleFill);
    r.fillCircle(p.x, p.y, sizes.handleRadius);
    r.setStrokeStyle(pal.selection);
    r.setLineWidth(stroke);
    r.strokeCircle(p.x, p.y, sizes.handleRadius);
  }
}

// ---------------------------------------------------------------------------
// Anillo de snap
// ---------------------------------------------------------------------------

function drawSnapIndicator(r: ICanvasRenderer, p: Point2D, pal: CanvasPalette): void {
  r.setStrokeStyle(pal.snapNode);
  r.setLineWidth(2 * pal.lineScale);
  r.strokeCircle(p.x, p.y, 14);
  r.setFillStyle(pal.snapNode);
  r.fillCircle(p.x, p.y, 3);
}

// ---------------------------------------------------------------------------
// 8. Etiquetas
// ---------------------------------------------------------------------------

function drawLabels(ctx: Ctx): void {
  const { r, scene, pal, toScreen } = ctx;
  const thin = STROKE.thin * pal.lineScale;
  const TICK = 4;

  for (const wall of ctx.walls) {
    // Por debajo de 40 px de muro en pantalla la cota se solaparía con la vecina.
    const a = toScreen(wall.startPoint);
    const b = toScreen(wall.endPoint);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 40) continue;
    // Línea de cota a 12 px de la cara, del lado de AFUERA del recinto (si
    // la izquierda cae dentro de un recinto, va a la derecha): las cotas no
    // cruzan los espacios.
    const off = (wall.thickness as number) / 2 + 12 / ctx.scale;
    const probe = wallPoint(wall, (wall.length as number) / 2, off);
    const inside = (scene.rooms ?? []).some((room) => room.polygon.length >= 3 && isPointInPolygon(probe, room.polygon));
    const side = inside ? -off : off;
    const textSide = inside ? -(off + 7 / ctx.scale) : off + 7 / ctx.scale;
    const p0 = toScreen(wallPoint(wall, 0, side));
    const p1 = toScreen(wallPoint(wall, wall.length as number, side));
    const ux = (p1.x - p0.x) / len;
    const uy = (p1.y - p0.y) / len;
    r.setStrokeStyle(pal.label);
    r.setLineWidth(thin);
    r.drawLine(p0.x, p0.y, p1.x, p1.y);
    // Trazos a 45° en los extremos (cota arquitectónica).
    const tx = (ux - uy) * TICK * Math.SQRT1_2;
    const ty = (uy + ux) * TICK * Math.SQRT1_2;
    for (const p of [p0, p1]) r.drawLine(p.x - tx, p.y - ty, p.x + tx, p.y + ty);
    // El valor sobre la línea, del lado de afuera.
    const m = toScreen(wallPoint(wall, (wall.length as number) / 2, textSide));
    r.setFillStyle(pal.label);
    r.drawText(Number(wall.length).toFixed(2), m.x, m.y + 4, 10, 'center');
  }

  r.setFillStyle(pal.label);
  const rooms = scene.rooms ?? [];
  rooms.forEach((room, i) => {
    const c = toScreen(room.centroid);
    const name = room.name ?? (i === 0 && scene.roomName ? scene.roomName : `Recinto ${i + 1}`);
    r.drawText(name, c.x, c.y - 4, 12, 'center');
    // Área NETA (a cara interior): la que se pisa y la que usa Revit.
    r.drawText(`${(room.netArea ?? room.area).toFixed(2)} m²`, c.x, c.y + 12, 11, 'center');
  });
}
