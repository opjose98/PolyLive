// =============================================================================
// SpacePreview.tsx — Miniatura de la planta de un espacio
// Portado de LevON: features/projects/ui/spaces/space_preview_painter.dart,
//                   features/viewport/space_bounds.dart
// =============================================================================
//
// POR QUÉ NO ES DECORACIÓN: con cinco o seis espacios llamados "Planta 1",
// "Planta 2", "Sótano"..., el nombre no basta para reconocer cuál es cuál y el
// operador acaba abriéndolos de uno en uno. El contorno dibujado sí identifica
// el espacio de un vistazo.
//
// Usa el mismo canvas Skia que el editor, con una transformación calculada para
// encajar el polígono en la miniatura — la misma lógica de encuadre que
// `EditorController.zoomToFit`, pero aquí basta con el polígono del Recinto.
// =============================================================================

import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { SkiaCanvas } from './SkiaCanvas';
import type { ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';
import type { Point2D, CanvasTransform } from '../../domain/geometry/types';
import { radius } from '../design/tokens';
import { type } from '../design/typography';
import { CANVAS_PALETTES } from '../design/canvasThemes';
import { themedStyles } from '../design/theme';

export interface SpacePreviewProps {
  geometry: readonly Point2D[];
  width: number;
  height: number;
}

/**
 * Transformación que encaja `points` dentro de un rectángulo, centrada y con
 * margen. Devuelve `null` si no hay nada que encajar.
 *
 * Se exporta para poder probarla: es la única parte con aritmética de la
 * miniatura, y un fallo aquí produce previsualizaciones vacías o recortadas
 * que nadie detecta mirando la pantalla de un vistazo.
 */
export function fitTransform(
  points: readonly Point2D[],
  width: number,
  height: number,
  padding = 8,
): CanvasTransform | null {
  if (points.length < 2) return null;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  // Un espacio puede ser una línea recta (dos vértices alineados): el span en
  // uno de los ejes es 0 y dividir por él daría una escala infinita.
  const spanX = Math.max(maxX - minX, 1e-6);
  const spanY = Math.max(maxY - minY, 1e-6);

  const usableW = Math.max(width - padding * 2, 1);
  const usableH = Math.max(height - padding * 2, 1);
  const scale = Math.min(usableW / spanX, usableH / spanY);

  return {
    scale,
    offsetX: width / 2 - ((minX + maxX) / 2) * scale,
    offsetY: height / 2 - ((minY + maxY) / 2) * scale,
  };
}

export function SpacePreview({ geometry, width, height }: SpacePreviewProps) {
  const styles = useStyles();
  const transform = useMemo(() => fitTransform(geometry, width, height), [geometry, width, height]);

  const draw = useMemo(
    () => (r: ICanvasRenderer) => {
      if (!transform) return;
      const pts = geometry.map((p) => ({
        x: p.x * transform.scale + transform.offsetX,
        y: p.y * transform.scale + transform.offsetY,
      }));

      if (pts.length >= 3) {
        r.setFillStyle(CANVAS_PALETTES.claro.roomFill);
        r.fillPolygon(pts);
      }
      r.setStrokeStyle(CANVAS_PALETTES.claro.ink);
      r.setLineWidth(1.5);
      if (pts.length >= 3) {
        r.strokePolygon(pts);
      } else {
        for (let i = 1; i < pts.length; i++) {
          r.drawLine(pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y);
        }
      }
    },
    [geometry, transform],
  );

  if (!transform) {
    return (
      <View
        style={[styles.placeholder, { width, height }]}
        accessibilityLabel="Espacio sin trazo todavía"
      >
        <Text style={styles.placeholderText}>Sin trazo</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, { width, height }]} accessibilityLabel="Vista previa de la planta">
      <SkiaCanvas width={width} height={height} onDraw={draw} backgroundColor={CANVAS_PALETTES.claro.background} />
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  frame: {
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: CANVAS_PALETTES.claro.background,
  },
  placeholder: {
    borderRadius: radius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    ...type.caption,
    color: colors.textDisabled,
  },
}));

export default SpacePreview;
