// =============================================================================
// DraftSheets — Elemento de dibujo seleccionado y diálogo de texto (F6b)
// =============================================================================

import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BottomSheet, ActionButton, toast } from '../../primitives';
import { NumberField, ReadonlyRow, TextField } from '../../components/fields';
import { DraftItem, itemLength, polygonMetrics } from '../../../domain/drafting/drafting';
import { spacing } from '../../design/tokens';
import { type } from '../../design/typography';
import { themedStyles } from '../../design/theme';
import { haptic } from '../../design/haptics';
import type { Drafting } from './useDrafting';

const KIND_LABEL: Record<DraftItem['kind'], string> = {
  dimension: 'Cota',
  text: 'Texto',
  tag: 'Etiqueta',
  coordinate: 'Coordenada',
  line: 'Línea',
  polygon: 'Polígono',
  beam: 'Viga',
  truss: 'Cercha',
  purlin: 'Correa',
};

export function DraftSheets({ drafting, open, onClose }: { drafting: Drafting; open: boolean; onClose: () => void }) {
  const item = drafting.ctl.selected;
  const pending = drafting.state.pendingText;
  return (
    <>
      <BottomSheet open={open && !!item} onClose={onClose} heightRatio={0.55}>
        {item ? <ItemBody drafting={drafting} item={item} onClose={onClose} /> : null}
      </BottomSheet>
      <BottomSheet open={!!pending} onClose={() => drafting.ctl.cancelText()} heightRatio={0.4}>
        {pending ? <TextBody drafting={drafting} /> : null}
      </BottomSheet>
    </>
  );
}

function ItemBody({ drafting, item, onClose }: { drafting: Drafting; item: DraftItem; onClose: () => void }) {
  const styles = useStyles();
  const { ctl, editable } = drafting;
  const cmNum = (key: string, label: string, def: number) => (
    <NumberField
      label={label}
      unit="cm"
      decimals={0}
      min={1}
      max={500}
      value={Math.round((item.props[key] ?? def) * 100)}
      disabled={!editable}
      onCommit={(v) => void ctl.edit(item.id, { props: { [key]: v / 100 } })}
    />
  );
  const m = polygonMetrics(item.points);
  return (
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{KIND_LABEL[item.kind]}</Text>
      {['dimension', 'line', 'beam', 'truss'].includes(item.kind) ? <ReadonlyRow label="Longitud" value={`${itemLength(item).toFixed(3)} m`} /> : null}
      {item.kind === 'polygon' ? (
        <>
          <ReadonlyRow label="Área" value={`${m.area.toFixed(2)} m²`} />
          <ReadonlyRow label="Perímetro" value={`${m.perimeter.toFixed(2)} m`} />
          <ReadonlyRow label="Vértices" value={String(item.points.length)} />
        </>
      ) : null}
      {item.kind === 'text' || item.kind === 'tag' ? (
        <TextField label="Texto" value={item.text} multiline disabled={!editable} commitOn="blur" onCommit={(text) => void ctl.edit(item.id, { text })} />
      ) : null}
      {item.kind === 'text' ? (
        <NumberField
          label="Tamaño"
          unit="pt"
          decimals={0}
          min={6}
          max={48}
          value={item.props.size ?? 12}
          disabled={!editable}
          onCommit={(size) => void ctl.edit(item.id, { props: { size } })}
        />
      ) : null}
      {item.kind === 'dimension' ? cmNum('offset', 'Separación de la línea de cota', 0.4) : null}
      {item.kind === 'beam' || item.kind === 'purlin' ? (
        <>
          {cmNum('width', 'Base', item.kind === 'beam' ? 0.3 : 0.1)}
          {cmNum('depth', 'Peralte', item.kind === 'beam' ? 0.4 : 0.2)}
        </>
      ) : null}
      {item.kind === 'truss' ? cmNum('depth', 'Altura de la cercha', 0.6) : null}
      {editable ? (
        <ActionButton
          label="Borrar"
          variant="secondary"
          onPress={() => {
            haptic.destroy();
            onClose();
            void ctl.remove(item.id).then(() =>
              toast(`${KIND_LABEL[item.kind]} borrada`, { action: { label: 'Deshacer', onPress: () => void ctl.undo() } }),
            );
          }}
        />
      ) : (
        <Text style={styles.hint}>Para editar, cambia a Levantamiento.</Text>
      )}
    </ScrollView>
  );
}

function TextBody({ drafting }: { drafting: Drafting }) {
  const styles = useStyles();
  const pending = drafting.state.pendingText;
  const [text, setText] = useState(pending?.suggested ?? '');
  useEffect(() => setText(pending?.suggested ?? ''), [pending]);
  return (
    <View style={styles.body}>
      <Text style={styles.title}>{pending?.kind === 'tag' ? 'Etiqueta' : 'Texto en el plano'}</Text>
      <TextField label="Texto" value={text} multiline onCommit={setText} />
      <View style={styles.row}>
        <ActionButton label="Cancelar" variant="secondary" onPress={() => drafting.ctl.cancelText()} />
        <ActionButton label="Agregar" disabled={!text.trim()} onPress={() => void drafting.ctl.submitText(text)} />
      </View>
    </View>
  );
}

const useStyles = themedStyles((colors) => ({
  body: { padding: spacing.lg, gap: spacing.md },
  title: { ...type.title, color: colors.text },
  hint: { ...type.caption, color: colors.textSecondary },
  row: { flexDirection: 'row', gap: spacing.sm },
}));
