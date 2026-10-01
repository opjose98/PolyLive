// =============================================================================
// ElevationDetails — Hoja de detalles del alzado (bottom sheet)
// =============================================================================
//
// Lo que el lienzo no cuenta de un vistazo: superficies bruta/huecos/neta, las
// restricciones de nivel de cada extremo, el hueco seleccionado con todos sus
// campos y la lista de huecos. Portado de la antigua WallElevationScreen; la
// lógica vive en ElevationEditor.
// =============================================================================

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Tappable } from '../primitives';
import { NumberField, TextField, SegmentedField, ToggleRow, ReadonlyRow } from '../components/fields';
import { ActionButton } from '../primitives';
import { ElevationEditor, ElevationEditorState } from '../../application/elevation/ElevationEditor';
import { describeExtent } from '../../application/workspace/constraintModel';
import { isRectangularProfile, VerticalExtent } from '../../domain/objects/vertical';
import { ProjectMarker } from '../../domain/objects/marker';
import { OpeningType, openingTop, openingTypeLabel } from '../../domain/objects/wall-elevation';
import { colors, radius, spacing } from '../design/tokens';
import { type } from '../design/typography';

const TYPES: readonly { value: OpeningType; label: string }[] = [
  { value: 'door', label: 'Puerta' },
  { value: 'window', label: 'Ventana' },
  { value: 'opening', label: 'Hueco' },
];

export function ElevationDetails({
  editor,
  state,
  levels,
  onPropagate,
}: {
  editor: ElevationEditor;
  state: ElevationEditorState;
  levels: readonly ProjectMarker[];
  onPropagate: () => void;
}) {
  const { elevation, wall, vertical, profile, busy } = state;
  if (!elevation || !wall || !vertical) return null;
  const q = editor.quantification;
  const sel = editor.selected;
  const L = editor.wallLength;
  const list = levels.map((m) => ({ id: m.id, name: m.name, value: m.value }));
  const sloped = profile ? !isRectangularProfile(profile) : false;
  const severity = editor.severityByOpening;

  const withHeight = (e: VerticalExtent, h: number): VerticalExtent => ({
    ...e,
    topLevelId: null,
    topOffset: 0,
    unconnectedHeight: h,
  });
  const setHeight = (end: 'start' | 'end' | 'both', h: number) =>
    void editor.saveVertical({
      start: end === 'end' ? vertical.start : withHeight(vertical.start, h),
      end: end === 'start' ? vertical.end : withHeight(vertical.end, h),
    });
  const netHeight = (e: { base: number; top: number } | undefined) => (e ? e.top - e.base : (wall.height as number));

  return (
    <View style={styles.root}>
      {q ? (
        <View style={styles.card}>
          <Text style={styles.title}>Cuantificación</Text>
          <View style={styles.quantRow}>
            <Quant label="Bruta" value={Number(q.grossArea)} />
            <Quant label="Huecos" value={Number(q.openingArea)} />
            <Quant label="Neta" value={Number(q.netArea)} highlight />
          </View>
        </View>
      ) : null}

      {sel ? (
        <View style={styles.card}>
          <Text style={styles.title}>{openingTypeLabel(sel.type)} seleccionada</Text>
          <SegmentedField
            label="Tipo"
            value={sel.type}
            options={TYPES}
            disabled={busy}
            onChange={(t) => void editor.updateSelected({ type: t })}
          />
          <NumberField
            label="Posición desde el inicio (A)"
            unit="m"
            decimals={3}
            min={0}
            max={Math.max(0, L - sel.width)}
            value={sel.xOffset}
            disabled={busy}
            onCommit={(v) => void editor.updateSelected({ xOffset: v })}
          />
          <NumberField label="Ancho" unit="m" decimals={3} min={0.05} max={L} value={sel.width} disabled={busy} onCommit={(v) => void editor.updateSelected({ width: v })} />
          <NumberField
            label="Antepecho"
            unit="m"
            decimals={3}
            min={0}
            max={editor.maxHeight}
            value={sel.sillHeight}
            disabled={busy}
            onCommit={(v) => void editor.updateSelected({ sillHeight: v })}
            hint="0 en puertas. Altura del alféizar en ventanas."
          />
          <NumberField label="Alto" unit="m" decimals={3} min={0.05} max={editor.maxHeight} value={sel.height} disabled={busy} onCommit={(v) => void editor.updateSelected({ height: v })} />
          <ReadonlyRow label="Dintel" value={`${openingTop(sel).toFixed(3)} m`} />
          {sel.type === 'door' ? (
            <ToggleRow label="Invertir apertura" value={sel.isFlipped} onChange={(isFlipped) => void editor.updateSelected({ isFlipped })} />
          ) : null}
          <TextField
            label="Observaciones"
            value={sel.notes ?? ''}
            placeholder="p. ej. carpintería de aluminio, a sustituir"
            multiline
            disabled={busy}
            commitOn="blur"
            onCommit={(notes) => void editor.updateSelected({ notes })}
          />
          <ActionButton label="Eliminar hueco" variant="danger" onPress={() => void editor.removeSelected()} disabled={busy} />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.title}>Alturas del muro</Text>
        <ReadonlyRow label="Extremo A (inicio)" value={describeExtent(list, vertical.start)} />
        <ReadonlyRow label="Extremo B (fin)" value={describeExtent(list, vertical.end)} />
        {profile ? (
          <ReadonlyRow
            label="Cotas A · B"
            value={`${profile.start.base.toFixed(2)}→${profile.start.top.toFixed(2)} · ${profile.end.base.toFixed(2)}→${profile.end.top.toFixed(2)} m`}
          />
        ) : null}
        <Text style={styles.note}>
          {sloped ? 'Perfil no rectangular: en Revit es un muro con perfil editado. ' : ''}
          Los niveles de base y tope se eligen con el selector B/T de la planta. Escribir una altura aquí desconecta el tope de
          su nivel.
        </Text>
        {sloped ? (
          <>
            <NumberField label="Altura en A" unit="m" decimals={2} min={0.1} max={60} value={netHeight(profile?.start)} disabled={busy} onCommit={(v) => setHeight('start', v)} />
            <NumberField label="Altura en B" unit="m" decimals={2} min={0.1} max={60} value={netHeight(profile?.end)} disabled={busy} onCommit={(v) => setHeight('end', v)} />
          </>
        ) : (
          <NumberField label="Altura" unit="m" decimals={2} min={0.1} max={60} value={netHeight(profile?.start)} disabled={busy} onCommit={(v) => setHeight('both', v)} />
        )}
        <ActionButton label="Igualar niveles en los muros conectados" variant="secondary" onPress={onPropagate} disabled={busy} />
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Huecos ({elevation.openings.length})</Text>
        {elevation.openings.length === 0 ? (
          <Text style={styles.note}>Este muro todavía no tiene huecos. Usa el FAB + → Arquitectónico.</Text>
        ) : (
          elevation.openings.map((o) => {
            const sev = severity.get(o.id as string) ?? 'ok';
            return (
              <Tappable
                key={o.id as string}
                style={[styles.row, o.id === state.selectedId && styles.rowOn]}
                onPress={() => editor.select(o.id)}
                pressScale={0.98}
                haptic="select"
                accessibilityLabel={`Seleccionar ${openingTypeLabel(o.type)}`}
              >
                <Text style={styles.rowTitle}>
                  {openingTypeLabel(o.type)} · {o.width.toFixed(2)} × {o.height.toFixed(2)} m
                </Text>
                <Text style={[styles.note, sev === 'error' && styles.err, sev === 'warning' && styles.warn]}>
                  x = {o.xOffset.toFixed(2)} m · antepecho {o.sillHeight.toFixed(2)} m{sev !== 'ok' ? ` · ${sev === 'error' ? 'error' : 'aviso'}` : ''}
                </Text>
              </Tappable>
            );
          })
        )}
      </View>
    </View>
  );
}

function Quant({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={[styles.quant, highlight && styles.quantOn]}>
      <Text style={[styles.quantValue, highlight && styles.quantValueOn]}>{value.toFixed(2)}</Text>
      <Text style={[styles.quantLabel, highlight && styles.quantLabelOn]}>{label} (m²)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  title: { ...type.title, color: colors.text, marginBottom: spacing.xs },
  quantRow: { flexDirection: 'row', gap: spacing.sm },
  quant: { flex: 1, alignItems: 'center', paddingVertical: spacing.md, borderRadius: radius.sm, backgroundColor: colors.background },
  quantOn: { backgroundColor: colors.amber },
  quantValue: { ...type.title, color: colors.text },
  quantValueOn: { color: colors.textOnAccent },
  quantLabel: { ...type.caption, color: colors.textSecondary },
  quantLabelOn: { color: colors.textOnAccent },
  note: { ...type.caption, color: colors.textSecondary },
  row: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sm },
  rowOn: { backgroundColor: colors.amberSoft },
  rowTitle: { ...type.bodyStrong, color: colors.text },
  err: { color: colors.error },
  warn: { color: colors.warning },
});
