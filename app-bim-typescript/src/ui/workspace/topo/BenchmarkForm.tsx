// =============================================================================
// BenchmarkForm — Nombre del mojón y, si se digita, sus coordenadas
// =============================================================================
//
// Dos usos:
//   - `mode="name"`: el mojón ya tiene posición (tocado o GPS); se pide nombre
//     y descripción, mostrando las coordenadas que tendrá.
//   - `mode="typed"`: se digitan coordenadas planas (E/N) del sistema del
//     proyecto o geográficas (lat/long), y la cota.
// =============================================================================

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ActionButton, BottomSheet, Chip, toast } from '../../primitives';
import { CrsId, GridPoint, LatLon, crsDef, workingCrs } from '../../../domain/geo/crs';
import { Field, Kv, Row, parseNum } from './TopoFields';
import { spacing } from '../../design/tokens';
import { type } from '../../design/typography';
import { themedStyles } from '../../design/theme';

export interface BenchmarkFormResult {
  name: string;
  description?: string;
  /** Solo en `typed`. */
  known?: GridPoint | LatLon;
  h?: number | null;
}

export function BenchmarkForm({
  open,
  mode,
  crs,
  defaultName,
  preview,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: 'name' | 'typed';
  crs: CrsId;
  defaultName: string;
  /** Líneas de coordenadas que tendrá el mojón (modo `name`). */
  preview?: readonly [string, string][];
  onSubmit: (r: BenchmarkFormResult) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const [name, setName] = useState(defaultName);
  const [desc, setDesc] = useState('');
  const [geographic, setGeographic] = useState(crsDef(crs).kind === 'geographic');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [h, setH] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setDesc('');
    setA('');
    setB('');
    setH('');
    setGeographic(crsDef(crs).kind === 'geographic');
  }, [open, defaultName, crs]);

  const submit = () => {
    if (mode === 'name') {
      onSubmit({ name: name.trim() || defaultName, description: desc.trim() || undefined });
      return;
    }
    const x = parseNum(a);
    const y = parseNum(b);
    if (x === null || y === null) {
      toast('Faltan coordenadas', { kind: 'warning' });
      return;
    }
    if (geographic && (Math.abs(x) > 90 || Math.abs(y) > 180)) {
      toast('Latitud entre −90 y 90, longitud entre −180 y 180', { kind: 'warning' });
      return;
    }
    onSubmit({
      name: name.trim() || defaultName,
      description: desc.trim() || undefined,
      known: geographic ? { lat: x, lon: y } : { e: x, n: y },
      h: parseNum(h),
    });
  };

  const plane = crsDef(workingCrs(crs));

  return (
    <BottomSheet open={open} onClose={onClose} heightRatio={0.72}>
      <ScrollView contentContainerStyle={styles.root} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{mode === 'typed' ? 'Mojón por coordenadas' : 'Nuevo mojón'}</Text>
        <Field label="Nombre" value={name} onChange={setName} placeholder="M-1" />
        <Field label="Descripción (opcional)" value={desc} onChange={setDesc} placeholder="Placa de bronce, andén norte" />
        {mode === 'name' && preview?.length ? (
          <View style={styles.preview}>
            {preview.map(([k, v]) => (
              <Kv key={k} k={k} v={v} />
            ))}
          </View>
        ) : null}
        {mode === 'typed' ? (
          <>
            <Row>
              <Chip label={`Planas · ${plane.short}`} active={!geographic} onPress={() => setGeographic(false)} />
              <Chip label="Lat / Long" active={geographic} onPress={() => setGeographic(true)} />
            </Row>
            <Row>
              <Field flex numeric label={geographic ? 'Latitud (°)' : 'Norte'} value={geographic ? a : b} onChange={geographic ? setA : setB} unit={geographic ? '°' : 'm'} />
              <Field flex numeric label={geographic ? 'Longitud (°)' : 'Este'} value={geographic ? b : a} onChange={geographic ? setB : setA} unit={geographic ? '°' : 'm'} />
            </Row>
            <Field numeric label="Cota (msnm, opcional)" value={h} onChange={setH} unit="m" />
            <Text style={styles.hint}>
              {geographic ? 'Grados decimales, MAGNA-SIRGAS (p. ej. 4.598123 y −74.076234).' : `Coordenadas planas ${plane.name}.`}
            </Text>
          </>
        ) : null}
        <Row>
          <ActionButton label="Cancelar" variant="secondary" onPress={onClose} />
          <ActionButton label="Crear mojón" icon="map-marker-star-outline" onPress={submit} />
        </Row>
      </ScrollView>
    </BottomSheet>
  );
}

const useStyles = themedStyles((colors) => ({
  root: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
  title: { ...type.title, color: colors.text },
  preview: { backgroundColor: colors.background, borderRadius: 8, padding: spacing.md },
  hint: { ...type.caption, color: colors.textSecondary },
}));
