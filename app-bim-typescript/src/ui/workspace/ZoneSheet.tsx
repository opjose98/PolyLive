// =============================================================================
// ZoneSheet.tsx — Propiedades de un recinto (nombre, uso, notas y áreas)
// =============================================================================
//
// El recinto es un modelo con identidad (T0): lo que se escribe aquí queda
// guardado aunque los muros se muevan. Las áreas son de solo lectura (las
// definen los muros): la neta, a cara interior, es la que se usa en Revit y
// en cuantificación; la al eje se muestra como referencia.
// =============================================================================

import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { TextField, ReadonlyRow, NumberField } from '../components/fields';
import { ActionButton, Chip } from '../primitives';
import { themedStyles } from '../design/theme';
import { spacing } from '../design/tokens';
import { type } from '../design/typography';
import { zoneCode } from '../../domain/objects/zone';
import type { DetectedRoom } from '../../application/editor/EditorController';
import type { ClosureCheck } from '../../domain/topology/closure';

/** Usos frecuentes en vivienda y oficina: un toque en vez de escribir. */
export const ZONE_USES = ['Sala', 'Comedor', 'Cocina', 'Dormitorio', 'Baño', 'Estudio', 'Oficina', 'Circulación', 'Depósito', 'Patio'];

export interface ZoneSheetProps {
  zone: DetectedRoom;
  levelName?: string;
  editable: boolean;
  onEdit: (edit: { name?: string; use?: string; notes?: string }) => void;
  /** Suelo del recinto (F6a): espesor en m, o `null` si no tiene. */
  floorThickness: number | null;
  onAddFloor: () => void;
  onRemoveFloor: () => void;
  onFloorThickness: (m: number) => void;
  /** Control de cierre: diagonal del modelo y última diagonal medida. */
  diagonal?: { model: number; check: ClosureCheck | null } | null;
  onDiagonal?: (measured: number) => void;
}

export function ZoneSheet({ zone, levelName, editable, onEdit, floorThickness, onAddFloor, onRemoveFloor, onFloorThickness, diagonal, onDiagonal }: ZoneSheetProps) {
  const styles = useStyles();
  const m2 = (v?: number) => (v === undefined ? '—' : `${v.toFixed(2)} m²`);
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.code}>{zone.number !== undefined ? zoneCode({ number: zone.number }) : 'Recinto'}</Text>
      <TextField label="Nombre" value={zone.name ?? ''} disabled={!editable} commitOn="blur" onCommit={(name) => onEdit({ name })} />
      <TextField label="Uso" value={zone.use ?? ''} disabled={!editable} commitOn="blur" onCommit={(use) => onEdit({ use })} />
      {editable ? (
        <View style={styles.chips}>
          {ZONE_USES.map((u) => (
            <Chip key={u} label={u} active={zone.use === u} onPress={() => onEdit({ use: u, ...(zone.name?.startsWith('Recinto ') && { name: u }) })} />
          ))}
        </View>
      ) : null}
      <ReadonlyRow label="Área neta (cara interior)" value={m2(zone.netArea)} />
      <ReadonlyRow label="Perímetro neto" value={zone.perimeter === undefined ? '—' : `${zone.perimeter.toFixed(2)} m`} />
      <ReadonlyRow label="Área al eje de muros" value={m2(zone.area)} />
      {levelName ? <ReadonlyRow label="Nivel" value={levelName} /> : null}
      <Text style={styles.section}>Suelo</Text>
      {floorThickness !== null ? (
        <>
          <NumberField
            label="Espesor del suelo"
            unit="cm"
            decimals={0}
            min={1}
            max={100}
            value={Math.round(floorThickness * 100)}
            disabled={!editable}
            onCommit={(cm) => onFloorThickness(cm / 100)}
          />
          {editable ? <ActionButton label="Quitar suelo" variant="secondary" onPress={onRemoveFloor} /> : null}
        </>
      ) : editable ? (
        <ActionButton label="Poner suelo" onPress={onAddFloor} />
      ) : (
        <ReadonlyRow label="Suelo" value="Sin suelo" />
      )}
      {diagonal ? (
        <>
          <Text style={styles.section}>Control de cierre</Text>
          <ReadonlyRow label="Diagonal del modelo (cara interior)" value={`${diagonal.model.toFixed(3)} m`} />
          {editable && onDiagonal ? (
            <NumberField
              label="Diagonal medida en obra"
              unit="m"
              decimals={3}
              min={0.1}
              max={200}
              value={diagonal.check?.measured ?? Number(diagonal.model.toFixed(3))}
              onCommit={onDiagonal}
            />
          ) : null}
          {diagonal.check ? (
            <Text style={[styles.closure, diagonal.check.ok ? styles.ok : styles.bad]}>
              {diagonal.check.ok ? 'Cierra' : 'No cierra: revisa las medidas'} · error {(diagonal.check.error * 100).toFixed(1)} cm ·
              tolerancia ±{(diagonal.check.tolerance * 100).toFixed(1)} cm
            </Text>
          ) : (
            <Text style={styles.hint}>Mide en obra la diagonal más larga (esquina a esquina interior) para verificar el cierre.</Text>
          )}
        </>
      ) : null}
      <TextField label="Notas" value={zone.notes ?? ''} multiline disabled={!editable} commitOn="blur" onCommit={(n) => onEdit({ notes: n })} />
    </ScrollView>
  );
}

const useStyles = themedStyles((colors) => ({
  body: { padding: spacing.lg, gap: spacing.md },
  code: { ...type.title, color: colors.accentText },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  section: { ...type.label, color: colors.textSecondary, marginTop: spacing.sm },
  closure: { ...type.body },
  ok: { color: colors.success },
  bad: { color: colors.error },
  hint: { ...type.caption, color: colors.textSecondary },
}));
