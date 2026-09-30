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
  levelsFromProfile,
  openingEnd,
  openingTop,
  openingTypeLabel,
  OPENING_DEFAULTS,
} from '../../domain/objects/wall-elevation';
import {
  LevelElevations,
  VerticalExtent,
  WallVertical,
  isRectangularProfile,
  profileBottom,
  profileHeight,
  profileProblem,
  resolveWallProfile,
  wallVerticalOf,
} from '../../domain/objects/vertical';
import { LEVEL_PROP, ProjectMarker } from '../../domain/objects/marker';
import { describeExtent } from '../../application/workspace/constraintModel';
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
  /** Proyecto del muro: sus niveles dan las cotas de base y tope. */
  projectId?: string;
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

export function WallElevationScreen({ services, roomId, wallDbId, projectId, onClose }: WallElevationScreenProps) {
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
  const [levelMarkers, setLevelMarkers] = useState<readonly ProjectMarker[]>([]);

  useEffect(() => {
    if (!projectId) return;
    services.markers
      .list(projectId, 'level')
      .then(setLevelMarkers)
      .catch(() => setLevelMarkers([]));
  }, [services, projectId]);

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

  // --- Perfil real del muro: sus restricciones de nivel resueltas a cotas ---
  const levelElevations = useMemo<LevelElevations>(
    () => new Map(levelMarkers.map((m) => [m.id, m.value] as [string, number])),
    [levelMarkers],
  );
  const baseLevelId = levelMarkers.find((m) => m.isBase)?.id ?? '';
  const vertical = useMemo<WallVertical | null>(
    () => (wall ? wallVerticalOf(wall, baseLevelId, LEVEL_PROP) : null),
    [wall, baseLevelId],
  );
  // Un muro con restricciones guardadas manda sobre la culata del alzado; uno
  // de antes de existir (sin `vertical`) conserva la culata que tuviera.
  const profile = useMemo(
    () => (wall?.vertical && vertical ? resolveWallProfile(vertical, levelElevations) : null),
    [wall, vertical, levelElevations],
  );
  const shown = useMemo<WallElevation | null>(
    () => (elevation && profile ? { ...elevation, levels: levelsFromProfile(profile) } : elevation),
    [elevation, profile],
  );
  const baseElevation = profile ? profileBottom(profile) : levelElevations.get(vertical?.start.baseLevelId ?? '') ?? 0;
  const levelLines = useMemo(
    () => levelMarkers.map((m) => ({ name: m.name, y: m.value - baseElevation })),
    [levelMarkers, baseElevation],
  );

  const maxHeight = useMemo(() => {
    if (!shown) return 3;
    const lines = levelLines.map((l) => l.y).filter((y) => y > 0 && y < 60);
    return Math.max(
      shown.levels.coronacion,
      effectiveLeftHeight(shown.levels),
      effectiveRightHeight(shown.levels),
      ...lines.filter((y) => y <= shown.levels.coronacion + 3.5),
    );
  }, [shown, levelLines]);

  const viewport = useMemo(
    () => fitElevationViewport(wallLength, maxHeight, canvasWidth, canvasHeight),
    [wallLength, maxHeight, canvasWidth, canvasHeight],
  );

  const severityByOpening = useMemo(() => {
    const map = new Map<string, ElevationSeverity>();
    if (!shown || !wall) return map;
    for (const opening of shown.openings) {
      map.set(opening.id as string, service.validateOpening(opening, shown, wallLength).severity);
    }
    return map;
  }, [shown, wall, service, wallLength]);

  const quantification: WallQuantification | null = useMemo(
    () => (shown ? computeQuantification(shown, wallLength) : null),
    [shown, wallLength],
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

  /**
   * Guarda restricciones nuevas del muro (un paso de deshacer). Es el único
   * camino para cambiar alturas: el alzado lee el muro, no una copia propia.
   */
  const saveVertical = useCallback(
    async (next: WallVertical) => {
      if (!wall) return;
      const p = resolveWallProfile(next, levelElevations);
      const problem = profileProblem(p);
      if (problem) {
        Alert.alert('Alturas no válidas', problem);
        return;
      }
      setBusy(true);
      try {
        await services.useCases.updateObjectProperty.execute({
          objectId: wall.id,
          property: 'vertical',
          newValue: next,
          also: { height: profileHeight(p) },
        });
        await reload();
      } catch (err) {
        Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo cambiar la altura.');
      } finally {
        setBusy(false);
      }
    },
    [wall, levelElevations, services, reload],
  );

  /** Altura escrita a mano en un extremo: tope desconectado a esa altura sobre su base. */
  const withHeight = (e: VerticalExtent, h: number): VerticalExtent => ({ ...e, topLevelId: null, topOffset: 0, unconnectedHeight: h });

  const setEndHeight = (end: 'start' | 'end' | 'both', h: number) => {
    if (!vertical) return;
    void saveVertical({
      start: end === 'end' ? vertical.start : withHeight(vertical.start, h),
      end: end === 'start' ? vertical.end : withHeight(vertical.end, h),
    });
  };

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

  /**
   * Continuidad: cada muro que comparte un extremo con este toma, en ese
   * extremo, la misma restricción de base y tope. Así una culata o una base
   * escalonada sigue de un muro al siguiente sin saltos.
   */
  const propagate = useCallback(async () => {
    if (!wall || !vertical) return;
    setBusy(true);
    try {
      const objects = await services.store.listObjects(roomId);
      const near = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-3;
      let updated = 0;
      for (const other of objects) {
        if (!(other instanceof Wall) || other.id === wall.id) continue;
        const ov = wallVerticalOf(other, baseLevelId, LEVEL_PROP);
        let next = ov;
        for (const [pt, ext] of [[wall.startPoint, vertical.start], [wall.endPoint, vertical.end]] as const) {
          if (near(other.startPoint, pt)) next = { ...next, start: ext };
          if (near(other.endPoint, pt)) next = { ...next, end: ext };
        }
        if (next === ov) continue;
        const p = resolveWallProfile(next, levelElevations);
        if (profileProblem(p)) continue;
        await services.useCases.updateObjectProperty.execute({
          objectId: other.id,
          property: 'vertical',
          newValue: next,
          also: { height: profileHeight(p) },
        });
        updated++;
      }
      Alert.alert(
        'Niveles propagados',
        updated === 0
          ? 'Ningún muro comparte extremo con este.'
          : `Se igualaron base y tope en el encuentro de ${updated} muro(s) conectado(s).`,
      );
    } catch (err) {
      Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo propagar la coronación.');
    } finally {
      setBusy(false);
    }
  }, [wall, vertical, services, roomId, baseLevelId, levelElevations]);

  // -----------------------------------------------------------------------
  // Dibujo
  // -----------------------------------------------------------------------

  const draw = useMemo(
    () => (r: ICanvasRenderer) => {
      if (!shown) return;
      drawElevation(r, {
        elevation: shown,
        levelLines,
        baseElevation,
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
    [shown, levelLines, baseElevation, wallLength, viewport, canvasWidth, canvasHeight, selectedId, severityByOpening, showGrid, showLabels],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading || !wall || !elevation || !shown) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.navy} />
        <Text style={styles.muted}>Cargando elevación...</Text>
      </SafeAreaView>
    );
  }

  const overallValidation = service.validateElevation(shown, wallLength);
  const levelsList = levelMarkers.map((m) => ({ id: m.id, name: m.name, value: m.value }));
  const constrained = !!wall.vertical;
  const sloped = profile ? !isRectangularProfile(profile) : hasHeightProfile(elevation.levels);

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
          {constrained && vertical ? (
            <>
              <ReadonlyRow label="Extremo A (inicio)" value={describeExtent(levelsList, vertical.start)} />
              <ReadonlyRow label="Extremo B (fin)" value={describeExtent(levelsList, vertical.end)} />
              {profile ? (
                <ReadonlyRow
                  label="Cotas A · B"
                  value={`${profile.start.base.toFixed(2)}→${profile.start.top.toFixed(2)} · ${profile.end.base.toFixed(2)}→${profile.end.top.toFixed(2)} m`}
                />
              ) : null}
              <Text style={styles.note}>
                {sloped ? 'Perfil no rectangular: en Revit es un muro con perfil editado. ' : ''}
                Los niveles de base y tope se eligen con el selector B/T de la planta. Escribir una altura aquí
                desconecta el tope de su nivel.
              </Text>
              {sloped ? (
                <>
                  <NumberField
                    label="Altura en el arranque (A)"
                    unit="m"
                    decimals={2}
                    min={0.1}
                    max={60}
                    value={profile ? profile.start.top - profile.start.base : 0}
                    disabled={busy}
                    onCommit={(v) => setEndHeight('start', v)}
                  />
                  <NumberField
                    label="Altura en el final (B)"
                    unit="m"
                    decimals={2}
                    min={0.1}
                    max={60}
                    value={profile ? profile.end.top - profile.end.base : 0}
                    disabled={busy}
                    onCommit={(v) => setEndHeight('end', v)}
                  />
                </>
              ) : (
                <NumberField
                  label="Altura"
                  unit="m"
                  decimals={2}
                  min={0.1}
                  max={60}
                  value={profile ? profile.start.top - profile.start.base : elevation.levels.coronacion}
                  disabled={busy}
                  onCommit={(v) => setEndHeight('both', v)}
                />
              )}
              <ActionButton
                label="Igualar niveles en los muros conectados"
                variant="secondary"
                onPress={() => void propagate()}
                disabled={busy}
              />
            </>
          ) : (
          <>
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

          <Text style={styles.note}>
            Este muro es anterior a los niveles. Para atar su base y tope a niveles del proyecto, selecciónalo en
            la planta y usa el selector B/T.
          </Text>
          </>
          )}
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
