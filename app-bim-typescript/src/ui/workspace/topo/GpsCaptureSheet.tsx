// =============================================================================
// GpsCaptureSheet — "Deja el celular quieto" y promedia el GPS
// =============================================================================
//
// Anillo de progreso con los segundos que faltan, lecturas, dispersión y
// precisión en vivo. Al terminar entrega el promedio. Se puede terminar antes
// (promedia lo que haya) o cancelar.
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { BottomSheet, ActionButton, Icon } from '../../primitives';
import { GpsAverage, GPS_WARN_METERS } from '../../../domain/geo/gpsAverage';
import { GpsProgress, GpsSession, startGpsAveraging } from '../../../native/location/GpsAverager';
import { AppError } from '../../../shared/errors/AppError';
import { spacing } from '../../design/tokens';
import { type } from '../../design/typography';
import { haptic } from '../../design/haptics';
import { themedStyles, useTheme } from '../../design/theme';

const RING = 150;


/** Pista del anillo de progreso (fija: no se rehace en cada render). */
const RING_TRACK = Skia.Path.Circle(RING / 2, RING / 2, RING / 2 - 10);
export function GpsCaptureSheet({
  open,
  seconds,
  purpose,
  onResult,
  onClose,
}: {
  open: boolean;
  seconds: number;
  /** Texto de para qué es el punto ("amarrar el proyecto", "crear un mojón"). */
  purpose: string;
  onResult: (avg: GpsAverage) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const [progress, setProgress] = useState<GpsProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<GpsSession | null>(null);

  useEffect(() => {
    if (!open) return;
    setProgress(null);
    setError(null);
    const s = startGpsAveraging(seconds, setProgress);
    session.current = s;
    s.result
      .then((avg) => {
        haptic.commit();
        onResult(avg);
      })
      .catch((err) => {
        if (err instanceof AppError && err.technicalDetail === 'cancelled') return;
        setError(err instanceof AppError ? err.userMessage : 'No se pudo leer el GPS.');
      });
    return () => s.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, seconds]);

  const frac = progress ? Math.min(1, progress.elapsedMs / progress.totalMs) : 0;
  const left = progress ? Math.max(0, Math.ceil((progress.totalMs - progress.elapsedMs) / 1000)) : seconds;
  const p = progress?.partial;
  const quality = p ? Math.max(p.spread, p.meanAccuracy) : null;
  const arc = Skia.PathBuilder.Make().addArc({ x: 10, y: 10, width: RING - 20, height: RING - 20 }, -90, 360 * frac).detach();

  return (
    <BottomSheet
      open={open}
      onClose={() => {
        session.current?.cancel();
        onClose();
      }}
      heightRatio={0.6}
    >
      <View style={styles.root}>
        <Text style={styles.title}>Punto GPS</Text>
        <Text style={styles.sub}>Para {purpose}. Deja el celular quieto, en el punto, con vista al cielo.</Text>
        <View style={styles.ringWrap}>
          <Canvas style={styles.ring}>
            <Path path={RING_TRACK} color={colors.border} style="stroke" strokeWidth={8} />
            <Path path={arc} color={colors.accentText} style="stroke" strokeWidth={8} strokeCap="round" />
          </Canvas>
          <View style={styles.ringText}>
            <Icon name="crosshairs-gps" size={22} color={colors.accentText} />
            <Text style={styles.big}>{left}s</Text>
            <Text style={styles.small}>{progress?.samples ?? 0} lecturas</Text>
          </View>
        </View>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <Text style={[styles.quality, quality !== null && quality > GPS_WARN_METERS && styles.warn]}>
            {quality === null
              ? 'Esperando señal…'
              : `Precisión ±${p!.meanAccuracy.toFixed(1)} m · dispersión ${p!.spread.toFixed(1)} m` +
                (quality > GPS_WARN_METERS ? ' — impreciso para amarrar' : '')}
          </Text>
        )}
        <View style={styles.row}>
          <ActionButton label="Cancelar" variant="secondary" onPress={() => { session.current?.cancel(); onClose(); }} />
          <ActionButton label="Terminar ya" icon="check" onPress={() => session.current?.stop()} disabled={!progress?.samples} />
        </View>
      </View>
    </BottomSheet>
  );
}

const useStyles = themedStyles((colors) => ({
  root: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  title: { ...type.title, color: colors.text, alignSelf: 'flex-start' },
  sub: { ...type.body, color: colors.textSecondary, alignSelf: 'flex-start' },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', width: RING, height: RING },
  ringText: { alignItems: 'center' },
  big: { ...type.title, fontSize: 28, lineHeight: 32, color: colors.text },
  small: { ...type.caption, color: colors.textSecondary },
  quality: { ...type.label, color: colors.textSecondary, textAlign: 'center' },
  warn: { color: colors.warning },
  error: { ...type.body, color: colors.error, textAlign: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
}));
