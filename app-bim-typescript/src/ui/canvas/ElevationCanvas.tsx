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

import React, { useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Fill, Picture, createPicture } from '@shopify/react-native-skia';
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
  onPan(dx: number, dy: number): void;
  onPinch(fx: number, fy: number, factor: number): void;
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
      }, { x: 0, y: 0, width: scene.width, height: scene.height }),
    [scene],
  );

  const gesture = useMemo(() => {
    let dragging = false;
    let last = { x: 0, y: 0 };
    let pinchLast = 1;

    const pan = Gesture.Pan()
      .runOnJS(true)
      .maxPointers(1)
      .minDistance(4)
      .onStart((e) => {
        dragging = cb.current.onDragStart(e.x - e.translationX, e.y - e.translationY);
        if (dragging) haptic.grab();
        last = { x: e.translationX, y: e.translationY };
      })
      .onChange((e) => {
        if (dragging) cb.current.onDragMove(e.x, e.y);
        else cb.current.onPan(e.translationX - last.x, e.translationY - last.y);
        last = { x: e.translationX, y: e.translationY };
      })
      .onEnd(() => {
        if (dragging) {
          haptic.commit();
          cb.current.onDragEnd();
        }
        dragging = false;
      })
      .onFinalize((_e, ok) => {
        if (!ok && dragging) cb.current.onDragCancel();
        dragging = false;
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart(() => {
        pinchLast = 1;
      })
      .onChange((e) => {
        cb.current.onPinch(e.focalX, e.focalY, e.scale / pinchLast);
        pinchLast = e.scale;
      });

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

    return Gesture.Simultaneous(Gesture.Exclusive(longPress, doubleTap, tap), pan, pinch);
  }, []);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: pal.background }]} collapsable={false}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Fill color={pal.background} />
          <Picture picture={picture} />
        </Canvas>
      </View>
    </GestureDetector>
  );
});
