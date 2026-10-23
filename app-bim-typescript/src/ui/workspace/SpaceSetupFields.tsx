// =============================================================================
// SpaceSetupFields — Niveles y fases al crear un espacio (docs/23 § 7)
// =============================================================================
//
// Formulario controlado sobre `SpaceSetup`: los niveles llegan con la plantilla
// (Piso · Muro · Viga · Cubierta) y se editan aquí, o se copian de otro espacio.
// Cada fila es nombre + cota; la primera es la base y su cota es 0.
// =============================================================================

import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import type { SpaceSetup } from '../../application/projects/spaceSetup';
import { LEVEL_TEMPLATE } from '../../domain/objects/marker';
import { NumberField, TextField } from '../components/fields';
import { ActionButton } from '../primitives';
import { spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles } from '../design/theme';

/** Un espacio del que se pueden copiar niveles y fases. */
export interface SetupSource {
  readonly key: string;
  readonly label: string;
}

export function SpaceSetupFields({
  value,
  onChange,
  sources,
  onCopyFrom,
}: {
  value: SpaceSetup;
  onChange: (next: SpaceSetup) => void;
  sources: readonly SetupSource[];
  onCopyFrom: (key: string) => void;
}) {
  const styles = useStyles();
  const setLevel = (i: number, patch: Partial<SpaceSetup['levels'][number]>) =>
    onChange({ ...value, levels: value.levels.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setPhase = (i: number, name: string) => onChange({ ...value, phases: value.phases.map((p, j) => (j === i ? name : p)) });
  const nextValue = Math.max(0, ...value.levels.map((l) => l.value)) + 1;

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Niveles</Text>
      {value.levels.map((l, i) => (
        // La clave lleva la cota: al usar la plantilla o copiar, las filas se rehacen.
        <View key={`${i}:${l.name}:${l.value}`} style={styles.row}>
          <View style={styles.name}>
            <TextField label={i === 0 ? 'Base' : `Nivel ${i}`} value={l.name} onCommit={(name) => setLevel(i, { name })} />
          </View>
          <View style={styles.value}>
            <NumberField label="Cota" unit="m" decimals={2} value={l.value} disabled={i === 0} onCommit={(v) => setLevel(i, { value: v })} />
          </View>
          {i > 0 ? (
            <TouchableOpacity
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel={`Quitar nivel ${l.name}`}
              onPress={() => onChange({ ...value, levels: value.levels.filter((_, j) => j !== i) })}
            >
              <Text style={styles.removeText}>Quitar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      <View style={styles.actions}>
        <ActionButton label="+ Nivel" variant="secondary" onPress={() => onChange({ ...value, levels: [...value.levels, { name: 'Nivel', value: nextValue }] })} />
        <ActionButton label="Plantilla" variant="secondary" onPress={() => onChange({ ...value, levels: [...LEVEL_TEMPLATE] })} />
      </View>

      <Text style={styles.section}>Fases</Text>
      {value.phases.map((p, i) => (
        <View key={`${i}:${p}`} style={styles.row}>
          <View style={styles.name}>
            <TextField label={i === 0 ? 'Base' : `Fase ${i}`} value={p} onCommit={(name) => setPhase(i, name)} />
          </View>
          {i > 0 ? (
            <TouchableOpacity
              style={styles.remove}
              accessibilityRole="button"
              accessibilityLabel={`Quitar fase ${p}`}
              onPress={() => onChange({ ...value, phases: value.phases.filter((_, j) => j !== i) })}
            >
              <Text style={styles.removeText}>Quitar</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      <View style={styles.actions}>
        <ActionButton label="+ Fase" variant="secondary" onPress={() => onChange({ ...value, phases: [...value.phases, `Fase ${value.phases.length}`] })} />
      </View>

      {sources.length ? (
        <>
          <Text style={styles.section}>Copiar niveles y fases de</Text>
          {sources.map((s) => (
            <TouchableOpacity key={s.key} style={styles.source} accessibilityRole="button" onPress={() => onCopyFrom(s.key)}>
              <Text style={styles.sourceText} numberOfLines={1}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </>
      ) : null}
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  wrap: { gap: spacing.sm },
  section: { ...type.bodyStrong, color: colors.text, marginTop: spacing.sm },
  row: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, gap: spacing.sm },
  name: { flex: 2 },
  value: { flex: 1 },
  remove: { minHeight: 44, justifyContent: 'center' as const, paddingHorizontal: spacing.xs },
  removeText: { ...type.body, color: colors.error },
  actions: { flexDirection: 'row' as const, gap: spacing.sm },
  source: { minHeight: 44, justifyContent: 'center' as const, borderBottomWidth: 1, borderBottomColor: colors.border },
  sourceText: { ...type.body, color: colors.accentText },
}));
