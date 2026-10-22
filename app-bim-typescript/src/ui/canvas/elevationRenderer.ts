// =============================================================================
// elevationRenderer.ts — Dibujo del alzado de un muro (vista frontal)
// Portado de LevON (wall_elevation_painter.dart) y del mockup
// (polylive-mockup/js/components/canvas-alzado.js)
// =============================================================================
//
// Función pura sobre `ICanvasRenderer`, igual que planRenderer: se puede
// verificar sin React que el perfil se dibuja inclinado, que un hueco en error
// se marca en rojo o que el lado B es el espejo del A.
//
// CAPAS (de atrás hacia delante):
//   1. rejilla de alturas
//   2. líneas de nivel del proyecto (a todo el ancho)
//   3. silueta del muro (su perfil real: rectángulo o trapecio)
//   4. huecos, coloreados según su validación
//   5. umbral y dintel
//   6. cotas del muro y de los huecos
//   7. rótulos de nivel, FIJOS a la izquierda de la pantalla (no escalan)
// =============================================================================

import type { ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';
import { WallElevation, WallOpening, WallOpeningId, baseAt, effectiveLeftHeight, effectiveRightHeight, hasHeightProfile, openingEnd, openingTop, openingCenterX, openingCenterY, umbral, dintel, openingTypeLabel } from '../../domain/objects/wall-elevation';
import type { ElevationSeverity, ElevationViewport } from '../../application/elevation/WallElevationService';
import { CANVAS_PALETTES, CanvasPalette } from '../design/canvasThemes';
import { drawSketch, SketchShape } from './sketch';
import { withAlpha } from '../design/tokens';

export interface ElevationScene {
  readonly elevation: WallElevation;
  readonly wallLength: number;
  readonly viewport: ElevationViewport;
  readonly width: number;
  readonly height: number;
  /** Lado B: se ve el muro desde la otra cara (X en espejo). */
  readonly mirrored?: boolean;
  readonly selectedOpeningId: WallOpeningId | null;
  /** Hueco arrastrado, en su posición en vivo: reemplaza al guardado. */
  readonly dragPreview?: WallOpening | null;
  readonly severityByOpening: ReadonlyMap<string, ElevationSeverity>;
  readonly showGrid: boolean;
  readonly showLabels: boolean;
  /** Niveles del proyecto, en altura CSL (0 = base más baja del muro) y su cota. */
  readonly levelLines?: readonly { readonly name: string; readonly y: number; readonly cota: number }[];
  readonly palette?: CanvasPalette;
  /** Filtros de la vista: qué tipos de hueco se ven (todos si falta). */
  readonly visibleTypes?: ReadonlySet<string>;
  /** Avance (M3): celdas pintadas de esta cara, en (u, v) del muro. */
  readonly progressLayers?: readonly {
    readonly color: string;
    readonly opacity: number;
    readonly runs: readonly { x: number; y: number; w: number; h: number }[];
  }[];
  /** Marcas de revisión (M4) de esta cara, en (u, v). */
  readonly markups?: readonly SketchShape[];
  /** Dibujo técnico (F6b) de esta cara: cotas, textos, vigas… */
  readonly annotations?: readonly SketchShape[];
  /** Trazo en curso (pincel o marca), en (u, v). Mejor por `liveSketch` del lienzo: no regraba el muro. */
  readonly sketch?: readonly SketchShape[];
}

type ToScreen = (p: { x: number; y: number }) => { x: number; y: number };

interface Ctx {
  readonly r: ICanvasRenderer;
  readonly scene: ElevationScene;
  readonly pal: CanvasPalette;
  readonly toScreen: ToScreen;
  readonly openings: readonly WallOpening[];
}

const ERROR = '#E53935';
const WARNING = '#FB8C00';

/** (u, v) de la cara → pantalla, con el espejo del lado B. */
export function elevationToScreen(scene: Pick<ElevationScene, 'viewport' | 'wallLength' | 'mirrored'>): ToScreen {
  const { viewport, wallLength, mirrored } = scene;
  return (p) => ({
    x: (mirrored ? wallLength - p.x : p.x) * viewport.scale + viewport.offsetX,
    y: viewport.offsetY - p.y * viewport.scale,
  });
}

export function drawElevation(r: ICanvasRenderer, scene: ElevationScene): void {
  const pal = scene.palette ?? CANVAS_PALETTES.claro;
  const { viewport } = scene;
  const toScreen = elevationToScreen(scene);
  const preview = scene.dragPreview;
  const openings = scene.elevation.openings
    .map((o) => (preview && o.id === preview.id ? preview : o))
    .filter((o) => !scene.visibleTypes || scene.visibleTypes.has(o.type));
  const ctx: Ctx = { r, scene, pal, toScreen, openings };

  if (scene.showGrid) drawHeightGrid(ctx);
  drawLevelLines(ctx);
  drawWallSilhouette(ctx);
  if (scene.progressLayers?.length) drawFaceProgress(ctx);
  for (const o of openings) drawOpening(ctx, o);
  drawReferenceLines(ctx);
  if (scene.showLabels) drawElevationLabels(ctx);
  drawLevelLabels(ctx);
  if (scene.annotations?.length) drawSketch(r, scene.annotations, toScreen, viewport.scale);
  if (scene.markups?.length) drawSketch(r, scene.markups, toScreen, viewport.scale);
  if (scene.sketch?.length) drawSketch(r, scene.sketch, toScreen, viewport.scale);
}

/** Avance sobre la cara: cada corrida de celdas como un rectángulo (respeta el espejo del lado B). */
function drawFaceProgress({ r, scene, toScreen }: Ctx): void {
  for (const layer of scene.progressLayers ?? []) {
    r.setFillStyle(withAlpha(layer.color, 0.55 * layer.opacity));
    for (const run of layer.runs) {
      r.fillPolygon(
        [
          { x: run.x, y: run.y },
          { x: run.x + run.w, y: run.y },
          { x: run.x + run.w, y: run.y + run.h },
          { x: run.x, y: run.y + run.h },
        ].map(toScreen),
      );
    }
  }
}

/** Contorno del muro en CSL: su perfil (base y tope de cada extremo). */
function wallOutline(elevation: WallElevation, wallLength: number): { x: number; y: number }[] {
  const lv = elevation.levels;
  return hasHeightProfile(lv)
    ? [
        { x: 0, y: lv.leftBase ?? 0 },
        { x: wallLength, y: lv.rightBase ?? 0 },
        { x: wallLength, y: effectiveRightHeight(lv) },
        { x: 0, y: effectiveLeftHeight(lv) },
      ]
    : [
        { x: 0, y: 0 },
        { x: wallLength, y: 0 },
        { x: wallLength, y: lv.coronacion },
        { x: 0, y: lv.coronacion },
      ];
}

// ---------------------------------------------------------------------------
// 1. Rejilla de alturas: una línea cada 0,5 m, del ancho del muro
// ---------------------------------------------------------------------------

function drawHeightGrid({ r, scene, pal, toScreen }: Ctx): void {
  const { elevation, wallLength } = scene;
  const top = Math.max(elevation.levels.coronacion, effectiveLeftHeight(elevation.levels), effectiveRightHeight(elevation.levels));
  r.setStrokeStyle(pal.grid);
  r.setLineWidth(0.5 * pal.lineScale);
  for (let h = 0; h <= top + 1e-6; h += 0.5) {
    const a = toScreen({ x: 0, y: h });
    const b = toScreen({ x: wallLength, y: h });
    r.drawLine(a.x, a.y, b.x, b.y);
  }
}

// ---------------------------------------------------------------------------
// 2. Líneas de nivel (a todo el ancho de la vista, de trazos)
// ---------------------------------------------------------------------------

function drawLevelLines({ r, scene, pal, toScreen }: Ctx): void {
  r.setStrokeStyle(pal.label);
  r.setLineWidth(1 * pal.lineScale);
  for (const line of scene.levelLines ?? []) {
    const y = toScreen({ x: 0, y: line.y }).y;
    if (y < -2 || y > scene.height + 2) continue;
    const dash = 7;
    // Más allá de los bordes: al panear no deben verse los extremos de la línea.
    for (let x = -scene.width; x < scene.width * 2; x += dash * 2) r.drawLine(x, y, x + dash, y);
  }
}

// ---------------------------------------------------------------------------
// 3. Silueta del muro (relleno claro + contorno)
// ---------------------------------------------------------------------------

function drawWallSilhouette({ r, scene, pal, toScreen }: Ctx): void {
  const pts = wallOutline(scene.elevation, scene.wallLength).map(toScreen);
  r.setFillStyle(pal.existingFill);
  r.fillPolygon(pts);
  r.setStrokeStyle(pal.ink);
  r.setLineWidth(2.5 * pal.lineScale);
  r.strokePolygon(pts);
}

// ---------------------------------------------------------------------------
// 4. Huecos
// ---------------------------------------------------------------------------

function drawOpening({ r, scene, pal, toScreen }: Ctx, opening: WallOpening): void {
  const severity = scene.severityByOpening.get(opening.id as string) ?? 'ok';
  const selected = opening.id === scene.selectedOpeningId;
  const rect = [
    { x: opening.xOffset, y: opening.sillHeight },
    { x: openingEnd(opening), y: opening.sillHeight },
    { x: openingEnd(opening), y: openingTop(opening) },
    { x: opening.xOffset, y: openingTop(opening) },
  ].map(toScreen);

  // El hueco se "vacía": es una ausencia de muro.
  r.setFillStyle(pal.background);
  r.fillPolygon(rect);
  if (selected) {
    r.setFillStyle(pal.selectionFill);
    r.fillPolygon(rect);
  }

  // El borde codifica la validación: rojo bloquea la exportación, naranja avisa.
  const stroke = severity === 'error' ? ERROR : severity === 'warning' ? WARNING : pal.opening;
  r.setStrokeStyle(selected ? pal.selection : stroke);
  r.setLineWidth((selected ? 2.5 : 1.8) * pal.lineScale);
  r.strokePolygon(rect);

  // Símbolo por tipo. Puerta: la hoja como triángulo con el vértice en las
  // bisagras (convención de alzado). Ventana: marco interior y parteluz.
  r.setStrokeStyle(stroke);
  r.setLineWidth(1.2 * pal.lineScale);
  if (opening.type === 'door') {
    const hingeX = opening.isFlipped ? openingEnd(opening) : opening.xOffset;
    const freeX = opening.isFlipped ? opening.xOffset : openingEnd(opening);
    const a = toScreen({ x: freeX, y: opening.sillHeight });
    const b = toScreen({ x: hingeX, y: openingCenterY(opening) });
    const c = toScreen({ x: freeX, y: openingTop(opening) });
    r.drawLine(a.x, a.y, b.x, b.y);
    r.drawLine(b.x, b.y, c.x, c.y);
  } else if (opening.type === 'window') {
    const inset = Math.min(0.05, opening.width / 6, opening.height / 6);
    const inner = [
      { x: opening.xOffset + inset, y: opening.sillHeight + inset },
      { x: openingEnd(opening) - inset, y: opening.sillHeight + inset },
      { x: openingEnd(opening) - inset, y: openingTop(opening) - inset },
      { x: opening.xOffset + inset, y: openingTop(opening) - inset },
    ].map(toScreen);
    r.strokePolygon(inner);
    const m0 = toScreen({ x: openingCenterX(opening), y: opening.sillHeight + inset });
    const m1 = toScreen({ x: openingCenterX(opening), y: openingTop(opening) - inset });
    r.drawLine(m0.x, m0.y, m1.x, m1.y);
  } else {
    const a = toScreen({ x: opening.xOffset, y: opening.sillHeight });
    const c = toScreen({ x: openingEnd(opening), y: openingTop(opening) });
    r.drawLine(a.x, a.y, c.x, c.y);
  }

  if (selected) {
    for (const x of [opening.xOffset, openingEnd(opening)]) {
      const p = toScreen({ x, y: openingCenterY(opening) });
      r.setFillStyle(pal.handleFill);
      r.fillCircle(p.x, p.y, 7);
      r.setStrokeStyle(pal.selection);
      r.setLineWidth(2);
      r.strokeCircle(p.x, p.y, 7);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Umbral y dintel
// ---------------------------------------------------------------------------

function drawReferenceLines({ r, scene, pal, toScreen, openings }: Ctx): void {
  const lines: number[] = [];
  // Umbral y dintel de los huecos VISIBLES: con un tipo filtrado, sus líneas quedaban.
  const visible = { ...scene.elevation, openings };
  const u = umbral(visible);
  const d = dintel(visible);
  if (u != null && u > 0) lines.push(u);
  if (d != null) lines.push(d);
  r.setStrokeStyle(pal.opening);
  r.setLineWidth(0.8);
  for (const y of lines) {
    const a = toScreen({ x: 0, y });
    const b = toScreen({ x: scene.wallLength, y });
    const [x0, x1] = a.x < b.x ? [a.x, b.x] : [b.x, a.x];
    for (let x = x0; x < x1; x += 8) r.drawLine(x, a.y, Math.min(x + 4, x1), a.y);
  }
}

// ---------------------------------------------------------------------------
// 6. Cotas
// ---------------------------------------------------------------------------

function drawElevationLabels({ r, scene, pal, toScreen, openings }: Ctx): void {
  const { elevation, wallLength, viewport } = scene;
  const lv = elevation.levels;
  r.setFillStyle(pal.label);

  const base = toScreen({ x: wallLength / 2, y: Math.min(lv.leftBase ?? 0, lv.rightBase ?? 0) });
  r.drawText(`${wallLength.toFixed(2)} m`, base.x, base.y + 20, 12, 'center');

  // Alturas netas de los extremos (dos si el perfil no es rectangular), cada
  // una del lado de la pantalla donde queda su extremo (el B va en espejo).
  const startTop = toScreen({ x: 0, y: effectiveLeftHeight(lv) });
  const endTop = toScreen({ x: wallLength, y: effectiveRightHeight(lv) });
  if (hasHeightProfile(lv)) {
    const sh = effectiveLeftHeight(lv) - baseAt(lv, 0, wallLength);
    const eh = effectiveRightHeight(lv) - baseAt(lv, wallLength, wallLength);
    const [lp, lh, rp, rh] = startTop.x <= endTop.x ? [startTop, sh, endTop, eh] : [endTop, eh, startTop, sh];
    r.drawText(`${lh.toFixed(2)} m`, lp.x, lp.y - 8, 11, 'left');
    r.drawText(`${rh.toFixed(2)} m`, rp.x, rp.y - 8, 11, 'right');
  } else {
    const top = toScreen({ x: wallLength / 2, y: lv.coronacion });
    r.drawText(`${lv.coronacion.toFixed(2)} m`, top.x, top.y - 8, 11, 'center');
  }

  for (const o of openings) {
    if (o.width * viewport.scale < 52) continue;
    const c = toScreen({ x: openingCenterX(o), y: openingCenterY(o) });
    r.setFillStyle(pal.label);
    r.drawText(openingTypeLabel(o.type), c.x, c.y - 4, 11, 'center');
    r.drawText(`${o.width.toFixed(2)} × ${o.height.toFixed(2)}`, c.x, c.y + 12, 10, 'center');
  }
}

// ---------------------------------------------------------------------------
// 7. Rótulos de nivel: fijos a la izquierda (como en el mockup), nombre y cota
// ---------------------------------------------------------------------------

function drawLevelLabels({ r, scene, pal, toScreen }: Ctx): void {
  for (const line of scene.levelLines ?? []) {
    const y = toScreen({ x: 0, y: line.y }).y;
    if (y < 28 || y > scene.height - 4) continue;
    r.setFillStyle(pal.background);
    r.fillRect(10, y - 27, 60, 24);
    r.setFillStyle(pal.label);
    r.drawText(line.name, 14, y - 15, 11, 'left');
    r.drawText(`${line.cota >= 0 ? '+' : ''}${line.cota.toFixed(2)} m`, 14, y - 5, 9, 'left');
  }
}
