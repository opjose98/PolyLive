// =============================================================================
// SurveyControlScreen.tsx — Topografía: sistema de coordenadas y mojones
// Basado en: SiteCoordinateSystem.md, SurveyControlPoint.md,
//            gpsAnchor-referencia.md (Spike #7)
// =============================================================================
//
// GAP CERRADO: `CreateControlPointUseCase` y `DefineSiteCoordinateSystemUseCase`
// existían con sus tablas, sus comandos y sus tests, y ninguna pantalla los
// invocaba. El `controlPointsSlice` del store de Zustand tampoco lo escribía
// nadie. Toda la topografía del Spike #7 era código inalcanzable.
//
// DOS INVARIANTES QUE ESTA PANTALLA TIENE QUE RESPETAR EN LA UI, NO SOLO EN EL
// DOMINIO:
//   1. El SiteCoordinateSystem es INMUTABLE. Una vez definido, no hay botón de
//      editar: cambiarlo invalidaría las coordenadas de todos los Recintos ya
//      trazados. La UI lo dice antes de definirlo, no después de intentarlo.
//   2. `gpsCoordinates.accuracy` > 0 siempre. La captura GPS puede fallar por
//      precisión insuficiente, y ese fallo se muestra como tal en vez de
//      guardar un mojón que parece un dato y no lo es.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, ActivityIndicator } from 'react-native';

import { AppServices } from '../../application/AppServices';
import { ExpoGpsProvider, IGpsProvider } from '../../native/location/ExpoGpsProvider';
import {
  SurveyControlPoint,
  SiteCoordinateSystem,
  SiteId,
  siteId as makeSiteId,
  operatorId as makeOperatorId,
  GpsCoordinates,
} from '../../domain/objects/survey';
import type { Operator } from '../../domain/objects/operator';
import { meters, degrees } from '../../domain/geometry/types';
import { AppError } from '../../shared/errors/AppError';
import { NumberField, TextField, ReadonlyRow } from '../components/fields';
import { ActionButton, alertDialog } from '../primitives';
import type { AppStore } from '../../state/appStore';
import { colors, spacing, radius, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SurveyControlScreenProps {
  services: AppServices;
  operator: Operator;
  appStore: AppStore;
  /**
   * Sede de trabajo. PolyLive todavía no tiene gestión de Sedes múltiples
   * (ver docs/13-AUDITORIA-UNIFICACION.md): se usa una Sede por defecto para
   * que la topografía sea usable, con un único punto que cambiar el día que se
   * modelen varias.
   */
  site?: SiteId;
  /** Inyectable para tests y para el modo escritorio sin GPS. */
  gpsProvider?: IGpsProvider;
}

export const DEFAULT_SITE_ID = makeSiteId('site-default');

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function SurveyControlScreen({
  services,
  operator,
  appStore,
  site = DEFAULT_SITE_ID,
  gpsProvider,
}: SurveyControlScreenProps) {
  const [gps] = useState<IGpsProvider>(() => gpsProvider ?? new ExpoGpsProvider());

  const [system, setSystem] = useState<SiteCoordinateSystem | null>(null);
  const [points, setPoints] = useState<SurveyControlPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Formulario del sistema de coordenadas
  const [originX, setOriginX] = useState(0);
  const [originY, setOriginY] = useState(0);
  const [originZ, setOriginZ] = useState(0);
  const [northRotation, setNorthRotation] = useState(0);

  // Formulario del mojón
  const [pointName, setPointName] = useState('');
  const [pointNotes, setPointNotes] = useState('');
  const [localX, setLocalX] = useState(0);
  const [localY, setLocalY] = useState(0);
  const [localZ, setLocalZ] = useState(0);
  const [lastFix, setLastFix] = useState<GpsCoordinates | null>(null);
  const [capturing, setCapturing] = useState(false);

  // -----------------------------------------------------------------------
  // Carga
  // -----------------------------------------------------------------------

  const reload = useCallback(async () => {
    const [definedSystem, storedPoints] = await Promise.all([
      services.store.getSiteCoordinateSystem(site),
      services.store.listSurveyControlPoints(site),
    ]);
    setSystem(definedSystem);
    setPoints(storedPoints);

    // Reflejar en el store global — GAP CERRADO: el `controlPointsSlice`
    // existía sin ningún escritor.
    const store = appStore.getState();
    store.setSiteCoordinateSystem(
      definedSystem ? { origin: definedSystem.origin, northRotation: definedSystem.northRotation } : null,
    );
    for (const point of storedPoints) {
      store.addControlPoint({
        id: point.id as string,
        name: point.name,
        localCoordinates: point.localCoordinates,
        capturedAt: point.capturedAt,
      });
    }
  }, [services, site, appStore]);

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch(() => {
        if (!cancelled) alertDialog('Error', 'No se pudo cargar la información topográfica.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // -----------------------------------------------------------------------
  // Acciones
  // -----------------------------------------------------------------------

  const defineSystem = useCallback(() => {
    alertDialog(
      'Definir sistema de coordenadas',
      'Esta operación es IRREVERSIBLE: una vez definido, el sistema de coordenadas de la Sede no se ' +
        'puede cambiar, porque invalidaría las coordenadas de todos los Recintos ya trazados. ' +
        '¿Confirmas el origen y la rotación introducidos?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Definir',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await services.useCases.defineSiteCoordinateSystem.execute({
                siteId: site,
                origin: { x: meters(originX), y: meters(originY), z: meters(originZ) },
                northRotation: degrees(northRotation),
                definedBy: makeOperatorId(operator.id as unknown as string),
              });
              await reload();
              alertDialog('Hecho', 'Sistema de coordenadas definido.');
            } catch (err) {
              alertDialog(
                'Error',
                err instanceof AppError ? err.userMessage : 'No se pudo definir el sistema de coordenadas.',
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [services, site, originX, originY, originZ, northRotation, operator, reload]);

  const captureGps = useCallback(async () => {
    setCapturing(true);
    try {
      const fixed = await gps.getCurrentPosition();
      setLastFix(fixed);
    } catch (err) {
      alertDialog(
        'GPS',
        err instanceof AppError ? err.userMessage : 'No se pudo obtener la posición GPS.',
      );
    } finally {
      setCapturing(false);
    }
  }, [gps]);

  const createPoint = useCallback(async () => {
    if (!lastFix) {
      alertDialog('Falta el GPS', 'Captura primero la posición GPS del mojón.');
      return;
    }

    setBusy(true);
    try {
      await services.useCases.createControlPoint.execute({
        siteId: site,
        localCoordinates: { x: meters(localX), y: meters(localY), z: meters(localZ) },
        gpsCoordinates: lastFix,
        name: pointName || undefined,
        notes: pointNotes || undefined,
      });
      setPointName('');
      setPointNotes('');
      setLastFix(null);
      await reload();
      alertDialog('Hecho', 'Punto de control guardado.');
    } catch (err) {
      alertDialog(
        'Error',
        err instanceof AppError ? err.userMessage : 'No se pudo guardar el punto de control.',
      );
    } finally {
      setBusy(false);
    }
  }, [services, site, localX, localY, localZ, lastFix, pointName, pointNotes, reload]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.navy} />
        <Text style={styles.muted}>Cargando topografía...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.muted}>
          Sede: {site as string}. Los puntos de control son referencia documental: en esta versión no
          intervienen en el cálculo de la geometría BIM.
        </Text>

        {/* --- Sistema de coordenadas --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Sistema de coordenadas de la Sede</Text>

          {system ? (
            <>
              <ReadonlyRow label="Origen X" value={`${Number(system.origin.x).toFixed(3)} m`} />
              <ReadonlyRow label="Origen Y" value={`${Number(system.origin.y).toFixed(3)} m`} />
              <ReadonlyRow label="Origen Z" value={`${Number(system.origin.z).toFixed(3)} m`} />
              <ReadonlyRow label="Rotación al norte" value={`${Number(system.northRotation).toFixed(2)}°`} />
              <ReadonlyRow label="Definido" value={system.definedAt.toLocaleString()} />
              <ReadonlyRow label="Por" value={system.definedBy as string} />
              <Text style={styles.note}>
                Definido e inmutable. Cambiarlo invalidaría las coordenadas de todos los Recintos ya
                trazados, así que no existe forma de editarlo.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.note}>
                Sin definir. Se define UNA sola vez y no se puede cambiar después.
              </Text>
              <NumberField label="Origen X" unit="m" decimals={3} value={originX} disabled={busy} onCommit={setOriginX} />
              <NumberField label="Origen Y" unit="m" decimals={3} value={originY} disabled={busy} onCommit={setOriginY} />
              <NumberField label="Origen Z" unit="m" decimals={3} value={originZ} disabled={busy} onCommit={setOriginZ} />
              <NumberField
                label="Rotación al norte"
                unit="°"
                decimals={2}
                min={0}
                max={360}
                value={northRotation}
                disabled={busy}
                onCommit={setNorthRotation}
                hint="Ángulo desde el eje Y local hasta el norte geográfico."
              />
              <ActionButton label="Definir sistema" onPress={defineSystem} disabled={busy} />
            </>
          )}
        </View>

        {/* --- Nuevo mojón --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nuevo punto de control</Text>

          <TextField
            label="Nombre"
            value={pointName}
            placeholder="p. ej. Mojón fachada norte"
            disabled={busy}
            onCommit={setPointName}
          />
          <NumberField label="Local X" unit="m" decimals={3} value={localX} disabled={busy} onCommit={setLocalX} />
          <NumberField label="Local Y" unit="m" decimals={3} value={localY} disabled={busy} onCommit={setLocalY} />
          <NumberField label="Local Z" unit="m" decimals={3} value={localZ} disabled={busy} onCommit={setLocalZ} />

          {lastFix ? (
            <View style={styles.fixBox}>
              <ReadonlyRow label="Latitud" value={lastFix.latitude.toFixed(6)} />
              <ReadonlyRow label="Longitud" value={lastFix.longitude.toFixed(6)} />
              <ReadonlyRow label="Altitud" value={`${Number(lastFix.altitude).toFixed(1)} m`} />
              <ReadonlyRow label="Precisión" value={`±${Number(lastFix.accuracy).toFixed(1)} m`} />
            </View>
          ) : (
            <Text style={styles.note}>
              Sin posición GPS capturada. Es obligatoria: un mojón sin coordenadas geográficas no sirve de
              referencia.
            </Text>
          )}

          <TextField
            label="Observaciones"
            value={pointNotes}
            placeholder="Descripción del mojón, material, estado"
            multiline
            disabled={busy}
            onCommit={setPointNotes}
          />

          <View style={styles.row}>
            <ActionButton
              label={capturing ? 'Capturando...' : 'Capturar GPS'}
              variant="secondary"
              onPress={() => void captureGps()}
              disabled={capturing || busy}
            />
            <ActionButton
              label="Guardar punto"
              onPress={() => void createPoint()}
              disabled={!lastFix || busy}
            />
          </View>
        </View>

        {/* --- Listado --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Puntos de control ({points.length})</Text>
          {points.length === 0 ? (
            <Text style={styles.note}>Todavía no hay mojones registrados en esta Sede.</Text>
          ) : (
            points.map((point) => (
              <View key={point.id as string} style={styles.pointRow}>
                <Text style={styles.pointName}>{point.name ?? 'Sin nombre'}</Text>
                <Text style={styles.pointDetail}>
                  Local ({Number(point.localCoordinates.x).toFixed(2)},{' '}
                  {Number(point.localCoordinates.y).toFixed(2)}, {Number(point.localCoordinates.z).toFixed(2)}) m
                </Text>
                <Text style={styles.pointDetail}>
                  GPS {point.gpsCoordinates.latitude.toFixed(5)}, {point.gpsCoordinates.longitude.toFixed(5)} ·
                  ±{Number(point.gpsCoordinates.accuracy).toFixed(1)} m
                </Text>
                <Text style={styles.pointDetail}>{point.capturedAt.toLocaleString()}</Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  fixBox: {
    backgroundColor: colors.surface2,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pointRow: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  pointName: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  pointDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

export default SurveyControlScreen;
