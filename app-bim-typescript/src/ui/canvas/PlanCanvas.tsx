// =============================================================================
// PlanCanvas.tsx — Lienzo de planta: gestos (gesture-handler) + cámara en hilo UI
// =============================================================================
//
// CÁMARA SIN SALTOS. El contenido se graba UNA vez en un Picture en
// coordenadas MUNDO (metros): se dibuja a la escala vigente y se reescala por
// 1/escala al grabar. La cámara (traslación + escala) es una matriz animada en
// el hilo UI que se aplica a ese Picture. Así:
//   · panear no regraba nada: solo cambia la matriz;
//   · cuando llega un Picture nuevo (cambió el contenido o la escala), su
//     geometría cae exactamente en el mismo lugar, porque su posición no
//     depende de con qué cámara se grabó. No hay fotograma "viejo desplazado".
// La rejilla la dibuja la GPU con un shader que lee la misma cámara.
//
// GESTOS EN EL HILO JS (`runOnJS(true)`). Con los callbacks como worklets, en
// Expo Go (SDK 51) el aviso de FIN de un gesto hacia JS quedaba retenido hasta
// el siguiente toque: el trazo de un muro no se cerraba al levantar el dedo y
// se mezclaba con el siguiente. La cámara sigue siendo un shared value: se
// escribe desde JS y la matriz se aplica en el hilo UI.
//
// DECISIONES EN EL CONTROLADOR. Este componente traduce gestos a intenciones
// (tap, doble tap, long-press, arrastre de handle, trazo de muro, cámara); qué
// significan lo decide EditorController, testeable en Node. Lo único que se
// resuelve aquí es si un toque cae sobre un handle, porque decidir ENTRE panear
// o arrastrar tiene que ser síncrono con el dedo.
//
// Con una herramienta de trazo activa, UN dedo dibuja y DOS dedos mueven y
// hacen zoom (como LevON).
// =============================================================================

import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Circle, Fill, Group, Path, Picture, Shader, Skia, createPicture } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  runOnJS,
  useDerivedValue,
  useSharedValue,
  Easing,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { SkiaCanvasAdapter } from '../../native/canvas/SkiaCanvasAdapter';
import type { CanvasTransform } from '../../domain/geometry/types';
import { MAX_SCALE, MIN_SCALE } from '../../application/canvas/types';
import { drawPlan, drawPlanOverlay, PlanScene } from './planRenderer';
import { CANVAS_PALETTES, CanvasPalette } from '../design/canvasThemes';
import { sizes } from '../design/tokens';
import { duration, LONG_PRESS_MS } from '../design/motion';
import { haptic } from '../design/haptics';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type PlanCanvasScene = Omit<
  PlanScene,
  'width' | 'height' | 'transform' | 'palette' | 'gridOverscanPx' | 'showGrid' | 'gridStyle'
>;

export interface PlanCanvasProps {
  width: number;
  height: number;
  scene: PlanCanvasScene;
  /** Cámara del controlador. Si cambia desde fuera (encuadre, botones), se anima. */
  transform: CanvasTransform;
  palette?: CanvasPalette;
  grid: { show: boolean; lines: boolean; dots: boolean };
  /** Los handles del objeto seleccionado se pueden arrastrar. */
  dragEnabled: boolean;
  /** Un dedo traza (herramienta Muro); la cámara pasa a dos dedos. */
  drawEnabled: boolean;
  /** El doble toque está disponible (solo con Seleccionar, para no retrasar el trazo). */
  doubleTapEnabled: boolean;
  longPressEnabled: boolean;
  /** Un arrastre o trazo está enganchado a un nodo: háptica al entrar. */
  snapped?: boolean;
  /**
   * Ángulos (rad) a los que se engancha el giro con dos dedos, además de los
   * múltiplos de 90°: p. ej. el que deja el norte arriba.
   */
  rotationSnaps?: readonly number[];

  onTap: (x: number, y: number) => void;
  onDoubleTap?: (x: number, y: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onDragStart: (x: number, y: number) => boolean;
  onDragMove: (x: number, y: number) => void;
  onDragEnd: (x: number, y: number) => void;
  onDragCancel: () => void;
  onDrawBegin?: (x: number, y: number) => void;
  onDrawMove?: (x: number, y: number) => void;
  onDrawEnd?: (x: number, y: number) => void;
  onDrawCancel?: () => void;
  onCameraChange: (transform: CanvasTransform) => void;
}

/** Movimiento máximo (px) que sigue contando como toque. Con guantes, 0 sería inusable. */
const TAP_SLOP_PX = 8;
/** Cada cuánto se entrega la cámara al controlador durante un gesto. */
const COMMIT_INTERVAL_MS = 50;
/** Intervalo mínimo entre movimientos de trazo/arrastre entregados al controlador. */
const MOVE_INTERVAL_MS = 33;
/** Inercia del paneo: cuánto sigue deslizando y en cuánto tiempo. */
const GLIDE_SECONDS = 0.18;
const GLIDE_MS = 420;
const RING_RADIUS = 26;
/** Enganche del giro: a menos de esto de un ángulo notable, se queda en él. */
const ROTATION_SNAP = (5 * Math.PI) / 180;
/** Límites del contenido grabado, en metros. */
const WORLD_BOUNDS = { x: -1e5, y: -1e5, width: 2e5, height: 2e5 };

const RING_PATH = (() => {
  const p = Skia.Path.Make();
  p.addArc({ x: -RING_RADIUS, y: -RING_RADIUS, width: RING_RADIUS * 2, height: RING_RADIUS * 2 }, -90, 360);
  return p;
})();

// ---------------------------------------------------------------------------
// Rejilla en GPU
// ---------------------------------------------------------------------------

const GRID_SHADER = Skia.RuntimeEffect.Make(`
uniform float2 u_off;
uniform float2 u_rot;
uniform float u_step;
uniform float u_lines;
uniform float u_dots;
uniform float u_lineW;
uniform float u_dotR;
uniform float4 u_lineColor;
uniform float4 u_dotColor;
uniform float4 u_axisColor;

float4 layer(float4 acc, float4 c, float cov) {
  float k = clamp(cov, 0.0, 1.0) * c.a;
  return float4(c.rgb * k, k) + acc * (1.0 - k);
}

half4 main(float2 p) {
  // Se lleva el píxel al marco del mundo (sin el giro de la vista): así las
  // líneas de la rejilla giran con el dibujo.
  float2 d0 = p - u_off;
  float2 w = float2(d0.x * u_rot.x + d0.y * u_rot.y, -d0.x * u_rot.y + d0.y * u_rot.x);
  float s = u_step;
  float4 acc = float4(0.0);
  if (u_lines > 0.5) {
    float2 g = mod(w, s);
    float2 d = min(g, s - g);
    float h = u_lineW * 0.5;
    acc = layer(acc, u_lineColor, 1.0 - smoothstep(h, h + 1.0, min(d.x, d.y)));
  }
  if (u_dots > 0.5) {
    float2 q = mod(w + (u_lines > 0.5 ? s * 0.5 : 0.0), s);
    float dd = length(min(q, s - q));
    acc = layer(acc, u_dotColor, 1.0 - smoothstep(u_dotR - 0.75, u_dotR + 0.75, dd));
  }
  float ax = min(abs(w.x), abs(w.y));
  acc = layer(acc, u_axisColor, 1.0 - smoothstep(u_lineW, u_lineW + 1.0, ax));
  return half4(acc);
}
`)!;

function rgba(color: string): number[] {
  return Array.from(Skia.Color(color));
}

/** Versión worklet de `gridStepMeters`: paso de rejilla que deja 20–100 px por celda. */
function gridStepPx(scale: number): number {
  'worklet';
  const candidates = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100];
  for (let i = 0; i < candidates.length; i++) {
    if (candidates[i] * scale >= 20) return candidates[i] * scale;
  }
  return candidates[candidates.length - 1] * scale;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PlanCanvas(props: PlanCanvasProps) {
  const { width, height, scene, transform } = props;
  const palette = props.palette ?? CANVAS_PALETTES.claro;

  // Los gestos se construyen una vez y leen siempre los callbacks vigentes.
  const cb = useRef(props);
  cb.current = props;

  // --- Cámara viva (hilo UI) ------------------------------------------------
  // Cámara: `cam` es la verdad en el hilo JS (donde corren los gestos); los
  // shared values son solo la salida hacia el hilo UI. Leer un shared value
  // justo después de escribirlo desde JS devuelve el valor anterior, así que
  // nunca se hace `camX.value += dx`: se acumula en `cam` y se publica.
  const cam = useRef({ s: transform.scale, x: transform.offsetX, y: transform.offsetY, r: transform.rotation ?? 0 }).current;
  const camS = useSharedValue(transform.scale);
  const camX = useSharedValue(transform.offsetX);
  const camY = useSharedValue(transform.offsetY);
  const camR = useSharedValue(transform.rotation ?? 0);
  const publish = () => {
    camS.value = cam.s;
    camX.value = cam.x;
    camY.value = cam.y;
    camR.value = cam.r;
  };

  /** Estado del gesto en curso (solo JS). */
  const g = useRef({
    gesturing: false,
    pinching: false,
    grabbing: false,
    drawing: false,
    panActive: false,
    decaying: false,
    lastCommit: 0,
    pinchStart: { s: 1, x: 0, y: 0, fx: 0, fy: 0, wx: 0, wy: 0 },
    /** Último foco de los dos dedos (para girar alrededor de él). */
    focal: { x: 0, y: 0 },
    rotStart: 0,
    rotSnapped: false,
  }).current;

  // La cámara del controlador cambió por algo que NO fue un gesto (encuadre,
  // botones de zoom, cambio de recinto): se anima hasta ella.
  useEffect(() => {
    if (g.gesturing) return;
    const rot = transform.rotation ?? 0;
    const same =
      Math.abs(cam.s - transform.scale) < 1e-6 &&
      Math.abs(cam.x - transform.offsetX) < 0.5 &&
      Math.abs(cam.y - transform.offsetY) < 0.5 &&
      Math.abs(cam.r - rot) < 1e-4;
    cam.s = transform.scale;
    cam.x = transform.offsetX;
    cam.y = transform.offsetY;
    cam.r = rot;
    if (same) return;
    const cfg = { duration: duration.base };
    camS.value = withTiming(transform.scale, cfg);
    camX.value = withTiming(transform.offsetX, cfg);
    camY.value = withTiming(transform.offsetY, cfg);
    camR.value = withTiming(rot, cfg);
  }, [transform, g, cam, camS, camX, camY, camR]);

  // --- Contenido: Picture en coordenadas mundo -----------------------------
  //
  // Dos capas: la planta (cara, cambia al crear/editar) y la del trazo en
  // curso (barata, cambia en cada movimiento del dedo). Si el trazo viviera en
  // la misma capa, cada movimiento regrabaría toda la planta y el hilo JS se
  // saturaría hasta retrasar el fin del gesto varios segundos.
  const recScale = transform.scale;
  const {
    objects, selectedId, handles, showLabels, rooms, roomName, showNodes,
    measureTargetId, photoMarkers, selectedPhotoMarkerId, wallDraft, draftThickness, snapIndicator, underlay,
    existingIds, benchmarks, selectedBenchmarkId, coordLabels,
  } = scene;
  const picture = useMemo(
    () =>
      createPicture((canvas: SkCanvas) => {
        canvas.scale(1 / recScale, 1 / recScale);
        drawPlan(new SkiaCanvasAdapter(canvas), {
          objects, selectedId, handles, showLabels, rooms, roomName, showNodes,
          measureTargetId, photoMarkers, selectedPhotoMarkerId, underlay, existingIds,
          benchmarks, selectedBenchmarkId, coordLabels,
          transform: { scale: recScale, offsetX: 0, offsetY: 0 },
          width,
          height,
          palette,
          showGrid: false,
        });
      }, WORLD_BOUNDS),
    [objects, selectedId, handles, showLabels, rooms, roomName, showNodes, measureTargetId, photoMarkers,
      selectedPhotoMarkerId, underlay, existingIds, benchmarks, selectedBenchmarkId, coordLabels, recScale, width, height, palette],
  );
  const overlay = useMemo(
    () =>
      createPicture((canvas: SkCanvas) => {
        canvas.scale(1 / recScale, 1 / recScale);
        drawPlanOverlay(new SkiaCanvasAdapter(canvas), {
          objects: [], selectedId: null, handles: [], showLabels: false,
          wallDraft, draftThickness, snapIndicator,
          transform: { scale: recScale, offsetX: 0, offsetY: 0 },
          width,
          height,
          palette,
          showGrid: false,
        });
      }, WORLD_BOUNDS),
    [wallDraft, draftThickness, snapIndicator, recScale, width, height, palette],
  );

  const camera = useDerivedValue(() => [
    { translateX: camX.value },
    { translateY: camY.value },
    { rotate: camR.value },
    { scale: camS.value },
  ]);

  // --- Rejilla -----------------------------------------------------------------
  const gridColors = useMemo(
    () => ({ line: rgba(palette.grid), dot: rgba(palette.gridDot), axis: rgba(palette.gridMajor) }),
    [palette],
  );
  const gridLines = props.grid.lines ? 1 : 0;
  const gridDots = props.grid.dots ? 1 : 0;
  const lineW = 0.75 * palette.lineScale;
  const dotR = palette.dotRadius;
  const gridUniforms = useDerivedValue(
    () => ({
      u_off: [camX.value, camY.value],
      u_rot: [Math.cos(camR.value), Math.sin(camR.value)],
      u_step: gridStepPx(camS.value),
      u_lines: gridLines,
      u_dots: gridDots,
      u_lineW: lineW,
      u_dotR: dotR,
      u_lineColor: gridColors.line,
      u_dotColor: gridColors.dot,
      u_axisColor: gridColors.axis,
    }),
    [gridColors, gridLines, gridDots, lineW, dotR],
  );

  // --- Háptica de snap: al ENTRAR en el nodo, no en cada frame dentro de él.
  const wasSnapped = useRef(false);
  useEffect(() => {
    if (props.snapped && !wasSnapped.current) haptic.snap();
    wasSnapped.current = !!props.snapped;
  }, [props.snapped]);

  // --- Pulso de selección -------------------------------------------------------
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
  const pulseCx = useDerivedValue(
    () => (pulseX.value * Math.cos(camR.value) - pulseY.value * Math.sin(camR.value)) * camS.value + camX.value,
  );
  const pulseCy = useDerivedValue(
    () => (pulseX.value * Math.sin(camR.value) + pulseY.value * Math.cos(camR.value)) * camS.value + camY.value,
  );
  const pulseR = useDerivedValue(() => 10 + pulse.value * 26);
  const pulseOpacity = useDerivedValue(() => (pulse.value > 0 && pulse.value < 1 ? 0.45 * (1 - pulse.value) : 0));

  // --- Anillo de long-press -----------------------------------------------------
  const ring = useSharedValue(0);
  const ringX = useSharedValue(0);
  const ringY = useSharedValue(0);
  const ringTransform = useDerivedValue(() => [{ translateX: ringX.value }, { translateY: ringY.value }]);
  const ringOpacity = useDerivedValue(() => (ring.value > 0.02 ? 0.9 : 0));

  // --- Gestos (todos en el hilo JS) ---------------------------------------
  const gesture = useMemo(() => {
    const commit = () => cb.current.onCameraChange({ scale: cam.s, offsetX: cam.x, offsetY: cam.y, rotation: cam.r });
    /** Mundo → pantalla con la cámara viva (JS). */
    const toScreen = (wx: number, wy: number) => {
      const c = Math.cos(cam.r);
      const sn = Math.sin(cam.r);
      return { x: (wx * c - wy * sn) * cam.s + cam.x, y: (wx * sn + wy * c) * cam.s + cam.y };
    };
    /** Coloca la cámara para que el punto mundo (wx, wy) quede bajo el foco (fx, fy). */
    const anchor = (wx: number, wy: number, fx: number, fy: number) => {
      const c = Math.cos(cam.r);
      const sn = Math.sin(cam.r);
      cam.x = fx - (wx * c - wy * sn) * cam.s;
      cam.y = fy - (wx * sn + wy * c) * cam.s;
    };
    const commitThrottled = () => {
      const now = Date.now();
      if (now - g.lastCommit < COMMIT_INTERVAL_MS) return;
      g.lastCommit = now;
      commit();
    };
    const finishCamera = () => {
      g.gesturing = false;
      commit();
    };
    /** Fin de la inercia (llega desde el hilo UI con la posición final). */
    const onDecayEnd = (x: number, y: number) => {
      if (!g.decaying) return;
      g.decaying = false;
      cam.x = x;
      cam.y = y;
      finishCamera();
    };
    const stopCamera = () => {
      if (g.decaying) {
        // Se interrumpe la inercia: la cámara queda donde la dejó el hilo UI.
        g.decaying = false;
        cancelAnimation(camX);
        cancelAnimation(camY);
        cam.x = camX.value;
        cam.y = camY.value;
      }
    };

    // Movimientos a ~30 Hz como máximo: más no se ve y satura el hilo JS.
    let lastMove = 0;
    const throttledMove = (x: number, y: number, fn: (x: number, y: number) => void) => {
      const now = Date.now();
      if (now - lastMove < MOVE_INTERVAL_MS) return;
      lastMove = now;
      fn(x, y);
    };

    const hitsHandle = (x: number, y: number) => {
      if (!cb.current.dragEnabled) return false;
      const tol = sizes.canvasTouchTolerance;
      return cb.current.scene.handles.some((h) => {
        const p = toScreen(h.position.x, h.position.y);
        return (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) <= tol * tol;
      });
    };

    const pan = Gesture.Pan()
      .runOnJS(true)
      .minDistance(TAP_SLOP_PX)
      .averageTouches(true)
      .onBegin((e) => {
        stopCamera();
        g.grabbing = hitsHandle(e.x, e.y);
        g.drawing = false;
        g.panActive = false;
        if (g.grabbing && cb.current.onDragStart(e.x, e.y)) haptic.grab();
      })
      .onStart((e) => {
        g.panActive = true;
        if (g.grabbing) return;
        if (cb.current.drawEnabled && e.numberOfPointers === 1) {
          g.drawing = true;
          cb.current.onDrawBegin?.(e.x - e.translationX, e.y - e.translationY);
          cb.current.onDrawMove?.(e.x, e.y);
          return;
        }
        g.gesturing = true;
      })
      .onChange((e) => {
        if (g.grabbing) {
          throttledMove(e.x, e.y, (x, y) => cb.current.onDragMove(x, y));
          return;
        }
        if (g.drawing) {
          if (e.numberOfPointers > 1) {
            // Entró un segundo dedo: era un zoom, no un trazo.
            g.drawing = false;
            cb.current.onDrawCancel?.();
            return;
          }
          throttledMove(e.x, e.y, (x, y) => cb.current.onDrawMove?.(x, y));
          return;
        }
        if (!g.gesturing || g.pinching || e.numberOfPointers > 1) return;
        cam.x += e.changeX;
        cam.y += e.changeY;
        publish();
        commitThrottled();
      })
      .onEnd((e) => {
        if (g.grabbing) {
          g.grabbing = false;
          haptic.tap();
          cb.current.onDragEnd(e.x, e.y);
          return;
        }
        if (g.drawing) {
          g.drawing = false;
          cb.current.onDrawEnd?.(e.x, e.y);
          return;
        }
        if (g.pinching || !g.gesturing) return;
        // Inercia corta: soltar con velocidad deja deslizar la vista. Se
        // anima en el hilo UI; al terminar devuelve la posición final a JS.
        const speed = Math.hypot(e.velocityX, e.velocityY);
        if (speed < 200) {
          finishCamera();
          return;
        }
        g.decaying = true;
        // Deslizamiento de duración fija en los dos ejes (mismo final para ambos).
        const tx = cam.x + e.velocityX * GLIDE_SECONDS;
        const ty = cam.y + e.velocityY * GLIDE_SECONDS;
        const cfg = { duration: GLIDE_MS, easing: Easing.out(Easing.cubic) };
        camY.value = withTiming(ty, cfg);
        camX.value = withTiming(tx, cfg, (finished) => {
          if (finished) runOnJS(onDecayEnd)(tx, ty);
        });
      })
      .onFinalize((_e, success) => {
        if (g.grabbing) {
          // Tocó un handle sin llegar a arrastrar (fue un tap), o el sistema canceló.
          if (!g.panActive || !success) cb.current.onDragCancel();
        } else if (g.drawing) {
          cb.current.onDrawCancel?.();
        } else if (g.panActive && !success && !g.pinching && g.gesturing && !g.decaying) {
          finishCamera();
        }
        g.grabbing = false;
        g.drawing = false;
        g.panActive = false;
      });

    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onStart((e) => {
        stopCamera();
        g.gesturing = true;
        g.pinching = true;
        // Punto del mundo bajo los dedos al empezar (con el giro de ese momento).
        const dx = e.focalX - cam.x;
        const dy = e.focalY - cam.y;
        const c = Math.cos(cam.r);
        const sn = Math.sin(cam.r);
        g.pinchStart = {
          s: cam.s,
          x: cam.x,
          y: cam.y,
          fx: e.focalX,
          fy: e.focalY,
          wx: (dx * c + dy * sn) / cam.s,
          wy: (-dx * sn + dy * c) / cam.s,
        };
        g.focal = { x: e.focalX, y: e.focalY };
      })
      .onUpdate((e) => {
        const p = g.pinchStart;
        // El punto del mundo que estaba bajo los dedos al empezar sigue bajo
        // ellos, y se desplaza con ellos (pan a dos dedos), con el giro actual.
        cam.s = Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.s * e.scale));
        g.focal = { x: e.focalX, y: e.focalY };
        anchor(p.wx, p.wy, e.focalX, e.focalY);
        publish();
        commitThrottled();
      })
      .onFinalize(() => {
        if (!g.pinching) return;
        g.pinching = false;
        finishCamera();
      });

    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDistance(TAP_SLOP_PX)
      .onEnd((e, success) => {
        if (success) cb.current.onTap(e.x, e.y);
      });

    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .maxDistance(TAP_SLOP_PX * 2)
      .enabled(props.doubleTapEnabled && !!props.onDoubleTap)
      .onEnd((e, success) => {
        if (success) cb.current.onDoubleTap?.(e.x, e.y);
      });

    let longFired = false;
    const longPress = Gesture.LongPress()
      .runOnJS(true)
      .minDuration(LONG_PRESS_MS)
      .maxDistance(TAP_SLOP_PX)
      .enabled(props.longPressEnabled && !!props.onLongPress)
      .onBegin((e) => {
        longFired = false;
        ringX.value = e.x;
        ringY.value = e.y;
        // El anillo aparece tarde: un toque normal no debe mostrarlo.
        ring.value = withDelay(120, withTiming(1, { duration: LONG_PRESS_MS - 120 }));
      })
      .onStart((e) => {
        longFired = true;
        ring.value = withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: duration.fast }));
        haptic.grab();
        cb.current.onLongPress?.(e.x, e.y);
      })
      .onFinalize(() => {
        if (!longFired) {
          cancelAnimation(ring);
          ring.value = withTiming(0, { duration: duration.instant });
        }
      });

    // Giro con dos dedos, enganchado a múltiplos de 90° y a los ángulos
    // notables (norte). Solo cambia la vista: nunca el modelo.
    const snapAngle = (raw: number): { r: number; snapped: boolean } => {
      const targets = [0, Math.PI / 2, Math.PI, -Math.PI / 2, ...(cb.current.rotationSnaps ?? [])];
      for (const t of targets) {
        // Distancia angular mínima (con vueltas completas).
        const d = Math.atan2(Math.sin(raw - t), Math.cos(raw - t));
        if (Math.abs(d) < ROTATION_SNAP) return { r: raw - d, snapped: true };
      }
      return { r: raw, snapped: false };
    };
    const rotation = Gesture.Rotation()
      .runOnJS(true)
      .onStart(() => {
        stopCamera();
        g.gesturing = true;
        g.rotStart = cam.r;
        g.rotSnapped = false;
      })
      .onUpdate((e) => {
        const { r, snapped } = snapAngle(g.rotStart + e.rotation);
        if (snapped && !g.rotSnapped) haptic.snap();
        g.rotSnapped = snapped;
        cam.r = Math.atan2(Math.sin(r), Math.cos(r));
        // Se gira alrededor de los dedos: el punto del mundo bajo ellos no se mueve.
        const p = g.pinchStart;
        if (g.pinching) anchor(p.wx, p.wy, g.focal.x, g.focal.y);
        publish();
        commitThrottled();
      })
      .onFinalize(() => {
        if (!g.pinching) finishCamera();
      });

    return Gesture.Simultaneous(Gesture.Exclusive(longPress, doubleTap, tap), pan, pinch, rotation);
    // Los gestos solo se reconstruyen cuando cambia qué está habilitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.doubleTapEnabled, props.longPressEnabled, !!props.onDoubleTap, !!props.onLongPress]);

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.container, { width, height, backgroundColor: palette.background }]} collapsable={false}>
        <Canvas style={{ width, height }}>
          <Fill color={palette.background} />
          {props.grid.show && (
            <Fill>
              <Shader source={GRID_SHADER} uniforms={gridUniforms} />
            </Fill>
          )}
          <Group transform={camera}>
            <Picture picture={picture} />
            <Picture picture={overlay} />
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
