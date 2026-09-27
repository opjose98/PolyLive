// =============================================================================
// PlanCanvas.tsx — Lienzo de planta: gestos (gesture-handler) + cámara en hilo UI
// =============================================================================
//
// Reemplaza a PlanCanvasView (PanResponder). Dos ideas centrales:
//
// 1. CÁMARA EN EL HILO UI. Pan, pinch y la inercia mueven shared values; el
//    dibujo ya grabado (Picture) se desplaza/escala con una matriz que
//    compensa la diferencia entre la cámara viva y la cámara con la que se
//    grabó. Mientras tanto se va entregando la cámara al controlador (JS) a
//    ~30 Hz para que repinte nítido. Así el dedo nunca espera al hilo JS.
//
// 2. DECISIONES EN EL CONTROLADOR. Este componente solo traduce gestos a
//    intenciones (tap, doble tap, long-press, arrastre de handle, cámara).
//    Qué significan lo decide EditorController, que es testeable en Node.
//
// El único cálculo de "negocio" que se replica aquí es el acierto sobre un
// handle, porque decidir ENTRE panear o arrastrar tiene que ser síncrono con
// el dedo; el controlador vuelve a validarlo en `beginDrag`.
// =============================================================================

import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, Fill, Group, Path, Picture, Skia, createPicture } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SkiaCanvasAdapter } from '../../native/canvas/SkiaCanvasAdapter';
import type { CanvasTransform } from '../../domain/geometry/types';
import { MAX_SCALE, MIN_SCALE } from '../../application/canvas/types';
import { drawPlan, PlanScene } from './planRenderer';
import { CANVAS_PALETTES, CanvasPalette } from '../design/canvasThemes';
import { sizes } from '../design/tokens';
import { duration, LONG_PRESS_MS } from '../design/motion';
import { haptic } from '../design/haptics';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type PlanCanvasScene = Omit<PlanScene, 'width' | 'height' | 'transform' | 'palette' | 'gridOverscanPx'>;

export interface PlanCanvasProps {
  width: number;
  height: number;
  scene: PlanCanvasScene;
  /** Cámara del controlador. Si cambia desde fuera (encuadre, botones), se anima. */
  transform: CanvasTransform;
  palette?: CanvasPalette;
  /** Los handles del objeto seleccionado se pueden arrastrar. */
  dragEnabled: boolean;
  /** El doble toque está disponible (solo con Seleccionar, para no retrasar el trazo). */
  doubleTapEnabled: boolean;
  longPressEnabled: boolean;
  /** Un arrastre está enganchado a un nodo: dispara la háptica de snap al entrar. */
  dragSnapped?: boolean;

  onTap: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onDragStart: (x: number, y: number) => boolean;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDragCancel: () => void;
  onCameraChange: (transform: CanvasTransform) => void;
}

/** Movimiento máximo (px) que sigue contando como toque. Con guantes, 0 sería inusable. */
const TAP_SLOP_PX = 8;
/** Cada cuánto se entrega la cámara al controlador durante un gesto. */
const COMMIT_INTERVAL_MS = 33;
/** Radio del anillo de progreso del long-press. */
const RING_RADIUS = 26;

const RING_PATH = (() => {
  const p = Skia.Path.Make();
  p.addArc({ x: -RING_RADIUS, y: -RING_RADIUS, width: RING_RADIUS * 2, height: RING_RADIUS * 2 }, -90, 360);
  return p;
})();

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PlanCanvas(props: PlanCanvasProps) {
  const { width, height, scene, transform } = props;
  const palette = props.palette ?? CANVAS_PALETTES.claro;

  // Los callbacks cambian de identidad en cada render del padre; los gestos se
  // construyen una vez y leen siempre la versión vigente desde esta ref.
  const cb = useRef(props);
  cb.current = props;

  // --- Cámara viva (hilo UI) ------------------------------------------------
  const camS = useSharedValue(transform.scale);
  const camX = useSharedValue(transform.offsetX);
  const camY = useSharedValue(transform.offsetY);
  /** Cámara con la que se grabó el Picture que está en pantalla. */
  const drawnS = useSharedValue(transform.scale);
  const drawnX = useSharedValue(transform.offsetX);
  const drawnY = useSharedValue(transform.offsetY);

  const gesturing = useSharedValue(false);
  const pinching = useSharedValue(false);
  const lastCommit = useSharedValue(0);
  const decays = useSharedValue(0);

  const grabbing = useSharedValue(false);
  const panActive = useSharedValue(false);

  const pinchStartS = useSharedValue(1);
  const pinchStartX = useSharedValue(0);
  const pinchStartY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  /** Handles del objeto seleccionado, en coordenadas mundo, para acertar en el hilo UI. */
  const handleXs = useSharedValue<number[]>([]);
  const handleYs = useSharedValue<number[]>([]);
  const dragEnabled = useSharedValue(props.dragEnabled);

  useEffect(() => {
    handleXs.value = scene.handles.map((h) => h.position.x);
    handleYs.value = scene.handles.map((h) => h.position.y);
  }, [scene.handles, handleXs, handleYs]);

  useEffect(() => {
    dragEnabled.value = props.dragEnabled;
  }, [props.dragEnabled, dragEnabled]);

  // La cámara del controlador cambió por algo que NO fue un gesto (encuadre,
  // botones de zoom, cambio de recinto): se anima hasta ella.
  useEffect(() => {
    if (gesturing.value) return;
    const same =
      Math.abs(camS.value - transform.scale) < 1e-6 &&
      Math.abs(camX.value - transform.offsetX) < 0.5 &&
      Math.abs(camY.value - transform.offsetY) < 0.5;
    if (same) return;
    const cfg = { duration: duration.base };
    camS.value = withTiming(transform.scale, cfg);
    camX.value = withTiming(transform.offsetX, cfg);
    camY.value = withTiming(transform.offsetY, cfg);
  }, [transform, gesturing, camS, camX, camY]);

  // --- Picture: se regraba solo cuando cambia el contenido o la cámara commit.
  const overscan = Math.max(width, height);
  const picture = useMemo(
    () =>
      createPicture(
        (canvas: SkCanvas) => {
          drawPlan(new SkiaCanvasAdapter(canvas), {
            ...scene,
            transform,
            width,
            height,
            palette,
            gridOverscanPx: overscan,
          });
        },
        { x: -overscan, y: -overscan, width: width + overscan * 2, height: height + overscan * 2 },
      ),
    [scene, transform, width, height, palette, overscan],
  );

  useLayoutEffect(() => {
    drawnS.value = transform.scale;
    drawnX.value = transform.offsetX;
    drawnY.value = transform.offsetY;
  }, [picture, transform, drawnS, drawnX, drawnY]);

  // Pantalla_viva = (pantalla_grabada − t0)·k + t,  con k = s/s0.
  const compensation = useDerivedValue(() => {
    const k = camS.value / drawnS.value;
    return [
      { translateX: camX.value - drawnX.value * k },
      { translateY: camY.value - drawnY.value * k },
      { scale: k },
    ];
  });

  // --- Háptica de snap: al ENTRAR en el nodo, no en cada frame dentro de él.
  const wasSnapped = useRef(false);
  useEffect(() => {
    if (props.dragSnapped && !wasSnapped.current) haptic.snap();
    wasSnapped.current = !!props.dragSnapped;
  }, [props.dragSnapped]);

  // --- Pulso de selección ---------------------------------------------------
  const pulse = useSharedValue(0);
  const pulseX = useSharedValue(0);
  const pulseY = useSharedValue(0);
  useEffect(() => {
    if (!scene.selectedId || scene.handles.length === 0) return;
    const h = scene.handles.find((x) => x.kind === 'center') ?? scene.handles[0];
    pulseX.value = h.position.x;
    pulseY.value = h.position.y;
    pulse.value = 0;
    pulse.value = withTiming(1, { duration: duration.slow });
    // Solo al cambiar de objeto seleccionado, no cuando se mueve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.selectedId]);
  const pulseCx = useDerivedValue(() => pulseX.value * camS.value + camX.value);
  const pulseCy = useDerivedValue(() => pulseY.value * camS.value + camY.value);
  const pulseR = useDerivedValue(() => 10 + pulse.value * 26);
  const pulseOpacity = useDerivedValue(() => (pulse.value > 0 && pulse.value < 1 ? 0.45 * (1 - pulse.value) : 0));

  // --- Anillo de long-press -------------------------------------------------
  const ring = useSharedValue(0);
  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  const ringTransform = useDerivedValue(() => [{ translateX: ringX.value }, { translateY: ringY.value }]);
  const ringOpacity = useDerivedValue(() => (ring.value > 0.02 ? 0.9 : 0));

  // --- Gestos ---------------------------------------------------------------
  const gesture = useMemo(() => {
    const commit = (s: number, x: number, y: number) => {
      cb.current.onCameraChange({ scale: s, offsetX: x, offsetY: y });
    };
    const js = {
      tap: (x: number, y: number) => cb.current.onTap(x, y),
      doubleTap: (x: number, y: number) => cb.current.onDoubleTap?.(x, y),
      longPress: (x: number, y: number) => {
        haptic.grab();
        cb.current.onLongPress?.(x, y);
      },
      dragStart: (x: number, y: number) => {
        if (cb.current.onDragStart(x, y)) haptic.grab();
      },
      dragMove: (x: number, y: number) => cb.current.onDragMove(x, y),
      dragEnd: (x: number, y: number) => {
        haptic.tap();
        cb.current.onDragEnd(x, y);
      },
      dragCancel: () => cb.current.onDragCancel(),
    };

    const commitThrottled = () => {
      'worklet';
      const now = Date.now();
      if (now - lastCommit.value < COMMIT_INTERVAL_MS) return;
      lastCommit.value = now;
      runOnJS(commit)(camS.value, camX.value, camY.value);
    };
    const stopCamera = () => {
      'worklet';
      cancelAnimation(camS);
      cancelAnimation(camX);
      cancelAnimation(camY);
    };
    const finishCamera = () => {
      'worklet';
      gesturing.value = false;
      runOnJS(commit)(camS.value, camX.value, camY.value);
    };
    const hitsHandle = (x: number, y: number) => {
      'worklet';
      if (!dragEnabled.value) return false;
      const xs = handleXs.value;
      const ys = handleYs.value;
      const tol = sizes.canvasTouchTolerance;
      for (let i = 0; i < xs.length; i++) {
        const hx = xs[i] * camS.value + camX.value;
        const hy = ys[i] * camS.value + camY.value;
        if ((hx - x) * (hx - x) + (hy - y) * (hy - y) <= tol * tol) return true;
      }
      return false;
    };

    const pan = Gesture.Pan()
      .minDistance(TAP_SLOP_PX)
      .averageTouches(true)
      .onBegin((e) => {
        stopCamera();
        grabbing.value = hitsHandle(e.x, e.y);
        panActive.value = false;
        if (grabbing.value) runOnJS(js.dragStart)(e.x, e.y);
      })
      .onStart(() => {
        panActive.value = true;
        if (!grabbing.value) gesturing.value = true;
      })
      .onChange((e) => {
        if (grabbing.value) {
          runOnJS(js.dragMove)(e.x, e.y);
          return;
        }
        if (pinching.value || e.numberOfPointers > 1) return;
        camX.value += e.changeX;
        camY.value += e.changeY;
        commitThrottled();
      })
      .onEnd((e) => {
        if (grabbing.value) {
          runOnJS(js.dragEnd)(e.x, e.y);
          return;
        }
        if (pinching.value) return;
        // Inercia: soltar con velocidad deja deslizar la vista, como un mapa.
        // La cámara se entrega al controlador cuando terminan LAS DOS inercias.
        decays.value = 2;
        const done = () => {
          'worklet';
          decays.value -= 1;
          if (decays.value === 0) finishCamera();
        };
        camX.value = withDecay({ velocity: e.velocityX, deceleration: 0.994 }, done);
        camY.value = withDecay({ velocity: e.velocityY, deceleration: 0.994 }, done);
      })
      .onFinalize((_e, success) => {
        if (grabbing.value) {
          // Tocó un handle sin llegar a arrastrar (fue un tap), o el sistema
          // canceló el gesto: se suelta sin persistir.
          if (!panActive.value || !success) runOnJS(js.dragCancel)();
        } else if (panActive.value && !success && !pinching.value) {
          finishCamera();
        }
        grabbing.value = false;
        panActive.value = false;
      });

    const pinch = Gesture.Pinch()
      .onStart((e) => {
        stopCamera();
        gesturing.value = true;
        pinching.value = true;
        pinchStartS.value = camS.value;
        pinchStartX.value = camX.value;
        pinchStartY.value = camY.value;
        pinchFocalX.value = e.focalX;
        pinchFocalY.value = e.focalY;
      })
      .onUpdate((e) => {
        const s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchStartS.value * e.scale));
        // El punto del mundo que estaba bajo los dedos al empezar sigue bajo
        // ellos (y se desplaza con ellos si los dedos se mueven juntos).
        const wx = (pinchFocalX.value - pinchStartX.value) / pinchStartS.value;
        const wy = (pinchFocalY.value - pinchStartY.value) / pinchStartS.value;
        camS.value = s;
        camX.value = e.focalX - wx * s;
        camY.value = e.focalY - wy * s;
        commitThrottled();
      })
      .onFinalize(() => {
        if (!pinching.value) return;
        pinching.value = false;
        finishCamera();
      });

    const tap = Gesture.Tap()
      .maxDistance(TAP_SLOP_PX)
      .onEnd((e, success) => {
        if (success) runOnJS(js.tap)(e.x, e.y);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDistance(TAP_SLOP_PX * 2)
      .enabled(props.doubleTapEnabled && !!props.onDoubleTap)
      .onEnd((e, success) => {
        if (success) runOnJS(js.doubleTap)(e.x, e.y);
      });

    const longPress = Gesture.LongPress()
      .minDuration(LONG_PRESS_MS)
      .maxDistance(TAP_SLOP_PX)
      .enabled(props.longPressEnabled && !!props.onLongPress)
      .onBegin((e) => {
        ringX.value = e.x;
        ringY.value = e.y;
        // El anillo aparece tarde: un toque normal no debe mostrarlo.
        ring.value = withDelay(120, withTiming(1, { duration: LONG_PRESS_MS - 120 }));
      })
      .onStart((e) => {
        ring.value = withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: duration.fast }));
        runOnJS(js.longPress)(e.x, e.y);
      })
      .onFinalize(() => {
        if (ring.value < 1) {
          cancelAnimation(ring);
          ring.value = withTiming(0, { duration: duration.instant });
        }
      });

    return Gesture.Simultaneous(Gesture.Exclusive(longPress, doubleTap, tap), pan, pinch);
    // Los gestos solo se reconstruyen cuando cambia qué está habilitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.doubleTapEnabled, props.longPressEnabled, !!props.onDoubleTap, !!props.onLongPress]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.container, { width, height, backgroundColor: palette.background }]} collapsable={false}>
        <Canvas style={{ width, height }}>
          <Fill color={palette.background} />
          <Group transform={compensation}>
            <Picture picture={picture} />
          </Group>
          <Circle cx={pulseCx} cy={pulseCy} r={pulseR} color={palette.selection} opacity={pulseOpacity} style="stroke" strokeWidth={3} />
          <Group transform={ringTransform} opacity={ringOpacity}>
            <Circle cx={0} cy={0} r={RING_RADIUS} color={palette.selectionFill} />
            <Path path={RING_PATH} color={palette.selection} style="stroke" strokeWidth={4} strokeCap="round" start={0} end={ring} />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
});

export default PlanCanvas;
