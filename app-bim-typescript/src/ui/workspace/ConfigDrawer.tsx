// =============================================================================
// ConfigDrawer — Cajón de configuración (derecha)
// Portado de: polylive-mockup/js/components/config-drawer.js
// =============================================================================
//
// Todas las secciones escriben en el mismo workspaceStore que los FABs y las
// herramientas de esquina: un cambio aquí se ve al instante en todas partes.
// =============================================================================

import React from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { useStore } from 'zustand';
import { workspaceStore } from '../../state/workspaceStore';
import {
  CANVAS_THEMES,
  LAYERS,
  WORK_MODES,
  ZoomAction,
  filtersFor,
  workModeDef,
} from '../../application/workspace/catalog';
import { selectWorkMode } from './FabView';
import { Accordion, SideDrawer, TagToggle, Tappable, Icon } from '../primitives';
import { radius, spacing } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles, useTheme } from '../design/theme';

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
  hasObjects?: boolean;
  /** Configuración propia del modo activo (topografía, actividades…), arriba de todo. */
  modeSection?: React.ReactNode;
}

/**
 * Sección del modo activo mientras su configuración no existe todavía
 * (M3 Avance, M4 Revisión). Topografía trae la suya (TopographyPanel). Levantamiento no la necesita.
 */
function ModePlaceholder({ mode }: { mode: import('../../application/workspace/catalog').WorkModeId }) {
  const styles = useStyles();
  if (mode === 'levantamiento') return null;
  const def = workModeDef(mode);
  const text: Record<string, string> = {
    avance: 'Catálogo de actividades, cortes de avance y reportes.',
    revision: 'Comentarios, estados y exportación para enviar.',
  };
  return (
    <Accordion title={`Configuración · ${def.label}`} icon={def.icon} defaultOpen>
      <Text style={styles.label}>{text[mode]}</Text>
      <Text style={styles.label}>Disponible en la siguiente fase.</Text>
    </Accordion>
  );
}

export const ConfigDrawer = React.memo(function ConfigDrawer({ top, info, zoomPercent, onZoom, hasObjects = true, modeSection }: ConfigDrawerProps) {
  const styles = useStyles();
  const s = useStore(workspaceStore);
  const open = s.currentPanel === 'configDrawer';
  const ws = workspaceStore.getState;

  return (
    <SideDrawer open={open} onClose={() => ws().closePanels()} side="right" top={top}>
      <ScrollView keyboardShouldPersistTaps="handled">
        {/* Drawer ⋮ = configuración CONTEXTUAL del proyecto: primero lo del modo activo. */}
        {modeSection ?? (
          <ModePlaceholder mode={s.workMode} />
        )}
        <Accordion title="Datos del archivo" icon="file-document-outline">
          <Row label="Proyecto" value={`${info.project} · ${info.projectCode}`} />
          <Row label="Espacio" value={info.space} />
          <Row label="Operador" value={info.operator} />
          <Row label="Muros" value={String(info.walls)} />
          <Row label="Objetos" value={String(info.objects)} />
          <Row label="Área cerrada" value={info.area} />
        </Accordion>

        <Accordion title="Modo y capas" icon="layers-triple-outline">
          <Group label="Modo">
            {WORK_MODES.filter((m) => !(m.planOnly && s.mode !== 'plan')).map((m) => (
              <TagToggle key={m.id} role="radio" icon={m.icon} label={m.label} on={s.workMode === m.id} onPress={() => selectWorkMode(m.id, hasObjects)} />
            ))}
          </Group>
          <Group label="Filtros">
            {filtersFor(s.workMode, s.mode).map((f) => (
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
            <TagToggle label="Vértice" on={s.snap.vertex} onPress={() => ws().toggleSnap('vertex')} />
            <TagToggle label="Punto medio" on={s.snap.midpoint} onPress={() => ws().toggleSnap('midpoint')} />
            <TagToggle label="Ángulo" on={s.snap.angle} onPress={() => ws().toggleSnap('angle')} />
          </View>
        </Accordion>

        <Accordion title="Tema (claro · oscuro · alto contraste)" icon="theme-light-dark">
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
            <TagToggle label="Rotación" on={s.grid.rotation} onPress={() => ws().toggleGrid('rotation')} />
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
  const styles = useStyles();
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
  const styles = useStyles();
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.tags}>{children}</View>
    </View>
  );
}

function Action({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const styles = useStyles();
  const colors = useTheme();
  return (
    <Tappable onPress={onPress} style={styles.action} accessibilityLabel={label}>
      <Icon name={icon} size={16} color={colors.text} />
      <Text style={styles.actionText}>{label}</Text>
    </Tappable>
  );
}

const useStyles = themedStyles((colors) => ({
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
}));
