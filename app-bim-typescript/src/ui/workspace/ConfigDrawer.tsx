// =============================================================================
// ConfigDrawer — Cajón de configuración (derecha)
// Portado de: polylive-mockup/js/components/config-drawer.js
// =============================================================================
//
// Todas las secciones escriben en el mismo workspaceStore que los FABs y las
// herramientas de esquina: un cambio aquí se ve al instante en todas partes.
// =============================================================================

import React from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import {
  CANVAS_THEMES,
  FILTERS_PLAN,
  LAYERS,
  VIEWS_PLAN,
  ZoomAction,
} from '../../application/workspace/catalog';
import { Accordion, SideDrawer, TagToggle, Tappable, Icon } from '../primitives';
import { colors, radius, spacing } from '../design/tokens';
import { type } from '../design/typography';

export interface FileInfo {
  project: string;
  projectCode: string;
  space: string;
  operator: string;
  walls: number;
  objects: number;
  area: string;
}

export interface ConfigDrawerProps {
  top: number;
  info: FileInfo;
  zoomPercent: number;
  onZoom: (action: ZoomAction) => void;
}

export const ConfigDrawer = React.memo(function ConfigDrawer({ top, info, zoomPercent, onZoom }: ConfigDrawerProps) {
  const s = useStore(workspaceStore);
  const open = s.currentPanel === 'configDrawer';
  const ws = workspaceStore.getState;

  return (
    <SideDrawer open={open} onClose={() => ws().closePanels()} side="right" top={top}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Accordion title="Datos del archivo" icon="file-document-outline" defaultOpen>
          <Row label="Proyecto" value={`${info.project} · ${info.projectCode}`} />
          <Row label="Espacio" value={info.space} />
          <Row label="Operador" value={info.operator} />
          <Row label="Muros" value={String(info.walls)} />
          <Row label="Objetos" value={String(info.objects)} />
          <Row label="Área cerrada" value={info.area} />
        </Accordion>

        <Accordion title="Vista y capas" icon="layers-triple-outline">
          <Group label="Vista">
            {VIEWS_PLAN.map((v) => (
              <TagToggle key={v.id} role="radio" label={v.label} on={s.view === v.id} onPress={() => ws().setView(v.id)} />
            ))}
          </Group>
          <Group label="Filtros">
            {FILTERS_PLAN.map((f) => (
              <TagToggle key={f.id} label={f.label} on={s.filters[f.id]} onPress={() => ws().toggleFilter(f.id)} />
            ))}
          </Group>
          <Group label="Capas">
            {LAYERS.map((l) => (
              <TagToggle key={l.id} label={l.label} on={s.layers[l.id]} onPress={() => ws().toggleLayer(l.id)} />
            ))}
          </Group>
        </Accordion>

        <Accordion title="Zoom" icon="magnify">
          <Text style={styles.big}>{Math.round(zoomPercent)}%</Text>
          <View style={styles.tags}>
            <Action icon="fit-to-screen-outline" label="Encuadre" onPress={() => onZoom('zoomFit')} />
            <Action icon="magnify-minus-outline" label="Alejar" onPress={() => onZoom('zoomOut')} />
            <Action icon="magnify-plus-outline" label="Acercar" onPress={() => onZoom('zoomIn')} />
          </View>
        </Accordion>

        <Accordion title="Snap" icon="magnet">
          <View style={styles.tags}>
            <TagToggle label="Nodo" on={s.snap.node} onPress={() => ws().toggleSnap('node')} />
            <TagToggle label="Ángulo" on={s.snap.angle} onPress={() => ws().toggleSnap('angle')} />
          </View>
        </Accordion>

        <Accordion title="Tema del lienzo" icon="theme-light-dark">
          <View style={styles.tags}>
            {CANVAS_THEMES.map((t) => (
              <TagToggle key={t.id} role="radio" icon={t.icon} label={t.label} on={s.canvasTheme === t.id} onPress={() => ws().setCanvasTheme(t.id)} />
            ))}
          </View>
        </Accordion>

        <Accordion title="Cuadrícula" icon="grid">
          <View style={styles.tags}>
            <TagToggle label="Líneas" on={s.grid.lines} onPress={() => ws().toggleGrid('lines')} />
            <TagToggle label="Puntos" on={s.grid.dots} onPress={() => ws().toggleGrid('dots')} />
          </View>
        </Accordion>

        <Accordion title="Escala" icon="ruler-square-compass">
          <View style={styles.tags}>
            <TagToggle label="Acotado" on={s.scale.dimensioned} onPress={() => ws().toggleScale('dimensioned')} />
            <TagToggle label="Anotativa" on={s.scale.annotative} onPress={() => ws().toggleScale('annotative')} />
          </View>
          <View style={styles.scaleRow}>
            <Text style={styles.label}>Escala 1:</Text>
            <TextInput
              style={styles.input}
              value={s.scale.denominator}
              keyboardType="number-pad"
              onChangeText={(t) => ws().setScaleDenominator(t)}
              accessibilityLabel="Denominador de escala"
            />
          </View>
        </Accordion>
      </ScrollView>
    </SideDrawer>
  );
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.tags}>{children}</View>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  return (
    <Tappable onPress={onPress} style={styles.action} accessibilityLabel={label}>
      <Icon name={icon} size={16} color={colors.text} />
      <Text style={styles.actionText}>{label}</Text>
    </Tappable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 2 },
  label: { ...type.label, color: colors.textSecondary },
  rowValue: { ...type.body, color: colors.text, flexShrink: 1, textAlign: 'right' },
  group: { gap: spacing.xs, marginBottom: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  big: { ...type.title, color: colors.text },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 32,
  },
  actionText: { ...type.label, color: colors.text },
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  input: {
    ...type.body,
    width: 80,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    color: colors.text,
  },
});
