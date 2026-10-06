// =============================================================================
// MeasureDialog.tsx — Ingresar la medida de un muro (cara interior / exterior / eje)
// =============================================================================
//
// La medida se aplica de cara a cara (docs/24): el muro se ajusta para que la
// cara elegida mida lo ingresado, los muros unidos lo acompañan y la medida
// queda registrada con su referencia.
// =============================================================================

import React, { useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { ActionButton, TagToggle } from '../primitives';
import { NumberField } from '../components/fields';
import type { MeasureReference } from '../../domain/objects/measurement';
import { themedStyles } from '../design/theme';
import { radius, spacing } from '../design/tokens';
import { type } from '../design/typography';

export interface MeasureDialogProps {
  open: boolean;
  /** Longitudes actuales del muro elegido (para ver qué se corrige). */
  faces: { axis: number; interior: number | null; exterior: number | null } | null;
  onClose: () => void;
  onApply: (value: number, reference: MeasureReference) => void;
}

const LABEL: Record<MeasureReference, string> = { interior: 'Cara interior', exterior: 'Cara exterior', axis: 'Eje' };
const m = (v: number | null) => (v != null ? `${v.toFixed(3)} m` : '—');

export function MeasureDialog({ open, faces, onClose, onApply }: MeasureDialogProps) {
  const styles = useStyles();
  const [value, setValue] = useState(3);
  // Por defecto, de cara interior a cara interior: lo que mide un láser dentro de un recinto.
  const [reference, setReference] = useState<MeasureReference>('interior');
  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Medida del muro</Text>
          <Text style={styles.body}>
            Qué mediste: el muro se ajusta para que esa cara mida lo ingresado (los muros unidos lo acompañan) y la
            medida queda registrada.
          </Text>
          <View style={styles.refs}>
            {(['interior', 'exterior', 'axis'] as const).map((r) => (
              <TagToggle key={r} role="radio" label={LABEL[r]} on={reference === r} onPress={() => setReference(r)} />
            ))}
          </View>
          {faces ? (
            <Text style={styles.body}>
              Hoy: interior {m(faces.interior)} · exterior {m(faces.exterior)} · eje {m(faces.axis)}
            </Text>
          ) : null}
          <NumberField label="Distancia" unit="m" decimals={3} min={0.01} max={200} value={value} onCommit={setValue} />
          <View style={styles.actions}>
            <ActionButton label="Cancelar" variant="secondary" onPress={onClose} />
            <ActionButton
              label="Guardar"
              onPress={() => {
                onClose();
                onApply(value, reference);
              }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = themedStyles((colors) => ({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: spacing.xl },
  dialog: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.text },
  body: { ...type.body, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.sm },
  refs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
}));
