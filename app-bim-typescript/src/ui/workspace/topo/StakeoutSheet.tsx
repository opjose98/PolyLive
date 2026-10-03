// =============================================================================
// StakeoutSheet — Replanteo con GPS: cuánto y hacia dónde moverse
// =============================================================================
//
// Lee la posición en vivo, la pasa al plano del proyecto y muestra la
// distancia al punto, la indicación N/E ("3,20 m al Sur · 1,05 m al Este") y
// una flecha que apunta al objetivo según la brújula del teléfono. Con un
// celular la precisión es de metros: se muestra siempre para no engañar.
// =============================================================================

import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { BottomSheet, ActionButton, Icon } from '../../primitives';
import type { CrsId, GridPoint } from '../../../domain/geo/crs';
import { latLonToGrid, meridianConvergence } from '../../../domain/geo/crs';
import { GPS_WARN_METERS } from '../../../domain/geo/gpsAverage';
import { formatAzimuth, stakeout } from '../../../application/geo/surveyTools';
import { LiveFix, watchPositionAndHeading } from '../../../native/location/watchPosition';
import { AppError } from '../../../shared/errors/AppError';
import { spacing } from '../../design/tokens';
import { type } from '../../design/typography';
import { haptic } from '../../design/haptics';
import { themedStyles, useTheme } from '../../design/theme';

export function StakeoutSheet({
  open,
  target,
  targetName,
  crs,
  onClose,
}: {
  open: boolean;
  target: GridPoint | null;
  targetName: string;
  crs: CrsId;
  onClose: () => void;
}) {
  const styles = useStyles();
  const colors = useTheme();
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFix(null);
    setHeading(null);
    setError(null);
    let stop: (() => void) | null = null;
    let cancelled = false;
    watchPositionAndHeading(setFix, setHeading)
      .then((s) => {
        if (cancelled) s();
        else stop = s;
      })
      .catch((e) => setError(e instanceof AppError ? e.userMessage : 'No se pudo leer el GPS.'));
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [open]);

  const result = useMemo(() => {
    if (!fix || !target) return null;
    const here = latLonToGrid(crs, { lat: fix.lat, lon: fix.lon });
    return { here, ...stakeout(here, target, Math.max(0.5, fix.accuracy ?? 0)) };
  }, [fix, target, crs]);

  // Háptica al llegar (dentro de la precisión del GPS).
  const arrived = !!result?.arrived;
  useEffect(() => {
    if (arrived) haptic.commit();
  }, [arrived]);

  // Flecha: azimut real al objetivo menos el rumbo del teléfono.
  const arrow = useMemo(() => {
    if (!result || heading === null || !target) return null;
    const trueAz = result.azimuth - meridianConvergence(crs, result.here);
    return trueAz - heading;
  }, [result, heading, crs, target]);

  const acc = fix?.accuracy ?? null;
  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.55}>
      <View style={styles.body}>
        <Text style={styles.title}>Replanteo · {targetName}</Text>
        {error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !result ? (
          <Text style={styles.hint}>Esperando GPS… sal a cielo abierto.</Text>
        ) : (
          <>
            <View style={styles.row}>
              {arrow !== null ? (
                <View style={{ transform: [{ rotate: `${arrow}deg` }] }}>
                  <Icon name="navigation" size={72} color={result.arrived ? colors.success : colors.accentText} />
                </View>
              ) : null}
              <View>
                <Text style={styles.big}>{result.arrived ? 'Llegaste' : `${result.distance.toFixed(2)} m`}</Text>
                <Text style={styles.line}>{result.instruction}</Text>
                <Text style={styles.small}>Azimut {formatAzimuth(result.azimuth)}</Text>
              </View>
            </View>
            <Text style={[styles.small, acc !== null && acc > GPS_WARN_METERS && { color: colors.warning }]}>
              Precisión GPS ±{acc !== null ? acc.toFixed(1) : '—'} m
              {acc !== null && acc > GPS_WARN_METERS ? ' · la guía es aproximada; para replantear con precisión usa estación total' : ''}
            </Text>
          </>
        )}
        <ActionButton label="Terminar" variant="secondary" onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

const useStyles = themedStyles((colors) => ({
  body: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.text },
  hint: { ...type.body, color: colors.textSecondary },
  error: { ...type.body, color: colors.error },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  big: { ...type.title, fontSize: 34, lineHeight: 40, color: colors.text },
  line: { ...type.bodyStrong, color: colors.text },
  small: { ...type.caption, color: colors.textSecondary },
}));
