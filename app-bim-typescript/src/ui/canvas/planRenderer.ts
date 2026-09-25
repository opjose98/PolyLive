// =============================================================================
// planRenderer.ts — Dibujo de la planta sobre ICanvasRenderer
// Basado en: Canvas2D-interacción.md, presupuesto-frame.md
// Portado de LevON: features/editor/ui/static_layer_painter.dart,
//                   preview_layer_painter.dart, overlays/labels_layer_painter.dart
// =============================================================================
//
// POR QUÉ ESTÁ AQUÍ Y NO DENTRO DEL COMPONENTE: el dibujo estaba embebido como
// un `useCallback` dentro de SurveyScreen, así que no había forma de verificar
// que un muro seleccionado se resalta, que un vano se dibuja sobre su muro o
// que las cotas aparecen — solo se podía comprobar que la pantalla "renderiza".
// Como función pura sobre la interfaz `ICanvasRenderer`, todo eso se puede
// afirmar con un renderer de prueba que registre las llamadas.
//
// ORDEN DE CAPAS (de atrás hacia delante), portado de LevON:
//   1. fondo + rejilla
//   2. relleno y contorno de recintos cerrados
//   3. muros (portantes gruesos, particiones finas)
//   4. vanos sobre sus muros
//   5. columnas
//   6. trazo en curso (polilínea + vértices)
//   7. resalte de la selección y sus handles
//   8. etiquetas (cotas y áreas) — siempre arriba, o las tapa la geometría
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
import { centroid } from '../../domain/geometry/polygon-utils';
import type { Handle } from '../../application/canvas/SelectionService';
import { SelectionService } from '../../application/canvas/SelectionService';
import { colors, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

export interface PlanScene {
  readonly objects: readonly RevitObjectBase[];
  readonly vertices: readonly Point2D[];
  readonly transform: CanvasTransform;
  readonly selectedId: RevitObjectId | null;
  readonly handles: readonly Handle[];
  readonly width: number;
  readonly height: number;
  readonly showGrid: boolean;
  /** Cotas de muro y áreas de recinto. Se pueden apagar para aligerar el frame. */
  readonly showLabels: boolean;
  /** Muro marcado como destino de medición (herramienta Medir). */
  readonly measureTargetId?: string | null;
  /** Polígonos sugeridos por DetectRoomsUseCase, pendientes de adoptar. */
  readonly suggestions?: readonly { polygon: readonly Point2D[] }[];
  /**
   * Marcadores de fotos de campo (SPDS). Cada uno ancla una foto a un punto de
   * la planta; `direction` dibuja además el cono de visión de la cámara.
   */
  readonly photoMarkers?: readonly {
    id: string;
    position: Point2D;
    direction?: number;
    label?: string;
  }[];
  /** Marcador de foto seleccionado, resaltado sobre el resto. */
  readonly selectedPhotoMarkerId?: string | null;
}

/** Separación de la rejilla, en metros, elegida según el zoom. */
export function gridStepMeters(scale: number): number {
  // Objetivo: entre 20 y 100 px por celda a cualquier zoom. Sin esto, la
  // rejilla de paso fijo se vuelve una mancha sólida al alejar (miles de
  // líneas por frame, que es exactamente lo que se come el presupuesto de
  // 16 ms) y desaparece al acercar.
  const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  for (const step of candidates) {
    if (step * scale >= 20) return step;
  }
  return candidates[candidates.length - 1];
}

const selectionService = new SelectionService();

// ---------------------------------------------------------------------------
// Entrada principal
// ---------------------------------------------------------------------------

export function drawPlan(r: ICanvasRenderer, scene: PlanScene): void {
  const toScreen = (p: Point2D) => worldToScreen(p, scene.transform);

  if (scene.showGrid) drawGrid(r, scene);
  drawRooms(r, scene, toScreen);
  if (scene.suggestions?.length) drawSuggestions(r, scene, toScreen);
  drawWalls(r, scene, toScreen);
  drawVanos(r, scene, toScreen);
  drawColumns(r, scene, toScreen);
  drawDraftPolyline(r, scene, toScreen);
  if (scene.photoMarkers?.length) drawPhotoMarkers(r, scene, toScreen);
  drawSelection(r, scene, toScreen);
  if (scene.showLabels) drawLabels(r, scene, toScreen);
}

// ---------------------------------------------------------------------------
// 1. Rejilla
// ---------------------------------------------------------------------------

function drawGrid(r: ICanvasRenderer, scene: PlanScene): void {
  const { transform, width, height } = scene;
  const step = gridStepMeters(transform.scale);
  const stepPx = step * transform.scale;

  // Primera línea visible: el resto positivo del offset respecto al paso.
  // Así la rejilla queda anclada al ORIGEN DEL MUNDO (x=0 mundo siempre cae
  // sobre una línea) en vez de a la esquina del viewport — si se anclara al
  // viewport, "resbalaría" al panear y dejaría de servir de referencia métrica.
  const firstX = (((transform.offsetX % stepPx) + stepPx) % stepPx);
  const firstY = (((transform.offsetY % stepPx) + stepPx) % stepPx);

  r.setLineWidth(0.5);
  r.setStrokeStyle(colors.grid);
  for (let x = firstX; x < width; x += stepPx) r.drawLine(x, 0, x, height);
  for (let y = firstY; y < height; y += stepPx) r.drawLine(0, y, width, y);

  // Ejes del mundo: la referencia absoluta del levantamiento.
  r.setStrokeStyle(colors.gridMajor);
  r.setLineWidth(1);
  if (transform.offsetX >= 0 && transform.offsetX <= width) {
    r.drawLine(transform.offsetX, 0, transform.offsetX, height);
  }
  if (transform.offsetY >= 0 && transform.offsetY <= height) {
    r.drawLine(0, transform.offsetY, width, transform.offsetY);
  }
}

// ---------------------------------------------------------------------------
// 2. Recintos
// ---------------------------------------------------------------------------

function drawRooms(r: ICanvasRenderer, scene: PlanScene, toScreen: (p: Point2D) => Point2D): void {
  for (const obj of scene.objects) {
    if (!(obj instanceof Room)) continue;
    if (obj.geometry.length < 3) continue;

    const pts = obj.geometry.map(toScreen);
    r.setFillStyle(colors.roomFill);
    r.fillPolygon(pts);
    r.setStrokeStyle(colors.roomStroke);
    r.setLineWidth(1);
    r.strokePolygon(pts);
  }
}

function drawSuggestions(
  r: ICanvasRenderer,
  scene: PlanScene,
  toScreen: (p: Point2D) => Point2D,
): void {
  // Las sugerencias son propuestas, no hechos: se dibujan en el color de
  // selección y solo con contorno, para que no se confundan con un recinto
  // ya cerrado y persistido.
  r.setStrokeStyle(colors.selectStroke);
  r.setLineWidth(2);
  for (const suggestion of scene.suggestions ?? []) {
    if (suggestion.polygon.length < 3) continue;
    r.strokePolygon(suggestion.polygon.map(toScreen));
  }
}

// ---------------------------------------------------------------------------
// 3. Muros
// ---------------------------------------------------------------------------

function drawWalls(r: ICanvasRenderer, scene: PlanScene, toScreen: (p: Point2D) => Point2D): void {
  for (const obj of scene.objects) {
    if (!(obj instanceof Wall)) continue;

    const a = toScreen(obj.startPoint);
    const b = toScreen(obj.endPoint);

    // El espesor real del muro se dibuja a escala, con un mínimo de 2px para
    // que a zoom bajo siga siendo visible en vez de desaparecer.
    const widthPx = Math.max(2, (obj.thickness as number) * scene.transform.scale);
    r.setStrokeStyle(obj.isStructural ? colors.wallStructural : colors.wallPartition);
    r.setLineWidth(widthPx);
    r.drawLine(a.x, a.y, b.x, b.y);

    // Muro destino de medición: subrayado en el color de aviso.
    if (scene.measureTargetId && (obj.id as string) === scene.measureTargetId) {
      r.setStrokeStyle(colors.warning);
      r.setLineWidth(Math.max(1, widthPx * 0.4));
      r.drawLine(a.x, a.y, b.x, b.y);
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Vanos
// ---------------------------------------------------------------------------

function drawVanos(r: ICanvasRenderer, scene: PlanScene, toScreen: (p: Point2D) => Point2D): void {
  const walls = scene.objects.filter((o): o is Wall => o instanceof Wall);
  const wallsById = new Map(walls.map((w) => [w.id as string, w]));

  for (const obj of scene.objects) {
    if (!(obj instanceof Door) && !(obj instanceof Window)) continue;
    const wall = wallsById.get(obj.parentWallId as unknown as string);
    if (!wall) continue; // vano huérfano: no se dibuja donde no hay muro

    const center = selectionService.vanoWorldCenter(obj, wall);
    if (!center) continue;

    // El vano se dibuja como un hueco en el muro: un segmento del color del
    // fondo tan ancho como el muro, y sobre él una línea fina que distingue
    // puerta (llena) de ventana (doble).
    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) continue;
    const ux = dx / len;
    const uy = dy / len;
    const half = (obj.width as number) / 2;

    const from = toScreen({ x: center.x - ux * half, y: center.y - uy * half });
    const to = toScreen({ x: center.x + ux * half, y: center.y + uy * half });

    const wallWidthPx = Math.max(2, (wall.thickness as number) * scene.transform.scale);
    r.setStrokeStyle(colors.canvasBg);
    r.setLineWidth(wallWidthPx);
    r.drawLine(from.x, from.y, to.x, to.y);

    r.setStrokeStyle(colors.vanoStroke);
    r.setLineWidth(obj instanceof Door ? 2 : 1.5);
    r.drawLine(from.x, from.y, to.x, to.y);

    if (obj instanceof Window) {
      // Segunda línea desplazada: el símbolo convencional de ventana en planta.
      const px = -uy;
      const py = ux;
      const gap = wallWidthPx * 0.25;
      r.drawLine(from.x + px * gap, from.y + py * gap, to.x + px * gap, to.y + py * gap);
      r.drawLine(from.x - px * gap, from.y - py * gap, to.x - px * gap, to.y - py * gap);
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Columnas
// ---------------------------------------------------------------------------

function drawColumns(r: ICanvasRenderer, scene: PlanScene, toScreen: (p: Point2D) => Point2D): void {
  for (const obj of scene.objects) {
    if (!(obj instanceof Column)) continue;

    r.setFillStyle(colors.columnFill);
    if (obj.isCircular) {
      const c = toScreen(obj.position);
      const rPx = Math.max(2, ((obj.dimensionX as number) / 2) * scene.transform.scale);
      r.fillCircle(c.x, c.y, rPx);
    } else {
      const footprint = obj.footprint();
      if (footprint) r.fillPolygon(footprint.map(toScreen));
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Trazo en curso
// ---------------------------------------------------------------------------

function drawDraftPolyline(
  r: ICanvasRenderer,
  scene: PlanScene,
  toScreen: (p: Point2D) => Point2D,
): void {
  if (scene.vertices.length === 0) return;

  const pts = scene.vertices.map(toScreen);

  r.setStrokeStyle(colors.wallPreview);
  r.setLineWidth(1);
  for (let i = 1; i < pts.length; i++) {
    r.drawLine(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
  }

  r.setFillStyle(colors.nodeColor);
  for (const p of pts) r.fillCircle(p.x, p.y, 4);

  // El último vértice se marca más grande: es desde donde saldrá el próximo
  // muro, y en campo hay que poder verlo sin buscarlo.
  const last = pts[pts.length - 1];
  r.setFillStyle(colors.snapNode);
  r.fillCircle(last.x, last.y, 6);
}

// ---------------------------------------------------------------------------
// 6b. Marcadores de fotos (SPDS)
// ---------------------------------------------------------------------------

/** Radio del marcador en pantalla. Fijo: un marcador no tiene tamaño en metros. */
const PHOTO_MARKER_RADIUS_PX = 9;

function drawPhotoMarkers(
  r: ICanvasRenderer,
  scene: PlanScene,
  toScreen: (p: Point2D) => Point2D,
): void {
  for (const marker of scene.photoMarkers ?? []) {
    const p = toScreen(marker.position);
    const selected = marker.id === scene.selectedPhotoMarkerId;

    // Cono de visión: dice qué se estaba mirando, no solo dónde se estaba.
    if (marker.direction !== undefined) {
      const rad = (marker.direction * Math.PI) / 180;
      const spread = Math.PI / 6; // ±30°, aproximadamente el campo de un móvil
      const reach = PHOTO_MARKER_RADIUS_PX * 3.5;
      const cone = [
        p,
        { x: p.x + Math.cos(rad - spread) * reach, y: p.y + Math.sin(rad - spread) * reach },
        { x: p.x + Math.cos(rad + spread) * reach, y: p.y + Math.sin(rad + spread) * reach },
      ];
      r.setFillStyle(colors.selectFill);
      r.fillPolygon(cone);
    }

    r.setFillStyle(selected ? colors.selectStroke : colors.photoMarker);
    r.fillCircle(p.x, p.y, PHOTO_MARKER_RADIUS_PX);
    r.setStrokeStyle(colors.surface);
    r.setLineWidth(2);
    r.strokeCircle(p.x, p.y, PHOTO_MARKER_RADIUS_PX);

    if (scene.showLabels && marker.label) {
      r.setFillStyle(colors.textPrimary);
      r.drawText(marker.label, p.x, p.y - PHOTO_MARKER_RADIUS_PX - 4, 10, 'center');
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Selección y handles
// ---------------------------------------------------------------------------

function drawSelection(
  r: ICanvasRenderer,
  scene: PlanScene,
  toScreen: (p: Point2D) => Point2D,
): void {
  if (!scene.selectedId) return;
  const selected = scene.objects.find((o) => o.id === scene.selectedId);
  if (!selected) return;

  r.setStrokeStyle(colors.selectStroke);

  if (selected instanceof Wall) {
    const a = toScreen(selected.startPoint);
    const b = toScreen(selected.endPoint);
    r.setLineWidth(Math.max(4, (selected.thickness as number) * scene.transform.scale + 4));
    r.drawLine(a.x, a.y, b.x, b.y);
  } else if (selected instanceof Column) {
    const c = toScreen(selected.position);
    const rPx = Math.max(4, ((selected.dimensionX as number) / 2) * scene.transform.scale + 3);
    r.setLineWidth(2);
    r.strokeCircle(c.x, c.y, rPx);
  } else if (selected instanceof Room && selected.geometry.length >= 3) {
    r.setLineWidth(2);
    r.strokePolygon(selected.geometry.map(toScreen));
  } else if (selected instanceof Door || selected instanceof Window) {
    const wall = scene.objects.find(
      (o): o is Wall =>
        o instanceof Wall && (o.id as string) === (selected.parentWallId as unknown as string),
    );
    const center = wall ? selectionService.vanoWorldCenter(selected, wall) : null;
    if (center) {
      const c = toScreen(center);
      r.setLineWidth(2);
      r.strokeCircle(c.x, c.y, Math.max(8, ((selected.width as number) / 2) * scene.transform.scale));
    }
  }

  // Handles: círculo blanco con borde, para que se vean sobre cualquier fondo.
  for (const handle of scene.handles) {
    const p = toScreen(handle.position);
    r.setFillStyle(colors.handleFill);
    r.fillCircle(p.x, p.y, layout.handleRadiusPx);
    r.setStrokeStyle(colors.handleStroke);
    r.setLineWidth(2);
    r.strokeCircle(p.x, p.y, layout.handleRadiusPx);
  }
}

// ---------------------------------------------------------------------------
// 8. Etiquetas
// ---------------------------------------------------------------------------

function drawLabels(r: ICanvasRenderer, scene: PlanScene, toScreen: (p: Point2D) => Point2D): void {
  r.setFillStyle(colors.textPrimary);

  for (const obj of scene.objects) {
    if (obj instanceof Wall) {
      // Una cota ilegible es peor que ninguna: por debajo de 40px de muro en
      // pantalla, el texto se solaparía con el muro contiguo.
      const a = toScreen(obj.startPoint);
      const b = toScreen(obj.endPoint);
      if (Math.hypot(b.x - a.x, b.y - a.y) < 40) continue;

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      r.drawText(`${Number(obj.length).toFixed(2)} m`, mid.x, mid.y - 6, 11, 'center');
    } else if (obj instanceof Room && obj.geometry.length >= 3 && obj.area != null) {
      const c = toScreen(centroid(obj.geometry));
      const name = (obj.properties.name as string | undefined) ?? 'Recinto';
      r.drawText(name, c.x, c.y - 4, 12, 'center');
      r.drawText(`${Number(obj.area).toFixed(2)} m²`, c.x, c.y + 12, 11, 'center');
    }
  }
}
