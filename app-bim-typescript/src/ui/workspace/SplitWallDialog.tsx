// =============================================================================
// SplitWallDialog.tsx — Partir el muro seleccionado en un punto (H-74)
// =============================================================================
//
// El punto se da como distancia desde el arranque (A) del muro: en una culata,
// la distancia a la cumbrera que trae el plano. Cada vano va al tramo donde cae
// su centro y las mediciones del muro quedan en los dos tramos.
// =============================================================================

import React, { useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { ActionButton } from '../primitives';
import { NumberField } from '../components/fields';
import { MIN_SPLIT_PIECE } from '../../domain/objects/wall-split';
import { themedStyles } from '../design/theme';
import { radius, spacing } from '../design/tokens';
import { type } from '../design/typography';

interface SplitWallDialogProps {
  open: boolean;
  /** Longitud del muro seleccionado. */
  length: number;
  onClose: () => void;
  onApply: (distance: number) => void;
}

export function SplitWallDialog({ open, length, onClose, onApply }: SplitWallDialogProps) {
  const styles = useStyles();
  // Se monta al abrir (ver SurveyScreen): arranca siempre en la mitad del muro.
  const [value, setValue] = useState(() => Number((length / 2).toFixed(3)));
  // Lo tecleado y aún sin confirmar (cerrar el teclado con Atrás no confirma el campo).
  const draft = useRef<number | null>(null);
  const min = MIN_SPLIT_PIECE;
  const max = length - MIN_SPLIT_PIECE;
  return (
    <Modal visible={open} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.scrim}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Partir muro</Text>
          <Text style={styles.body}>
            Distancia desde el inicio (A) del muro de {length.toFixed(3)} m. Cada vano pasa al tramo donde cae su centro
            y las mediciones quedan en los dos. En una culata, parte en la cumbrera y ajusta el tope de ese punto en
            cada tramo.
          </Text>
          <NumberField
            label="Desde el inicio"
            unit="m"
            decimals={3}
            min={min}
            max={max}
            value={value}
            onCommit={(v) => {
              draft.current = null;
              setValue(v);
            }}
            onDraft={(v) => (draft.current = v)}
          />
          <View style={styles.actions}>
            <ActionButton label="Cancelar" variant="secondary" onPress={onClose} />
            <ActionButton
              label="Partir"
              onPress={() => {
                const typed = draft.current;
                const final = typed !== null && typed >= min && typed <= max ? typed : value;
                draft.current = null;
                onClose();
                onApply(final);
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
}));
