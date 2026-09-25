// =============================================================================
// elevationRenderer.ts — Dibujo de la elevación de un muro
// Portado de LevON: features/walls/ui/wall_elevation_painter.dart
// =============================================================================
//
// Función pura sobre `ICanvasRenderer`, igual que planRenderer: así se puede
// verificar que una culata se dibuja inclinada, que un hueco en error se marca
// en rojo y que las cotas aparecen, sin montar un árbol de React.
//
// CAPAS (de atrás hacia delante):
//   1. suelo y rejilla de alturas
//   2. silueta del muro (rectángulo, o trapecio si hay culata)
//   3. huecos, coloreados según su validación
//   4. líneas de umbral y dintel
//   5. cotas y etiquetas
// =============================================================================

import type { ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';
import {
  WallElevation,
  WallOpening,
  WallOpeningId,
  effectiveLeftHeight,
  effectiveRightHeight,
  hasHeightProfile,
  openingEnd,
  openingTop,
  openingCenterX,
  openingCenterY,
  umbral,
  dintel,
  openingTypeLabel,
} from '../../domain/objects/wall-elevation';
import {
  ElevationViewport,
  cslToScreen,
  ElevationSeverity,
} from '../../application/elevation/WallElevationService';
import { colors, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Escena
// ---------------------------------------------------------------------------

export interface ElevationScene {
  readonly elevation: WallElevation;
  readonly wallLength: number;
  readonly viewport: ElevationViewport;
  readonly width: number;
  readonly height: number;
  readonly selectedOpeningId: WallOpeningId | null;
  /** Severidad por hueco, del servicio de validación. */
  readonly severityByOpening: ReadonlyMap<string, ElevationSeverity>;
  readonly showGrid: boolean;
  readonly showLabels: boolean;
}

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export function drawElevation(r: ICanvasRenderer, scene: ElevationScene): void {
  if (scene.showGrid) drawHeightGrid(r, scene);
  drawWallSilhouette(r, scene);
  drawOpenings(r, scene);
  drawReferenceLines(r, scene);
  if (scene.showLabels) drawElevationLabels(r, scene);
}

// ---------------------------------------------------------------------------
// 1. Rejilla de alturas
// ---------------------------------------------------------------------------

function drawHeightGrid(r: ICanvasRenderer, scene: ElevationScene): void {
  const { elevation, wallLength, viewport } = scene;
  const top = Math.max(
    elevation.levels.coronacion,
    effectiveLeftHeight(elevation.levels),
    effectiveRightHeight(elevation.levels),
  );

  // Una línea por cada 0,5 m de altura. A diferencia de la planta, aquí el
  // rango es siempre pequeño (un muro mide entre 2 y 6 m) y un paso fijo es
  // más legible que uno adaptativo.
  r.setStrokeStyle(colors.grid);
  r.setLineWidth(0.5);
  for (let h = 0; h <= top + 1e-6; h += 0.5) {
    const a = cslToScreen({ x: 0, y: h }, viewport);
    const b = cslToScreen({ x: wallLength, y: h }, viewport);
    r.drawLine(a.x, a.y, b.x, b.y);
  }

  // Línea de suelo, más marcada: es la referencia de todas las alturas.
  const groundA = cslToScreen({ x: -0.2, y: 0 }, viewport);
  const groundB = cslToScreen({ x: wallLength + 0.2, y: 0 }, viewport);
  r.setStrokeStyle(colors.gridMajor);
  r.setLineWidth(2);
  r.drawLine(groundA.x, groundA.y, groundB.x, groundB.y);
}

// ---------------------------------------------------------------------------
// 2. Silueta del muro
// ---------------------------------------------------------------------------

function drawWallSilhouette(r: ICanvasRenderer, scene: ElevationScene): void {
  const { elevation, wallLength, viewport } = scene;
  const { levels } = elevation;

  // Con culata la silueta es un TRAPECIO: las dos alturas de los extremos son
  // distintas. Dibujarla siempre como rectángulo (usando la coronación) haría
  // invisible la culata, que es justamente lo que se está levantando.
  const outline = hasHeightProfile(levels)
    ? [
        { x: 0, y: 0 },
        { x: wallLength, y: 0 },
        { x: wallLength, y: effectiveRightHeight(levels) },
        { x: 0, y: effectiveLeftHeight(levels) },
      ]
    : [
        { x: 0, y: 0 },
        { x: wallLength, y: 0 },
        { x: wallLength, y: levels.coronacion },
        { x: 0, y: levels.coronacion },
      ];

  const pts = outline.map((p) => cslToScreen(p, viewport));

  r.setFillStyle(colors.surface3);
  r.fillPolygon(pts);
  r.setStrokeStyle(colors.wallStroke);
  r.setLineWidth(2);
  r.strokePolygon(pts);
}

// ---------------------------------------------------------------------------
// 3. Huecos
// ---------------------------------------------------------------------------

function drawOpenings(r: ICanvasRenderer, scene: ElevationScene): void {
  for (const opening of scene.elevation.openings) {
    const severity = scene.severityByOpening.get(opening.id as string) ?? 'ok';
    const selected = opening.id === scene.selectedOpeningId;
    drawOpening(r, scene, opening, severity, selected);
  }
}

function drawOpening(
  r: ICanvasRenderer,
  scene: ElevationScene,
  opening: WallOpening,
  severity: ElevationSeverity,
  selected: boolean,
): void {
  const { viewport } = scene;
  const rect = [
    { x: opening.xOffset, y: opening.sillHeight },
    { x: openingEnd(opening), y: opening.sillHeight },
    { x: openingEnd(opening), y: openingTop(opening) },
    { x: opening.xOffset, y: openingTop(opening) },
  ].map((p) => cslToScreen(p, viewport));

  // El hueco se "vacía": se pinta del color del fondo del lienzo, porque eso
  // es lo que es — una ausencia de muro.
  r.setFillStyle(colors.canvasBg);
  r.fillPolygon(rect);

  // El borde codifica la validación: rojo bloquea la exportación, naranja avisa.
  const stroke =
    severity === 'error' ? colors.error : severity === 'warning' ? colors.warning : colors.vanoStroke;
  r.setStrokeStyle(selected ? colors.selectStroke : stroke);
  r.setLineWidth(selected ? 3 : severity === 'ok' ? 1.5 : 2.5);
  r.strokePolygon(rect);

  // Símbolo por tipo: una puerta llega al suelo y lleva la marca del sentido de
  // apertura; una ventana lleva su antepecho marcado.
  if (opening.type === 'door') {
    const hingeX = opening.isFlipped ? openingEnd(opening) : opening.xOffset;
    const hinge = cslToScreen({ x: hingeX, y: 0 }, viewport);
    const top = cslToScreen({ x: hingeX, y: openingTop(opening) }, viewport);
    r.setStrokeStyle(stroke);
    r.setLineWidth(2);
    r.drawLine(hinge.x, hinge.y, top.x, top.y);
  } else if (opening.type === 'window') {
    const a = cslToScreen({ x: opening.xOffset, y: opening.sillHeight }, viewport);
    const b = cslToScreen({ x: openingEnd(opening), y: opening.sillHeight }, viewport);
    r.setStrokeStyle(stroke);
    r.setLineWidth(3);
    r.drawLine(a.x, a.y, b.x, b.y);
  }

  // Handles de los bordes, solo en el hueco seleccionado: con todos visibles a
  // la vez el muro se vuelve ilegible.
  if (selected) {
    for (const x of [opening.xOffset, openingEnd(opening)]) {
      const p = cslToScreen({ x, y: openingCenterY(opening) }, viewport);
      r.setFillStyle(colors.handleFill);
      r.fillCircle(p.x, p.y, layout.handleRadiusPx);
      r.setStrokeStyle(colors.handleStroke);
      r.setLineWidth(2);
      r.strokeCircle(p.x, p.y, layout.handleRadiusPx);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Umbral y dintel
// ---------------------------------------------------------------------------

function drawReferenceLines(r: ICanvasRenderer, scene: ElevationScene): void {
  const { elevation, wallLength, viewport } = scene;

  const lines: { y: number; color: string }[] = [];
  const u = umbral(elevation);
  const d = dintel(elevation);
  if (u != null) lines.push({ y: u, color: colors.info });
  if (d != null) lines.push({ y: d, color: colors.info });

  r.setLineWidth(1);
  for (const line of lines) {
    const a = cslToScreen({ x: 0, y: line.y }, viewport);
    const b = cslToScreen({ x: wallLength, y: line.y }, viewport);
    r.setStrokeStyle(line.color);
    r.drawLine(a.x, a.y, b.x, b.y);
  }
}

// ---------------------------------------------------------------------------
// 5. Cotas y etiquetas
// ---------------------------------------------------------------------------

function drawElevationLabels(r: ICanvasRenderer, scene: ElevationScene): void {
  const { elevation, wallLength, viewport } = scene;

  r.setFillStyle(colors.textPrimary);

  // Longitud del muro, bajo la línea de suelo.
  const base = cslToScreen({ x: wallLength / 2, y: 0 }, viewport);
  r.drawText(`${wallLength.toFixed(2)} m`, base.x, base.y + 18, 11, 'center');

  // Alturas de los extremos: dos etiquetas si hay culata, una si no.
  if (hasHeightProfile(elevation.levels)) {
    const left = cslToScreen({ x: 0, y: effectiveLeftHeight(elevation.levels) }, viewport);
    const right = cslToScreen({ x: wallLength, y: effectiveRightHeight(elevation.levels) }, viewport);
    r.drawText(`${effectiveLeftHeight(elevation.levels).toFixed(2)} m`, left.x + 4, left.y - 6, 11, 'left');
    r.drawText(`${effectiveRightHeight(elevation.levels).toFixed(2)} m`, right.x - 4, right.y - 6, 11, 'center');
  } else {
    const top = cslToScreen({ x: wallLength / 2, y: elevation.levels.coronacion }, viewport);
    r.drawText(`${elevation.levels.coronacion.toFixed(2)} m`, top.x, top.y - 6, 11, 'center');
  }

  // Etiqueta de cada hueco: tipo y dimensiones. Se omite si el hueco es
  // demasiado estrecho en pantalla para que el texto quepa dentro.
  for (const opening of elevation.openings) {
    const widthPx = opening.width * viewport.scale;
    if (widthPx < 48) continue;

    const center = cslToScreen({ x: openingCenterX(opening), y: openingCenterY(opening) }, viewport);
    r.drawText(openingTypeLabel(opening.type), center.x, center.y - 4, 11, 'center');
    r.drawText(
      `${opening.width.toFixed(2)} × ${opening.height.toFixed(2)}`,
      center.x,
      center.y + 12,
      10,
      'center',
    );
  }
}
