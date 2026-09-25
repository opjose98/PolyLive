// =============================================================================
// ExportScreen.tsx — Exportar el Recinto a IFC y a DXF
// Basado en: ExportRoomIfcUseCase.md, IFC-Compatibility-Gate.md
// DXF portado de LevON: export/dxf_exporter.dart
// =============================================================================
//
// DOS FORMATOS CON DOS CRITERIOS DISTINTOS, y la pantalla lo dice:
//
//   IFC exige el Recinto CERRADO. Un IFC con un espacio abierto no es un
//   modelo válido: el receptor no puede calcular volúmenes ni asociar
//   elementos a un espacio que no existe.
//
//   DXF no exige nada. Un DXF es un DIBUJO, y exportar un levantamiento a
//   medias para seguir delineándolo en el despacho es justamente uno de los
//   motivos para tener DXF.
//
// Antes esta pantalla solo ofrecía IFC, así que un levantamiento sin cerrar no
// tenía NINGUNA forma de salir de la app.
// =============================================================================

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { AppServices } from '../../application/AppServices';
import { ExportRoomIfcToFileUseCase } from '../../native/export/ExportRoomIfcToFileUseCase';
import { ExportRoomDxfToFileUseCase } from '../../native/export/ExportRoomDxfToFileUseCase';
import { Room, RoomId, revitObjectId } from '../../domain/objects';
import { AppError } from '../../shared/errors/AppError';
import { ValidationWarning } from '../../domain/geometry/types';
import { ActionButton } from '../components/ToolPalette';
import { ReadonlyRow } from '../components/fields';
import { colors, spacing, radius, typography } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props y estado
// ---------------------------------------------------------------------------

export interface ExportScreenProps {
  services: AppServices;
  roomId: RoomId;
}

type ExportStatus =
  | { phase: 'idle' }
  | { phase: 'exporting'; format: 'ifc' | 'dxf' }
  | { phase: 'done'; format: 'ifc' | 'dxf'; filePath: string; warnings: ValidationWarning[]; detail?: string }
  | { phase: 'error'; message: string };

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function ExportScreen({ services, roomId }: ExportScreenProps) {
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ExportStatus>({ phase: 'idle' });

  const exportIfc = useMemo(
    () => new ExportRoomIfcToFileUseCase(services.useCases.exportRoomIfc),
    [services],
  );
  const exportDxf = useMemo(
    () => new ExportRoomDxfToFileUseCase(services.useCases.exportRoomDxf),
    [services],
  );

  const loadRoom = useCallback(async () => {
    const obj = await services.store.readObject(revitObjectId(roomId as unknown as string));
    setRoom(obj instanceof Room ? obj : null);
  }, [services, roomId]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  const canExportIfc = room != null && room.isOpen === false;
  const busy = status.phase === 'exporting';

  // -----------------------------------------------------------------------
  // Acciones
  // -----------------------------------------------------------------------

  const handleExportIfc = useCallback(async () => {
    setStatus({ phase: 'exporting', format: 'ifc' });
    try {
      const result = await exportIfc.execute({ roomId });
      setStatus({
        phase: 'done',
        format: 'ifc',
        filePath: result.filePath,
        warnings: result.warnings,
      });
    } catch (err) {
      setStatus({
        phase: 'error',
        message: err instanceof AppError ? err.userMessage : 'No se pudo exportar el Recinto a IFC.',
      });
    }
  }, [exportIfc, roomId]);

  const handleExportDxf = useCallback(async () => {
    setStatus({ phase: 'exporting', format: 'dxf' });
    try {
      // Las elevaciones se pasan explícitamente porque viven en otro store: sin
      // ellas el DXF saldría sin puertas ni ventanas en planta.
      const elevations = await services.elevations.listElevations(roomId);
      const result = await exportDxf.execute({
        roomId,
        title: (room?.properties.name as string | undefined) ?? undefined,
        elevations,
      });

      setStatus({
        phase: 'done',
        format: 'dxf',
        filePath: result.filePath,
        warnings: [],
        detail:
          `${result.stats.walls} muro(s), ${result.stats.columns} columna(s), ` +
          `${result.stats.openings} hueco(s)` +
          (result.stats.roomClosed ? ', recinto cerrado' : ', recinto sin cerrar'),
      });
    } catch (err) {
      setStatus({
        phase: 'error',
        message: err instanceof AppError ? err.userMessage : 'No se pudo exportar el Recinto a DXF.',
      });
    }
  }, [exportDxf, services, roomId, room]);

  const explainIfcBlock = useCallback(() => {
    Alert.alert(
      'Por qué IFC necesita el Recinto cerrado',
      'Un archivo IFC describe ESPACIOS, no solo líneas. Un recinto sin cerrar no delimita ningún ' +
        'espacio: el receptor no podría calcular su volumen ni asociarle elementos.\n\n' +
        'Cierra el Recinto desde la pestaña Levantamiento, o exporta a DXF, que sí admite un ' +
        'levantamiento a medias.',
    );
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Exportar</Text>

        {/* --- Estado del Recinto --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recinto activo</Text>
          {room == null ? (
            <Text style={styles.muted}>Aún no se ha trazado ningún Recinto.</Text>
          ) : (
            <>
              <ReadonlyRow
                label="Nombre"
                value={(room.properties.name as string | undefined) ?? 'Sin nombre'}
              />
              <ReadonlyRow label="Estado" value={room.isOpen ? 'Abierto (en trazo)' : 'Cerrado'} />
              <ReadonlyRow
                label="Área"
                value={room.area != null ? `${Number(room.area).toFixed(2)} m²` : 'No calculada'}
              />
              <ReadonlyRow label="Vértices" value={String(room.geometry.length)} />
            </>
          )}
        </View>

        {/* --- IFC --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>IFC 4 (modelo BIM)</Text>
          <Text style={styles.muted}>
            Intercambio BIM estándar. Requiere el Recinto cerrado para poder describir el espacio.
          </Text>
          <ActionButton
            label={status.phase === 'exporting' && status.format === 'ifc' ? 'Exportando...' : 'Exportar a IFC'}
            onPress={() => void handleExportIfc()}
            disabled={!canExportIfc || busy}
          />
          {!canExportIfc && room != null ? (
            <ActionButton
              label="¿Por qué no puedo exportar?"
              variant="secondary"
              onPress={explainIfcBlock}
            />
          ) : null}
        </View>

        {/* --- DXF --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>DXF R2000 (dibujo CAD)</Text>
          <Text style={styles.muted}>
            Planta delineable en AutoCAD, con capas separadas para muros portantes, particiones,
            columnas, huecos y contorno del recinto. Funciona aunque el levantamiento esté a medias.
          </Text>
          <ActionButton
            label={status.phase === 'exporting' && status.format === 'dxf' ? 'Exportando...' : 'Exportar a DXF'}
            onPress={() => void handleExportDxf()}
            disabled={busy}
          />
        </View>

        {/* --- Resultado --- */}
        {status.phase === 'done' ? (
          <View style={[styles.card, styles.successCard]}>
            <Text style={styles.cardTitle}>
              {status.format === 'ifc' ? 'IFC exportado' : 'DXF exportado'}
            </Text>
            <Text style={styles.path} numberOfLines={3} selectable>
              {status.filePath}
            </Text>
            {status.detail ? <Text style={styles.muted}>{status.detail}</Text> : null}
            {status.warnings.length > 0 ? (
              <>
                <Text style={styles.warningsTitle}>Advertencias ({status.warnings.length})</Text>
                {status.warnings.map((w, i) => (
                  <Text key={i} style={styles.warningText}>
                    • {w.message}
                  </Text>
                ))}
              </>
            ) : null}
          </View>
        ) : null}

        {status.phase === 'error' ? (
          <View style={[styles.card, styles.errorCard]}>
            <Text style={styles.cardTitle}>Error</Text>
            <Text style={styles.muted}>{status.message}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  successCard: {
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
  },
  errorCard: {
    backgroundColor: 'rgba(255, 59, 48, 0.12)',
  },
  cardTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  path: {
    ...typography.mono,
    color: colors.textPrimary,
  },
  warningsTitle: {
    ...typography.label,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  warningText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});

export default ExportScreen;
