// =============================================================================
// liveStroke.ts — Pincel en el hilo UI (sin retraso respecto al dedo)
// =============================================================================
//
// El pincel de Avance pasaba por el hilo JS: cada movimiento del dedo iba al
// controlador, volvía como formas y se regrababa la capa viva (a ~30 Hz como
// mucho, y menos si JS estaba ocupado). En campo se veía pintar «atrasado».
//
// Aquí un gesto worklet paralelo guarda los puntos de pantalla en un shared
// value y Skia dibuja el trazo en el hilo UI, en cada cuadro. El controlador
// sigue recibiendo el mismo trazo por JS (es el que se guarda y se mide); el
// trazo vivo se borra cuando cambia `clearKey` (el guardado ya está dibujado).
// =============================================================================

import { useEffect, useMemo } from 'react';
import { Skia } from '@shopify/react-native-skia';
import { Gesture } from 'react-native-gesture-handler';
import { SharedValue, useDerivedValue, useSharedValue } from 'react-native-reanimated';

export interface LiveStroke {
  /** Ancho del pincel en metros del soporte. */
  readonly widthM: number;
  readonly color: string;
  /** Al cambiar, el trazo vivo se borra (el trazo guardado ya se ve). */
  readonly clearKey: unknown;
}

/** `pxPerMeter`: escala viva de la vista (la del gesto incluida). */
export function useLiveStroke(stroke: LiveStroke | null | undefined, pxPerMeter: SharedValue<number>, minDistance: number) {
  const on = useSharedValue(0);
  const widthM = useSharedValue(0);
  const pts = useSharedValue<number[]>([]);
  /** 1 mientras el dedo está en pantalla: el efecto de `clearKey` del trazo anterior no borra un trazo nuevo. */
  const active = useSharedValue(0);
  /** El trazo en curso ya se guardó o se rechazó: no se sigue dibujando hasta el próximo gesto. */
  const veto = useSharedValue(0);
  const enabled = !!stroke;
  const w = stroke?.widthM ?? 0;
  useEffect(() => {
    on.value = enabled ? 1 : 0;
    widthM.value = w;
    if (!enabled) pts.value = [];
  }, [enabled, w, on, widthM, pts]);
  const clearKey = stroke?.clearKey;
  useEffect(() => {
    if (!active.value) {
      pts.value = [];
      veto.value = 1;
    }
  }, [clearKey, active, pts, veto]);

  const path = useDerivedValue(() => {
    const p = Skia.Path.Make();
    const a = pts.value;
    if (a.length >= 2) {
      p.moveTo(a[0], a[1]);
      for (let i = 2; i + 1 < a.length; i += 2) p.lineTo(a[i], a[i + 1]);
      // Un toque sin movimiento también deja su punto.
      if (a.length === 2) p.lineTo(a[0] + 0.01, a[1]);
    }
    return p;
  });
  const width = useDerivedValue(() => widthM.value * pxPerMeter.value);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .minDistance(minDistance)
        .onStart((e) => {
          'worklet';
          active.value = 1;
          veto.value = 0;
          if (!on.value) return;
          pts.value = [e.x - e.translationX, e.y - e.translationY, e.x, e.y];
        })
        .onChange((e) => {
          'worklet';
          if (!on.value || veto.value) return;
          if (e.numberOfPointers > 1) {
            pts.value = [];
            return;
          }
          pts.modify((a) => {
            'worklet';
            a.push(e.x, e.y);
            return a;
          });
        })
        .onFinalize((_e, ok) => {
          'worklet';
          active.value = 0;
          if (!ok) pts.value = [];
        }),
    [on, active, pts, veto, minDistance],
  );

  return { gesture, path, width, color: stroke?.color ?? '#000000' };
}
