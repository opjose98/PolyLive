// =============================================================================
// TopographyPanel — Sección "Topografía" del drawer ⋮ (configuración del proyecto)
// =============================================================================
//
// Lo que define cómo se calculan las coordenadas reales del proyecto: sistema,
// método de amarre, origen, azimut, escala, ajuste (RMSE y residuales), cota
// del Nivel 0, convergencia de meridianos y segundos de promedio del GPS.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Accordion, ActionButton } from '../../primitives';
import { crsDef, formatMeters, meridianConvergence, workingCrs } from '../../../domain/geo/crs';
import { azimuthDegrees } from '../../../domain/geo/georeference';
import type { Topography } from './useTopography';
import { Field, Kv, parseNum } from './TopoFields';
import { colors, spacing } from '../../design/tokens';
import { type } from '../../design/typography';

const METHOD = { none: 'Solo locales', origin: 'Origen conocido + azimut', gps: 'GPS en un punto', control: 'Ajuste por mojones' } as const;

export function TopographyPanel({ topo }: { topo: Topography }) {
  const { geo } = topo;
  const [secs, setSecs] = useState(String(geo?.gpsSeconds ?? 30));
  useEffect(() => setSecs(String(geo?.gpsSeconds ?? 30)), [geo?.gpsSeconds]);

  return (
    <Accordion title="Configuración · Topografía" icon="map-marker-radius" defaultOpen>
      {!geo ? (
        <Text style={styles.text}>El proyecto todavía no tiene sistema de coordenadas.</Text>
      ) : (
        <View>
          <Kv k="Sistema" v={`${crsDef(geo.crs).short} (${geo.crs})`} />
          <Kv k="Amarre" v={METHOD[geo.method]} />
          {topo.georef ? (
            <>
              <Kv k="Origen N" v={`${formatMeters(geo.origin.n)} m`} />
              <Kv k="Origen E" v={`${formatMeters(geo.origin.e)} m`} />
              <Kv k="Azimut eje Y" v={`${azimuthDegrees(geo.rotation).toFixed(4)}°`} />
              <Kv k="Escala" v={geo.scale.toFixed(6)} />
              <Kv k="Convergencia" v={`${meridianConvergence(workingCrs(geo.crs), geo.origin).toFixed(4)}°`} />
            </>
          ) : null}
          <Kv k="Cota Nivel 0" v={`${formatMeters(geo.z0)} msnm`} />
          {geo.rmse !== undefined ? <Kv k="RMSE" v={`${(geo.rmse * 100).toFixed(1)} cm`} /> : null}
          {geo.residuals?.map((r) => (
            <Kv key={r.id} k={`  ${r.id}`} v={`ΔN ${(r.dn * 100).toFixed(1)} · ΔE ${(r.de * 100).toFixed(1)} cm`} />
          ))}
          <Kv k="Mojones" v={`${topo.benchmarks.length} (${topo.controlCount} de control)`} />
          <View style={styles.gps}>
            <Field
              numeric
              label="Promedio del GPS"
              unit="s"
              value={secs}
              onChange={(v) => {
                setSecs(v);
                const n = parseNum(v);
                if (n !== null && n >= 5 && n <= 600) topo.setGpsSeconds(n);
              }}
            />
          </View>
        </View>
      )}
      <View style={styles.actions}>
        <ActionButton label={geo ? 'Reconfigurar amarre' : 'Configurar'} icon="map-marker-radius" onPress={topo.openSetup} />
        <ActionButton label="Tabla de coordenadas" icon="table" variant="secondary" onPress={topo.openCoords} />
      </View>
    </Accordion>
  );
}

const styles = StyleSheet.create({
  text: { ...type.body, color: colors.textSecondary },
  gps: { marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
