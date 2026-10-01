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
import { View, Text, SafeAreaView, ScrollView } from 'react-native';
import { AppServices } from '../../application/AppServices';
import { exportPlanDxf, exportRevitIfc } from '../workspace/exportActions';
import { Room, RoomId, revitObjectId } from '../../domain/objects';
import { ActionButton, alertDialog } from '../primitives';
import { ReadonlyRow } from '../components/fields';
import { spacing, radius } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles } from '../design/theme';

// ---------------------------------------------------------------------------
// Props y estado
// ---------------------------------------------------------------------------

export interface ExportScreenProps {
  services: AppServices;
  roomId: RoomId;
  /** Proyecto del recinto: sus niveles y fases van al IFC. */
  projectId?: string;
  projectName?: string;
  operatorName?: string;
}

type ExportStatus =
  | { phase: 'idle' }
  | { phase: 'exporting'; format: 'ifc' | 'dxf' }
  | { phase: 'done'; format: 'ifc' | 'dxf'; folder: string; detail?: string }
  | { phase: 'error'; message: string };

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function ExportScreen({ services, roomId, projectId, projectName = 'Proyecto', operatorName }: ExportScreenProps) {
  const styles = useStyles();
  const [room, setRoom] = useState<Room | null>(null);
  const [status, setStatus] = useState<ExportStatus>({ phase: 'idle' });


  const loadRoom = useCallback(async () => {
    try {
      const obj = await services.store.readObject(revitObjectId(roomId as unknown as string));
      setRoom(obj instanceof Room ? obj : null);
    } catch {
      setRoom(null);
    }
  }, [services, roomId]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  const canExportIfc = room != null && room.isOpen === false;
  const busy = status.phase === 'exporting';

  // -----------------------------------------------------------------------
  // Acciones
  // -----------------------------------------------------------------------

  const ctx = useMemo(
    () => ({
      roomId,
      projectId,
      projectName,
      spaceName: (room?.properties.name as string | undefined) ?? 'Espacio',
      author: operatorName,
    }),
    [roomId, projectId, projectName, room, operatorName],
  );

  const run = useCallback(
    async (format: 'ifc' | 'dxf') => {
      setStatus({ phase: 'exporting', format });
      const r = format === 'ifc' ? await exportRevitIfc(services, ctx) : await exportPlanDxf(services, ctx);
      if (r.ok) setStatus({ phase: 'done', format, folder: r.folder, detail: r.detail });
      else setStatus(r.message ? { phase: 'error', message: r.message } : { phase: 'idle' });
    },
    [services, ctx],
  );
  const handleExportIfc = useCallback(() => run('ifc'), [run]);
  const handleExportDxf = useCallback(() => run('dxf'), [run]);

  const explainIfcBlock = useCallback(() => {
    alertDialog(
      'Por qué IFC necesita el Recinto cerrado',
      'Un archivo IFC describe ESPACIOS, no solo líneas. Un recinto sin cerrar no delimita ningún ' +
        'espacio: el receptor no podría calcular su volumen ni asociarle elementos.\n\n' +
        'Cierra el Recinto con muros en el levantamiento, o exporta a DXF, que sí admite un ' +
        'levantamiento a medias.',
    );
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
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
            Para Revit: un piso por nivel del proyecto, muros con sus restricciones de base y tope,
            vanos y fases. Requiere el Recinto cerrado para poder describir el espacio.
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
              Guardado en {status.folder}
            </Text>
            {status.detail ? <Text style={styles.muted}>{status.detail}</Text> : null}
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

const useStyles = themedStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  title: {
    ...type.title,
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  successCard: {
    backgroundColor: 'rgba(46, 125, 50, 0.10)',
  },
  errorCard: {
    backgroundColor: 'rgba(211, 47, 47, 0.10)',
  },
  cardTitle: {
    ...type.heading,
    color: colors.text,
  },
  muted: {
    ...type.body,
    color: colors.textSecondary,
  },
  path: {
    ...type.value,
    color: colors.text,
  },
  warningsTitle: {
    ...type.label,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  warningText: {
    ...type.caption,
    color: colors.textSecondary,
  },
}));

export default ExportScreen;
