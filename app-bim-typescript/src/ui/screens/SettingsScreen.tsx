// =============================================================================
// SettingsScreen.tsx — Ajustes: copias de seguridad, restauración, operador
// Basado en: backup-integridad.md, escenarios-recuperacion.md,
//            docs/10-NEXT-PHASE-ROADMAP.md §3.2
// =============================================================================
//
// GAP CERRADO EN ESTA REVISIÓN: la pantalla solo permitía CREAR copias. La
// restauración se declaraba fuera de alcance, así que la app hacía copias que
// nadie podía usar — funcionalmente, no había copias de seguridad. Ahora cada
// copia de la lista se puede restaurar, con la advertencia y el reinicio que
// la operación exige de verdad.
// =============================================================================

import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { AppServices } from '../../application/AppServices';
import { ExpoBackupDatabaseUseCase } from '../../native/backup/ExpoBackupDatabaseUseCase';
import {
  ExpoRestoreDatabaseUseCase,
  BackupEntry,
} from '../../native/backup/ExpoRestoreDatabaseUseCase';
import { AppError } from '../../shared/errors/AppError';
import { ActionButton } from '../components/ToolPalette';
import { ToggleRow, ReadonlyRow } from '../components/fields';
import { colors, spacing, radius, typography, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SettingsScreenProps {
  services: AppServices;
  /** Nombre lógico de la base abierta — lo necesita la restauración. */
  dbName: string;
  /** Abre OperatorProfileScreen (navegación fuera del Tab.Navigator, ver App.tsx). */
  onOpenProfile: () => void;
  /**
   * Cierra la conexión y reinicia la app tras una restauración.
   *
   * Lo gestiona App.tsx y no esta pantalla porque es App.tsx quien posee la
   * conexión y quien construyó los servicios sobre ella: seguir usando este
   * árbol de componentes tras sustituir el archivo de la base significaría
   * trabajar sobre una conexión que apunta a datos que ya no están.
   */
  onRestored: (restoredFrom: string) => void;
  /** Abre la pantalla de topografía (puntos de control y sistema de coordenadas). */
  onOpenSurveyControl?: () => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function SettingsScreen({
  services,
  dbName,
  onOpenProfile,
  onRestored,
  onOpenSurveyControl,
}: SettingsScreenProps) {
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);

  const restoreUseCase = useState(() => new ExpoRestoreDatabaseUseCase())[0];

  const loadBackups = useCallback(async () => {
    try {
      setBackups(await restoreUseCase.listBackups());
    } catch {
      setBackups([]);
    }
  }, [restoreUseCase]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  // -----------------------------------------------------------------------
  // Crear copia
  // -----------------------------------------------------------------------

  const handleCreateBackup = useCallback(async () => {
    setCreating(true);
    try {
      // Con la estrategia VACUUM INTO basta el contrato genérico IDatabase, así
      // que ya no hace falta comprobar que la implementación sea la de Expo
      // (la versión anterior negaba el backup manual fuera del dispositivo).
      const result = await new ExpoBackupDatabaseUseCase().execute({ db: services.db });
      await loadBackups();
      Alert.alert(
        'Copia creada',
        result.prunedPaths.length > 0
          ? `Copia guardada. Se eliminaron ${result.prunedPaths.length} copia(s) antigua(s) por rotación.`
          : 'Copia guardada.',
      );
    } catch (err) {
      Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo crear la copia.');
    } finally {
      setCreating(false);
    }
  }, [services, loadBackups]);

  // -----------------------------------------------------------------------
  // Restaurar
  // -----------------------------------------------------------------------

  const handleRestore = useCallback(
    (entry: BackupEntry) => {
      Alert.alert(
        'Restaurar copia',
        `Se sustituirá TODA la base de datos actual por la copia del ` +
          `${entry.createdAt ? entry.createdAt.toLocaleString() : entry.name}.\n\n` +
          `Se perderá cualquier trabajo posterior a esa copia. La app se reiniciará al terminar.\n\n` +
          `Recomendación: crea una copia AHORA antes de restaurar, para poder volver atrás.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Restaurar',
            style: 'destructive',
            onPress: async () => {
              setRestoring(true);
              try {
                // Orden obligatorio: cerrar la conexión ANTES de sustituir el
                // archivo. Copiar encima de una base con una conexión viva es
                // la forma más directa de corromperla.
                await services.db.close();
                const result = await restoreUseCase.execute({ dbName, backupPath: entry.path });
                onRestored(result.restoredFrom);
              } catch (err) {
                Alert.alert(
                  'Error',
                  err instanceof AppError
                    ? err.userMessage
                    : 'No se pudo restaurar la copia. La base de datos quedó cerrada; reinicia la app.',
                );
              } finally {
                setRestoring(false);
              }
            },
          },
        ],
      );
    },
    [services, dbName, restoreUseCase, onRestored],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const busy = creating || restoring;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ajustes</Text>

        {/* --- Copias de seguridad --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Copias de seguridad</Text>
          <Text style={styles.subtitle}>
            Se crea una copia al abrir la app. Se conservan las 5 más recientes; las más antiguas se
            eliminan por rotación.
          </Text>

          <ToggleRow
            label="Copia automática al abrir"
            description="Desactivarlo solo afecta al arranque; las copias manuales siguen disponibles."
            value={autoBackup}
            onChange={(value) => {
              setAutoBackup(value);
              // Sinceridad sobre el alcance: la preferencia no se persiste
              // todavía (no hay almacén de preferencias), así que se dice en
              // vez de fingir que quedó guardada.
              if (!value) {
                Alert.alert(
                  'Solo esta sesión',
                  'Esta preferencia todavía no se guarda entre arranques: al reabrir la app volverá a estar activada.',
                );
              }
            }}
          />

          <ActionButton
            label={creating ? 'Creando...' : 'Crear copia ahora'}
            onPress={() => void handleCreateBackup()}
            disabled={busy}
          />

          <Text style={styles.listTitle}>Copias disponibles ({backups.length})</Text>
          {backups.length === 0 ? (
            <Text style={styles.empty}>Sin copias todavía.</Text>
          ) : (
            backups.map((entry) => (
              <TouchableOpacity
                key={entry.path}
                style={styles.backupRow}
                onPress={() => handleRestore(entry)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel={`Restaurar copia del ${entry.createdAt?.toLocaleString() ?? entry.name}`}
              >
                <View style={styles.backupInfo}>
                  <Text style={styles.backupDate}>
                    {entry.createdAt ? entry.createdAt.toLocaleString() : entry.name}
                  </Text>
                  <Text style={styles.backupSize}>{formatBytes(entry.sizeBytes)}</Text>
                </View>
                <Text style={styles.backupAction}>Restaurar</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* --- Topografía --- */}
        {onOpenSurveyControl ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Topografía</Text>
            <Text style={styles.subtitle}>
              Sistema de coordenadas de la Sede y puntos de control (mojones) con referencia GPS.
            </Text>
            <ActionButton
              label="Abrir topografía"
              variant="secondary"
              onPress={onOpenSurveyControl}
              disabled={busy}
            />
          </View>
        ) : null}

        {/* --- Operador --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Operador</Text>
          <ActionButton
            label="Ver perfil / cambiar operador"
            variant="secondary"
            onPress={onOpenProfile}
            disabled={busy}
          />
        </View>

        {/* --- Información --- */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Información</Text>
          <ReadonlyRow label="Base de datos" value={dbName} />
          <ReadonlyRow label="Nivel por defecto" value={services.defaultLevelId as string} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'kB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`;
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
  cardTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  listTitle: {
    ...typography.label,
    color: colors.textPrimary,
    marginTop: spacing.md,
  },
  empty: {
    ...typography.body,
    color: colors.textDisabled,
  },
  backupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: layout.touchTargetMin,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  backupInfo: {
    flex: 1,
  },
  backupDate: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  backupSize: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  backupAction: {
    ...typography.label,
    color: colors.navy,
  },
});

export default SettingsScreen;
