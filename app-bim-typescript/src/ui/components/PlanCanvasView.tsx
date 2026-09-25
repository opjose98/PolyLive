// =============================================================================
// PlanCanvasView.tsx — Canvas de planta con gestos
// Basado en: Canvas2D-interacción.md, arquitectura-expo-skia.md
// =============================================================================
//
// GAP CERRADO: el canvas anterior capturaba un único gesto
// (`onResponderRelease` → un tap) y no tenía paneo ni zoom. Un levantamiento
// más grande que la pantalla era literalmente imposible de ver: no había forma
// de desplazarse.
//
// REPARTO DE RESPONSABILIDADES: este componente traduce toques crudos de
// react-native a intenciones (tap / paneo / pinch / arrastre de handle) y las
// delega en EditorController. Ninguna decisión de negocio vive aquí — por eso
// la lógica de gestos que SÍ importa (qué hace un tap según la herramienta,
// cómo se compensa el punto focal del zoom) es testeable sin montar React.
// =============================================================================

import React, { useMemo, useRef } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';
import { SkiaCanvas } from './SkiaCanvas';
import { drawPlan, PlanScene } from '../canvas/planRenderer';
import type { ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';
import { colors, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PlanCanvasViewProps {
  width: number;
  height: number;
  scene: Omit<PlanScene, 'width' | 'height'>;

  /** Un toque sin desplazamiento. Coordenadas locales al canvas. */
  onTap: (x: number, y: number) => void;
  /** Intento de agarrar un handle. Devuelve `true` si lo agarró. */
  onDragStart: (x: number, y: number) => boolean;
  /** Fin del arrastre de un handle. */
  onDragEnd: (x: number, y: number) => void;
  /** Desplazamiento del viewport, en píxeles. */
  onPan: (dx: number, dy: number) => void;
  /** Zoom con punto focal en coordenadas locales. */
  onZoom: (focalX: number, focalY: number, factor: number) => void;
}

/**
 * Desplazamiento máximo, en píxeles, que sigue contando como un toque y no
 * como un arrastre. Con el dedo (y más con guantes) es imposible tocar sin
 * moverse nada: un umbral de 0 convertiría casi todos los toques en paneos
 * diminutos y el editor sería inusable.
 */
const TAP_SLOP_PX = 8;

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PlanCanvasView({
  width,
  height,
  scene,
  onTap,
  onDragStart,
  onDragEnd,
  onPan,
  onZoom,
}: PlanCanvasViewProps) {
  // Estado del gesto en curso. En refs, no en estado de React: se actualiza en
  // cada frame del dedo y un re-render por movimiento tiraría el frame budget.
  const gesture = useRef({
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    draggingHandle: false,
    pinching: false,
    lastPinchDistance: 0,
    moved: 0,
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,

        onPanResponderGrant: (event: GestureResponderEvent) => {
          const { locationX, locationY } = event.nativeEvent;
          const g = gesture.current;
          g.startX = locationX;
          g.startY = locationY;
          g.lastX = locationX;
          g.lastY = locationY;
          g.moved = 0;
          g.pinching = false;
          g.lastPinchDistance = 0;
          // Se pregunta al controlador si hay un handle bajo el dedo. Si lo
          // hay, este gesto es un arrastre de objeto y NO debe panear la vista.
          g.draggingHandle = onDragStart(locationX, locationY);
        },

        onPanResponderMove: (event: GestureResponderEvent) => {
          const g = gesture.current;
          const touches = event.nativeEvent.touches ?? [];

          if (touches.length >= 2) {
            // --- Pinch a dos dedos ---
            const [a, b] = touches;
            const distance = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

            if (!g.pinching) {
              // Primer frame con dos dedos: solo se registra la distancia base.
              // Aplicar un factor aquí produciría un salto de escala, que es el
              // "jitter al iniciar el pinch" que LevON documenta como bug.
              g.pinching = true;
              g.lastPinchDistance = distance;
              return;
            }

            if (g.lastPinchDistance > 0 && distance > 0) {
              const focalX = (a.locationX + b.locationX) / 2;
              const focalY = (a.locationY + b.locationY) / 2;
              onZoom(focalX, focalY, distance / g.lastPinchDistance);
            }
            g.lastPinchDistance = distance;
            return;
          }

          // --- Un dedo ---
          if (g.pinching) {
            // Se levantó un dedo del pinch: no se convierte el resto del gesto
            // en un paneo con el delta acumulado (daría un salto), se reinicia.
            g.pinching = false;
            g.lastX = event.nativeEvent.locationX;
            g.lastY = event.nativeEvent.locationY;
            return;
          }

          const { locationX, locationY } = event.nativeEvent;
          const dx = locationX - g.lastX;
          const dy = locationY - g.lastY;
          g.moved += Math.hypot(dx, dy);
          g.lastX = locationX;
          g.lastY = locationY;

          // Con un handle agarrado no se panea: el objeto sigue al dedo y el
          // reposicionado real se aplica al soltar (onDragEnd).
          if (!g.draggingHandle) onPan(dx, dy);
        },

        onPanResponderRelease: (event: GestureResponderEvent) => {
          const g = gesture.current;
          const { locationX, locationY } = event.nativeEvent;

          if (g.draggingHandle) {
            onDragEnd(locationX, locationY);
          } else if (!g.pinching && g.moved <= TAP_SLOP_PX) {
            onTap(g.startX, g.startY);
          }

          g.draggingHandle = false;
          g.pinching = false;
        },

        onPanResponderTerminate: () => {
          // El gesto lo robó otro responder (un scroll padre, por ejemplo): se
          // abandona sin persistir nada. Un arrastre a medias no debe escribir.
          gesture.current.draggingHandle = false;
          gesture.current.pinching = false;
        },
      }),
    [onTap, onDragStart, onDragEnd, onPan, onZoom],
  );

  const draw = useMemo(
    () => (renderer: ICanvasRenderer) => drawPlan(renderer, { ...scene, width, height }),
    [scene, width, height],
  );

  return (
    <View style={[styles.container, { width, height }]} {...panResponder.panHandlers}>
      <SkiaCanvas width={width} height={height} onDraw={draw} backgroundColor={colors.canvasBg} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.canvasBg,
    overflow: 'hidden',
  },
});

/** Tolerancia táctil que esta vista usa al consultar al controlador. */
export const CANVAS_TOUCH_TOLERANCE_PX = layout.touchTolerancePx;

export default PlanCanvasView;
