// =============================================================================
// ElevationCanvas — Lienzo Skia del alzado con sus gestos
// =============================================================================
//
// La escena se graba en un Picture cada vez que cambia (un muro tiene pocos
// elementos: grabarlo entero cuesta menos que mantener capas). Gestos, con la
// misma jerarquía que la planta:
//   - un dedo sobre el hueco seleccionado lo ARRASTRA (se engancha a bordes y
//     centros); fuera de él, panea la vista
//   - dos dedos: pinza (zoom alrededor del foco)
//   - toque: selecciona / coloca; doble toque: encuadra; pulsación larga:
//     propiedades del hueco
// Todo con `.runOnJS(true)`: el estado vive en ElevationEditor (hilo JS).
// =============================================================================

import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Fill, Group, Picture, createPicture } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import type { SkCanvas } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SkiaCanvasAdapter } from '../../native/canvas/SkiaCanvasAdapter';
import { drawElevation, ElevationScene } from './elevationRenderer';
import { CANVAS_PALETTES } from '../design/canvasThemes';
import { LONG_PRESS_MS } from '../design/motion';
import { haptic } from '../design/haptics';

export interface ElevationCanvasProps {
  readonly scene: ElevationScene;
  onTap(x: number, y: number): void;
  onDoubleTap(): void;
  onLongPress(x: number, y: number): void;
  /** Devuelve `true` si el dedo agarró el hueco seleccionado (y no hay que panear). */
  onDragStart(x: number, y: number): boolean;
  onDragMove(x: number, y: number): void;
  onDragEnd(): void;
  onDragCancel(): void;
  /**
   * Fin de un paneo/zoom: la vista se movió `dx, dy` px y se escaló `s`
   * (alrededor del origen de pantalla) respecto de la grabada.
   */
  onViewDelta(s: number, dx: number, dy: number): void;
  /** Un dedo dibuja (pincel de Avance, marca de Revisión); la vista se mueve con la pinza. */
  readonly drawEnabled?: boolean;
  onDrawBegin?(x: number, y: number): void;
  onDrawMove?(x: number, y: number): void;
  onDrawEnd?(x: number, y: number): void;
  onDrawCancel?(): void;
}

export const ElevationCanvas = React.memo(function ElevationCanvas(props: ElevationCanvasProps) {
  const { scene } = props;
  const pal = scene.palette ?? CANVAS_PALETTES.claro;
  const cb = useRef(props);
  cb.current = props;

  const picture = useMemo(
    () =>
      createPicture((canvas: SkCanvas) => {
        drawElevation(new SkiaCanvasAdapter(canvas), scene);
              // Se graba más allá de la pantalla: al panear se ve lo que estaba fuera.
      }, { x: -scene.width, y: -scene.height, width: scene.width * 3, height: scene.height * 3 }),
    [scene],
  );

  // Cámara del gesto en el hilo UI: mueve el Picture ya grabado. El alzado
  // se regraba UNA vez al soltar (antes: en cada evento del dedo).
  const dS = useSharedValue(1);
  const dX = useSharedValue(0);
  const dY = useSharedValue(0);
  const delta = useRef({ s: 1, x: 0, y: 0 }).current;
  const view = useDerivedValue(() => [{ translateX: dX.value }, { translateY: dY.value }, { scale: dS.value }]);
  // Llegó el alzado regrabado con la vista nueva: la cámara del gesto vuelve a cero.
  useLayoutEffect(() => {
    delta.s = 1;
    delta.x = 0;
    delta.y = 0;
    dS.value = 1;
    dX.value = 0;
    dY.value = 0;
  }, [picture, delta, dS, dX, dY]);

  const gesture = useMemo(() => {
    let dragging = false;
    let drawing = false;
    let pinchLast = 1;
    let moving = 0;
    const publish = () => {
      dS.value = delta.s;
      dX.value = delta.x;
      dY.value = delta.y;
    };
    const release = () => {
      moving = Math.max(0, moving - 1);
      if (moving === 0 && (delta.s !== 1 || delta.x !== 0 || delta.y !== 0)) cb.current.onViewDelta(delta.s, delta.x, delta.y);
    };

    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(4)
      .onStart((e) => {
        if (cb.current.drawEnabled) {
          drawing = true;
          cb.current.onDrawBegin?.(e.x - e.translationX, e.y - e.translationY);
          cb.current.onDrawMove?.(e.x, e.y);
          return;
        }
        dragging = cb.current.onDragStart(e.x - e.translationX, e.y - e.translationY);
        if (dragging) haptic.grab();
        else moving++;
      })
      .onChange((e) => {
        if (drawing) {
          cb.current.onDrawMove?.(e.x, e.y);
          return;
        }
        if (dragging) {
          cb.current.onDragMove(e.x, e.y);
          return;
        }
        delta.x += e.changeX;
        delta.y += e.changeY;
        publish();
      })
      .onEnd((e) => {
        if (drawing) {
          haptic.commit();
          cb.current.onDrawEnd?.(e.x, e.y);
          drawing = false;
          return;
        }
        if (dragging) {
          haptic.commit();
          cb.current.onDragEnd();
        }
      })
      .onFinalize((_e, ok) => {
        if (drawing) {
          drawing = false;
          cb.current.onDrawCancel?.();
          return;
        }
        if (dragging) {
          if (!ok) cb.current.onDragCancel();
        } else release();
        dragging = false;
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        pinchLast = 1;
        moving++;
      })
      .onChange((e) => {
        const k = e.scale / pinchLast;
        pinchLast = e.scale;
        // Zoom alrededor de los dedos: el punto bajo ellos no se mueve.
        delta.x = e.focalX - (e.focalX - delta.x) * k;
        delta.y = e.focalY - (e.focalY - delta.y) * k;
        delta.s *= k;
        publish();
      })
      .onFinalize(() => release());

    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(250)
      .onEnd((e, ok) => {
        if (ok) cb.current.onTap(e.x, e.y);
      });
    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd((_e, ok) => {
        if (ok) {
          haptic.select();
          cb.current.onDoubleTap();
        }
      });
    const longPress = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(LONG_PRESS_MS)
      .onStart((e) => {
        haptic.grab();
        cb.current.onLongPress(e.x, e.y);
      });

    // Toque inmediato (sin esperar al doble toque); ver PlanCanvas.
    return Gesture.Simultaneous(Gesture.Exclusive(longPress, Gesture.Simultaneous(tap, doubleTap)), pan, pinch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.background }]} collapsable={false}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill color={pal.background} />
          <Group transform={view}>
            <Picture picture={picture} />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
});
