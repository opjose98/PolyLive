// =============================================================================
// WallElevationScreen.tsx — Panel de Elevación de Muro (WEP)
// Portado de LevON: features/walls/ui/wall_elevation_panel.dart,
//                   wall_elevation_editor.dart
// =============================================================================
//
// Es la vista frontal del muro: se colocan puertas, ventanas y huecos a su
// altura real, se define la culata, y se lee la cuantificación bruta/huecos/neta
// en tiempo real — que es la cifra que acaba en el presupuesto.
//
// La sincronización con la planta la hace WallElevationService: cada hueco de
// tipo puerta o ventana crea y mantiene su `Door`/`Window` correspondiente, así
// que lo colocado aquí aparece en la planta y se exporta a IFC sin ningún paso
// adicional.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';

import { SkiaCanvas } from '../components/SkiaCanvas';
import { ActionButton, Chip } from '../components/ToolPalette';
import { NumberField, TextField, SegmentedField, ToggleRow, ReadonlyRow } from '../components/fields';
import { drawElevation } from '../canvas/elevationRenderer';
import type { ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';

import { AppServices } from '../../application/AppServices';
import {
  WallElevationService,
  ElevationSeverity,
  fitElevationViewport,
  screenToCsl,
  snapXSmart,
  snapYSmart,
} from '../../application/elevation/WallElevationService';
import {
  WallElevation,
  WallOpening,
  WallOpeningId,
  OpeningType,
  WallQuantification,
  computeQuantification,
  effectiveLeftHeight,
  effectiveRightHeight,
  hasHeightProfile,
  openingEnd,
  openingTop,
  openingTypeLabel,
  OPENING_DEFAULTS,
} from '../../domain/objects/wall-elevation';
import { Wall } from '../../domain/objects/wall';
import { RoomId, revitObjectId } from '../../domain/objects/base';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';
import { colors, spacing, radius, typography, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WallElevationScreenProps {
  services: AppServices;
  roomId: RoomId;
  /** Id del muro cuya elevación se edita. */
  wallDbId: string;
  onClose: () => void;
}

const OPENING_TOOLS: readonly { type: OpeningType; label: string }[] = [
  { type: 'door', label: 'Puerta' },
  { type: 'window', label: 'Ventana' },
  { type: 'opening', label: 'Hueco' },
];

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function WallElevationScreen({ services, roomId, wallDbId, onClose }: WallElevationScreenProps) {
  const { width: screenWidth } = Dimensions.get('window');
  const canvasWidth = screenWidth;
  const canvasHeight = 260;

  // El servicio viene del composition root, no se construye aquí: así la
  // elevación y el exportador DXF comparten la MISMA instancia y no pueden
  // divergir en lo que consideran persistido.
  const service = services.elevations;

  const [wall, setWall] = useState<Wall | null>(null);
  const [elevation, setElevation] = useState<WallElevation | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<OpeningType | 'select'>('select');
  const [selectedId, setSelectedId] = useState<WallOpeningId | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);

  // -----------------------------------------------------------------------
  // Carga
  // -----------------------------------------------------------------------

  const reload = useCallback(async () => {
    const object = await services.store.readObject(revitObjectId(wallDbId));
    if (!(object instanceof Wall)) {
      throw new AppError({
        code: AppErrorCode.NOT_FOUND,
        userMessage: 'El muro ya no existe.',
        technicalDetail: `Wall ${wallDbId} not found or is not a Wall`,
      });
    }
    setWall(object);
    setElevation(await service.getElevation(object));
  }, [services, service, wallDbId]);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((err) =>
        Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo abrir la elevación.'),
      )
      .finally(() => setLoading(false));
  }, [reload]);

  // -----------------------------------------------------------------------
  // Derivados
  // -----------------------------------------------------------------------

  const wallLength = wall ? (wall.length as number) : 0;

  const maxHeight = useMemo(() => {
    if (!elevation) return 3;
    return Math.max(
      elevation.levels.coronacion,
      effectiveLeftHeight(elevation.levels),
      effectiveRightHeight(elevation.levels),
    );
  }, [elevation]);

  const viewport = useMemo(
    () => fitElevationViewport(wallLength, maxHeight, canvasWidth, canvasHeight),
    [wallLength, maxHeight, canvasWidth, canvasHeight],
  );

  const severityByOpening = useMemo(() => {
    const map = new Map<string, ElevationSeverity>();
    if (!elevation || !wall) return map;
    for (const opening of elevation.openings) {
      map.set(opening.id as string, service.validateOpening(opening, elevation, wallLength).severity);
    }
    return map;
  }, [elevation, wall, service, wallLength]);

  const quantification: WallQuantification | null = useMemo(
    () => (elevation ? computeQuantification(elevation, wallLength) : null),
    [elevation, wallLength],
  );

  const selected = useMemo(
    () => elevation?.openings.find((o) => o.id === selectedId) ?? null,
    [elevation, selectedId],
  );

  // -----------------------------------------------------------------------
  // Interacción con el lienzo
  // -----------------------------------------------------------------------

  const handleCanvasTap = useCallback(
    async (screenX: number, screenY: number) => {
      if (!elevation || !wall || busy) return;

      const csl = screenToCsl({ x: screenX, y: screenY }, viewport);
      const tolerance = layout.touchTolerancePx / viewport.scale;

      if (tool === 'select') {
        const hit = elevation.openings.find(
          (o) =>
            csl.x >= o.xOffset - tolerance &&
            csl.x <= openingEnd(o) + tolerance &&
            csl.y >= o.sillHeight - tolerance &&
            csl.y <= openingTop(o) + tolerance,
        );
        setSelectedId(hit?.id ?? null);
        return;
      }

      // Colocar un hueco nuevo: el toque marca su CENTRO (es donde el operador
      // quiere el hueco), el dominio guarda el borde izquierdo, y el resultado
      // se encaja dentro del muro para que no nazca sobresaliendo.
      setBusy(true);
      try {
        const width = OPENING_DEFAULTS[tool].width;
        const rawLeft = csl.x - width / 2;
        const snappedLeft = snapXSmart(rawLeft, elevation, wallLength, tolerance);
        const xOffset = Math.max(0, Math.min(snappedLeft, Math.max(0, wallLength - width)));

        const result = await service.addOpening(elevation, wall, { type: tool, xOffset, width });
        setElevation(result.elevation);
        setSelectedId(result.opening.id);
        if (result.validation.severity === 'warning') {
          Alert.alert('Aviso', result.validation.message ?? 'El hueco tiene una incidencia.');
        }
      } catch (err) {
        Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo crear el hueco.');
      } finally {
        setBusy(false);
      }
    },
    [elevation, wall, busy, viewport, tool, wallLength, service],
  );

  // -----------------------------------------------------------------------
  // Edición
  // -----------------------------------------------------------------------

  const updateSelected = useCallback(
    async (updates: Partial<Omit<WallOpening, 'id'>>) => {
      if (!elevation || !wall || !selected) return;
      setBusy(true);
      try {
        const result = await service.updateOpening(elevation, wall, selected.id, updates);
        setElevation(result.elevation);
        if (result.validation.severity === 'warning') {
          Alert.alert('Aviso', result.validation.message ?? 'El hueco tiene una incidencia.');
        }
      } catch (err) {
        Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo aplicar el cambio.');
      } finally {
        setBusy(false);
      }
    },
    [elevation, wall, selected, service],
  );

  const removeSelected = useCallback(() => {
    if (!elevation || !selected) return;
    Alert.alert(
      'Eliminar hueco',
      `Se eliminará ${openingTypeLabel(selected.type).toLowerCase()} y su representación en planta.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              setElevation(await service.removeOpening(elevation, selected.id));
              setSelectedId(null);
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof AppError ? err.userMessage : 'No se pudo eliminar el hueco.',
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [elevation, selected, service]);

  const updateLevels = useCallback(
    async (updates: Parameters<WallElevationService['updateLevels']>[2]) => {
      if (!elevation || !wall) return;
      setBusy(true);
      try {
        setElevation(await service.updateLevels(elevation, wall, updates));
        await reload();
      } catch (err) {
        Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo cambiar la altura.');
      } finally {
        setBusy(false);
      }
    },
    [elevation, wall, service, reload],
  );

  const propagate = useCallback(async () => {
    if (!elevation || !wall) return;
    setBusy(true);
    try {
      const objects = await services.store.listObjects(roomId);
      const walls = objects.filter((o): o is Wall => o instanceof Wall);
      const { updatedWallIds } = await service.propagateCoronacion(elevation, wall, walls);
      Alert.alert(
        'Coronación propagada',
        updatedWallIds.length === 0
          ? 'Ningún muro comparte extremo con este.'
          : `Se aplicó la coronación a ${updatedWallIds.length} muro(s) conectado(s).`,
      );
    } catch (err) {
      Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo propagar la coronación.');
    } finally {
      setBusy(false);
    }
  }, [elevation, wall, service, services, roomId]);

  // -----------------------------------------------------------------------
  // Dibujo
  // -----------------------------------------------------------------------

  const draw = useMemo(
    () => (r: ICanvasRenderer) => {
      if (!elevation) return;
      drawElevation(r, {
        elevation,
        wallLength,
        viewport,
        width: canvasWidth,
        height: canvasHeight,
        selectedOpeningId: selectedId,
        severityByOpening,
        showGrid,
        showLabels,
      });
    },
    [elevation, wallLength, viewport, canvasWidth, canvasHeight, selectedId, severityByOpening, showGrid, showLabels],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading || !wall || !elevation) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.navy} />
        <Text style={styles.muted}>Cargando elevación...</Text>
      </SafeAreaView>
    );
  }

  const overallValidation = service.validateElevation(elevation, wallLength);

  return (
    <SafeAreaView style={styles.container}>
      {/* --- Herramientas --- */}
      <View style={styles.toolRow}>
        <Chip label="Seleccionar" active={tool === 'select'} onPress={() => setTool('select')} />
        {OPENING_TOOLS.map((t) => (
          <Chip key={t.type} label={t.label} active={tool === t.type} onPress={() => setTool(t.type)} />
        ))}
      </View>

      {/* --- Lienzo --- */}
      <View
        style={{ width: canvasWidth, height: canvasHeight }}
        onStartShouldSetResponder={() => !busy}
        onResponderRelease={(e) =>
          void handleCanvasTap(e.nativeEvent.locationX, e.nativeEvent.locationY)
        }
      >
        <SkiaCanvas
          width={canvasWidth}
          height={canvasHeight}
          onDraw={draw}
          backgroundColor={colors.canvasBg}
        />
      </View>

      <View style={styles.toggleRow}>
        <Chip label="Rejilla" active={showGrid} onPress={() => setShowGrid(!showGrid)} />
        <Chip label="Cotas" active={showLabels} onPress={() => setShowLabels(!showLabels)} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* --- Cuantificación --- */}
        {quantification ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Cuantificación</Text>
            <View style={styles.quantRow}>
              <Quant label="Bruta" value={Number(quantification.grossArea)} />
              <Quant label="Huecos" value={Number(quantification.openingArea)} />
              <Quant label="Neta" value={Number(quantification.netArea)} highlight />
            </View>
            <Text style={styles.note}>
              La superficie de huecos se calcula como unión, no como suma: dos huecos solapados no
              descuentan dos veces la zona común.
            </Text>
          </View>
        ) : null}

        {/* --- Aviso global --- */}
        {overallValidation.severity !== 'ok' ? (
          <View
            style={[
              styles.banner,
              overallValidation.severity === 'error' ? styles.bannerError : styles.bannerWarning,
            ]}
          >
            <Text style={styles.bannerText}>{overallValidation.message}</Text>
          </View>
        ) : null}

        {/* --- Niveles verticales --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Alturas del muro</Text>
          <NumberField
            label="Coronación"
            unit="m"
            decimals={2}
            min={0.1}
            max={20}
            value={elevation.levels.coronacion}
            disabled={busy}
            onCommit={(v) => void updateLevels({ coronacion: v })}
            hint="Altura máxima. Se sincroniza con la altura del muro en planta."
          />
          <ToggleRow
            label="Culata (altura variable)"
            description="Un muro que sube o baja de un extremo al otro, típico bajo cubierta inclinada."
            value={hasHeightProfile(elevation.levels)}
            onChange={(enabled) =>
              void updateLevels(
                enabled
                  ? {
                      leftHeight: elevation.levels.coronacion,
                      rightHeight: elevation.levels.coronacion,
                    }
                  : { leftHeight: undefined, rightHeight: undefined },
              )
            }
          />
          {hasHeightProfile(elevation.levels) ? (
            <>
              <NumberField
                label="Altura en el arranque"
                unit="m"
                decimals={2}
                min={0.1}
                max={20}
                value={effectiveLeftHeight(elevation.levels)}
                disabled={busy}
                onCommit={(v) => void updateLevels({ leftHeight: v })}
              />
              <NumberField
                label="Altura en el final"
                unit="m"
                decimals={2}
                min={0.1}
                max={20}
                value={effectiveRightHeight(elevation.levels)}
                disabled={busy}
                onCommit={(v) => void updateLevels({ rightHeight: v })}
              />
            </>
          ) : null}

          <ActionButton
            label="Propagar coronación a muros conectados"
            variant="secondary"
            onPress={() => void propagate()}
            disabled={busy}
          />
        </View>

        {/* --- Hueco seleccionado --- */}
        {selected ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{openingTypeLabel(selected.type)} seleccionada</Text>

            <SegmentedField
              label="Tipo"
              value={selected.type}
              options={OPENING_TOOLS.map((t) => ({ value: t.type, label: t.label }))}
              disabled={busy}
              onChange={(type) => void updateSelected({ type })}
            />
            <NumberField
              label="Posición desde el arranque"
              unit="m"
              decimals={3}
              min={0}
              max={Math.max(0, wallLength - selected.width)}
              value={selected.xOffset}
              disabled={busy}
              onCommit={(v) =>
                void updateSelected({
                  xOffset: snapXSmart(v, elevation, wallLength, 0.02, selected.id),
                })
              }
            />
            <NumberField
              label="Ancho"
              unit="m"
              decimals={3}
              min={0.05}
              max={wallLength}
              value={selected.width}
              disabled={busy}
              onCommit={(width) => void updateSelected({ width })}
            />
            <NumberField
              label="Antepecho"
              unit="m"
              decimals={3}
              min={0}
              max={maxHeight}
              value={selected.sillHeight}
              disabled={busy}
              onCommit={(v) =>
                void updateSelected({ sillHeight: snapYSmart(v, elevation, 0.02, selected.id) })
              }
              hint="0 en puertas. Altura del alféizar en ventanas."
            />
            <NumberField
              label="Altura del hueco"
              unit="m"
              decimals={3}
              min={0.05}
              max={maxHeight}
              value={selected.height}
              disabled={busy}
              onCommit={(height) => void updateSelected({ height })}
            />
            <ReadonlyRow label="Dintel" value={`${openingTop(selected).toFixed(3)} m`} />

            {selected.type === 'door' ? (
              <ToggleRow
                label="Invertir sentido de apertura"
                value={selected.isFlipped}
                onChange={(isFlipped) => void updateSelected({ isFlipped })}
              />
            ) : null}

            <TextField
              label="Observaciones"
              value={selected.notes ?? ''}
              placeholder="p. ej. carpintería de aluminio, a sustituir"
              multiline
              disabled={busy}
              commitOn="blur"
              onCommit={(notes) => void updateSelected({ notes })}
            />

            <ActionButton label="Eliminar hueco" variant="danger" onPress={removeSelected} disabled={busy} />
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.muted}>
              {tool === 'select'
                ? 'Toca un hueco del muro para editarlo, o elige una herramienta para colocar uno nuevo.'
                : `Toca sobre el muro para colocar ${openingTypeLabel(tool).toLowerCase()}.`}
            </Text>
          </View>
        )}

        {/* --- Listado de huecos --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Huecos ({elevation.openings.length})</Text>
          {elevation.openings.length === 0 ? (
            <Text style={styles.muted}>Este muro todavía no tiene huecos.</Text>
          ) : (
            elevation.openings.map((opening) => {
              const severity = severityByOpening.get(opening.id as string) ?? 'ok';
              return (
                <TouchableOpacity
                  key={opening.id as string}
                  style={[styles.openingRow, opening.id === selectedId && styles.openingRowSelected]}
                  onPress={() => {
                    setTool('select');
                    setSelectedId(opening.id);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Seleccionar ${openingTypeLabel(opening.type)}`}
                >
                  <Text style={styles.openingLabel}>
                    {openingTypeLabel(opening.type)} · {opening.width.toFixed(2)} ×{' '}
                    {opening.height.toFixed(2)} m
                  </Text>
                  <Text
                    style={[
                      styles.openingMeta,
                      severity === 'error' && styles.textError,
                      severity === 'warning' && styles.textWarning,
                    ]}
                  >
                    x = {opening.xOffset.toFixed(2)} m
                    {severity !== 'ok' ? ` · ${severity === 'error' ? 'error' : 'aviso'}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <ActionButton label="Volver a la planta" variant="secondary" onPress={onClose} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Piezas locales
// ---------------------------------------------------------------------------

function Quant({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <View style={[styles.quant, highlight && styles.quantHighlight]}>
      <Text style={[styles.quantValue, highlight && styles.quantValueHighlight]}>
        {value.toFixed(2)}
      </Text>
      <Text style={styles.quantLabel}>{label} (m²)</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface2,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface2,
  },
  toolRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  content: {
    padding: spacing.md,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  quantRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quant: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surface2,
  },
  quantHighlight: {
    backgroundColor: colors.navy,
  },
  quantValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  quantValueHighlight: {
    color: colors.yellow,
  },
  quantLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  banner: {
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  bannerWarning: {
    backgroundColor: 'rgba(255, 149, 0, 0.15)',
  },
  bannerError: {
    backgroundColor: 'rgba(255, 59, 48, 0.15)',
  },
  bannerText: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  openingRow: {
    minHeight: layout.touchTargetMin,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  openingRowSelected: {
    backgroundColor: colors.surface3,
  },
  openingLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  openingMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  textError: {
    color: colors.error,
  },
  textWarning: {
    color: colors.warning,
  },
});

export default WallElevationScreen;
