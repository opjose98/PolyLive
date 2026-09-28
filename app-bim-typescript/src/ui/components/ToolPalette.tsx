// =============================================================================
// ToolPalette.tsx — Paleta de herramientas + barra de acciones del editor
// Portado de LevON: features/overlays/contextual_ribbon.dart, _SnapQuickBar
// =============================================================================
//
// GAP CERRADO: SurveyScreen no tenía ninguna paleta. El editor solo sabía
// encadenar muros, y las herramientas de puerta, ventana, columna, selección y
// medición no existían en pantalla aunque sus UseCases sí. Esta es la superficie
// que las hace alcanzables.
//
// DISPOSICIÓN: paleta arriba (qué voy a hacer), barra de estado/snaps debajo
// (cómo lo voy a hacer). La acción contextual sobre la selección vive en el
// panel de propiedades, no aquí, para que el usuario no tenga que buscar
// "Eliminar" en dos sitios distintos.
// =============================================================================

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { TOOLS, EditorTool, ToolDescriptor } from '../../application/editor/EditorController';
import { colors, spacing, radius, typography, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Paleta de herramientas
// ---------------------------------------------------------------------------

export interface ToolPaletteProps {
  tool: EditorTool;
  disabled?: boolean;
  onSelect: (tool: EditorTool) => void;
}

export function ToolPalette({ tool, disabled, onSelect }: ToolPaletteProps) {
  const active: ToolDescriptor = TOOLS.find((t) => t.tool === tool) ?? TOOLS[0];

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.paletteRow}
      >
        {TOOLS.map((descriptor) => {
          const isActive = descriptor.tool === tool;
          return (
            <TouchableOpacity
              key={descriptor.tool}
              style={[styles.toolButton, isActive && styles.toolButtonActive, disabled && styles.dimmed]}
              onPress={() => onSelect(descriptor.tool)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Herramienta ${descriptor.label}`}
              accessibilityHint={descriptor.hint}
            >
              <Text style={[styles.toolIcon, isActive && styles.toolIconActive]}>{descriptor.icon}</Text>
              <Text style={[styles.toolLabel, isActive && styles.toolLabelActive]}>{descriptor.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* La ayuda contextual no es decorativa: sin ella, "toca sobre un muro
          para colocar una puerta" es una regla invisible que el usuario solo
          descubre fallando. */}
      <Text style={styles.hint} numberOfLines={2}>
        {active.hint}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Barra rápida de snaps y vista
// ---------------------------------------------------------------------------

export interface QuickBarProps {
  snapEnabled: boolean;
  nodeSnapEnabled: boolean;
  gridEnabled: boolean;
  labelsEnabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  busy?: boolean;
  onToggleSnap: (value: boolean) => void;
  onToggleNodeSnap: (value: boolean) => void;
  onToggleGrid: (value: boolean) => void;
  onToggleLabels: (value: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomToFit: () => void;
}

export function QuickBar({
  snapEnabled,
  nodeSnapEnabled,
  gridEnabled,
  labelsEnabled,
  canUndo,
  canRedo,
  busy,
  onToggleSnap,
  onToggleNodeSnap,
  onToggleGrid,
  onToggleLabels,
  onUndo,
  onRedo,
  onZoomToFit,
  children,
}: QuickBarProps & { children?: React.ReactNode }) {
  return (
    <View style={styles.quickBar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Ángulo" active={snapEnabled} onPress={() => onToggleSnap(!snapEnabled)} hint="Snap angular a múltiplos de 15°" />
        <Chip label="Nodos" active={nodeSnapEnabled} onPress={() => onToggleNodeSnap(!nodeSnapEnabled)} hint="Pega el trazo a extremos de muro existentes" />
        <Chip label="Rejilla" active={gridEnabled} onPress={() => onToggleGrid(!gridEnabled)} hint="Muestra la rejilla métrica" />
        <Chip label="Cotas" active={labelsEnabled} onPress={() => onToggleLabels(!labelsEnabled)} hint="Muestra longitudes y áreas sobre el plano" />
        {children}
      </ScrollView>

      <View style={styles.quickActions}>
        <IconAction label="↶" accessibilityLabel="Deshacer" onPress={onUndo} disabled={!canUndo || busy} />
        <IconAction label="↷" accessibilityLabel="Rehacer" onPress={onRedo} disabled={!canRedo || busy} />
        <IconAction label="⤢" accessibilityLabel="Encuadrar todo" onPress={onZoomToFit} disabled={busy} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Piezas reutilizables
// ---------------------------------------------------------------------------

export function Chip({
  label,
  active,
  hint,
  onPress,
}: {
  label: string;
  active: boolean;
  hint?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: active }}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function IconAction({
  label,
  accessibilityLabel,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.iconAction, disabled && styles.dimmed]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={styles.iconActionText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Botón de acción principal/secundaria, con estado deshabilitado explícito. */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.actionButton,
        variant === 'secondary' && styles.actionButtonSecondary,
        variant === 'danger' && styles.actionButtonDanger,
        disabled && styles.dimmed,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text
        style={[
          styles.actionButtonText,
          variant === 'secondary' && styles.actionButtonTextSecondary,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  paletteRow: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  toolButton: {
    minWidth: 68,
    minHeight: layout.touchTargetMin,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonActive: {
    backgroundColor: colors.navy,
    borderColor: colors.navy,
  },
  toolIcon: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  toolIconActive: {
    color: colors.yellow,
  },
  toolLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  toolLabelActive: {
    color: colors.textOnDark,
    fontWeight: '600',
  },
  hint: {
    ...typography.caption,
    color: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  quickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface2,
    paddingVertical: spacing.xs,
  },
  chipRow: {
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    minHeight: 32,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.navyLight,
    borderColor: colors.navyLight,
  },
  chipText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.textOnDark,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  iconAction: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.navy,
  },
  actionButton: {
    flex: 1,
    minHeight: layout.touchTargetMin,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.sm,
    backgroundColor: colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  actionButtonDanger: {
    backgroundColor: colors.error,
  },
  actionButtonText: {
    ...typography.bodyStrong,
    color: colors.textOnDark,
  },
  actionButtonTextSecondary: {
    color: colors.navy,
  },
  dimmed: {
    opacity: 0.4,
  },
});
