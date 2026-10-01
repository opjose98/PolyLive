// =============================================================================
// CoordinatesSheet — Tabla de mojones y vértices con coordenadas reales
// =============================================================================
//
// Mojones del proyecto (con Colocar / Quitar), los de la biblioteca que se
// pueden enlazar y los vértices de los muros de este espacio. Planas (N/E)
// o geográficas según el selector.
// =============================================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { BottomSheet, Chip, IconButton, Tappable } from '../../primitives';
import { coordinateRows, gridName } from '../../../application/geo/coordinateText';
import type { Point2D } from '../../../domain/geometry/types';
import type { Topography } from './useTopography';
import { Row } from './TopoFields';
import { colors, radius, spacing } from '../../design/tokens';
import { type } from '../../design/typography';

const TOPO = '#2E7D32';

export function CoordinatesSheet({ topo, vertices }: { topo: Topography; vertices: readonly Point2D[] }) {
  const { geo, display } = topo;
  return (
    <BottomSheet open={topo.coordsOpen} onClose={topo.closeCoords} heightRatio={0.8}>
      <ScrollView contentContainerStyle={styles.root}>
        <Text style={styles.title}>Coordenadas</Text>
        <Row>
          <Chip label={`Planas · ${gridName(geo)}`} active={display === 'grid'} onPress={() => topo.setDisplay('grid')} />
          {topo.georef ? <Chip label="Lat / Long" active={display === 'latlon'} onPress={() => topo.setDisplay('latlon')} /> : null}
        </Row>
        {!topo.georef ? <Text style={styles.hint}>Sin amarre: se muestran las coordenadas locales del dibujo.</Text> : null}

        <Text style={styles.section}>Mojones del proyecto ({topo.benchmarks.length})</Text>
        {topo.benchmarks.length === 0 ? <Text style={styles.hint}>Crea mojones con el FAB + → Puntos.</Text> : null}
        {topo.benchmarks.map((b) => {
          const pos = topo.positionOf(b);
          const rows = coordinateRows(topo.benchmarkReal(b), pos?.p ?? null, display);
          const placed = !!b.local && !!pos?.placed;
          return (
            <Tappable
              key={b.id}
              style={[styles.card, topo.selectedBenchmark?.id === b.id && styles.cardOn]}
              onPress={() => {
                topo.selectBenchmark(b.id);
                topo.closeCoords();
              }}
              accessibilityRole="button"
            >
              <View style={styles.cardHead}>
                <Text style={styles.name}>{b.name}</Text>
                <Text style={[styles.badge, placed && b.latLon ? styles.badgeOn : null]}>
                  {placed && b.latLon ? 'control' : placed ? 'solo local' : 'sin colocar'}
                </Text>
                <IconButton variant="plain" size={36} icon="map-marker-down" label={`Colocar ${b.name}`} onPress={() => topo.benchmarkActions.place(b)} />
                <IconButton variant="plain" size={36} icon="link-variant-off" label={`Quitar ${b.name}`} onPress={() => topo.benchmarkActions.unlink(b)} />
              </View>
              {b.description ? <Text style={styles.hint}>{b.description}</Text> : null}
              {rows.map(([k, v]) => (
                <View key={k} style={styles.kv}>
                  <Text style={styles.k}>{k}</Text>
                  <Text style={styles.v} selectable>
                    {v}
                  </Text>
                </View>
              ))}
              <Text style={styles.meta}>
                {sourceLabel(b.source)}
                {b.accuracy ? ` ±${b.accuracy.toFixed(1)} m` : ''}
              </Text>
            </Tappable>
          );
        })}

        {topo.library.length ? (
          <>
            <Text style={styles.section}>Biblioteca (otros proyectos)</Text>
            {topo.library.map((b) => (
              <View key={b.id} style={[styles.card, styles.cardHead]}>
                <Text style={[styles.name, { flex: 1 }]}>{b.name}</Text>
                <IconButton variant="plain" size={36} icon="link-variant-plus" label={`Agregar ${b.name}`} onPress={() => topo.benchmarkActions.link(b)} />
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.section}>Vértices de este espacio ({vertices.length})</Text>
        {vertices.map((p, i) => {
          const rows = coordinateRows(topo.realOf(p), p, display);
          return (
            <View key={i} style={styles.vertex}>
              <Text style={styles.vName}>V{i + 1}</Text>
              <Text style={styles.vText} selectable>
                {rows.map(([, v]) => v).join('   ')}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const sourceLabel = (s: string) => ({ tap: 'Tocado en el dibujo', typed: 'Digitado', gps: 'GPS promediado', import: 'Importado' })[s] ?? s;

const styles = StyleSheet.create({
  root: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  title: { ...type.title, color: colors.text },
  section: { ...type.heading, color: colors.text, marginTop: spacing.md },
  hint: { ...type.caption, color: colors.textSecondary },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md, gap: 2 },
  cardOn: { borderColor: TOPO },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  name: { ...type.bodyStrong, color: colors.text },
  badge: { ...type.caption, color: colors.textSecondary, flex: 1 },
  badgeOn: { color: TOPO },
  kv: { flexDirection: 'row', justifyContent: 'space-between' },
  k: { ...type.label, color: colors.textSecondary },
  v: { ...type.bodyStrong, color: colors.text },
  meta: { ...type.caption, color: colors.textSecondary },
  vertex: { flexDirection: 'row', gap: spacing.sm, paddingVertical: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  vName: { ...type.label, color: TOPO, width: 32 },
  vText: { ...type.caption, color: colors.text, flex: 1 },
});
