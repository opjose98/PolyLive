// =============================================================================
// ProjectWorkspaceScreen.tsx — Espacios de un proyecto
// Portado de LevON: features/projects/ui/project_workspace_screen.dart,
//                   spaces/space_card.dart, spaces/space_preview_painter.dart
// =============================================================================
//
// Un espacio es un Recinto del proyecto. Cada tarjeta lleva una MINIATURA de la
// planta dibujada — portada de `SpacePreviewPainter`. No es decoración: con
// cinco o seis espacios llamados "Planta 1", "Planta 2"..., el dibujo es lo
// único que permite reconocer cuál es cuál sin abrirlos uno a uno.
// =============================================================================

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  Modal,
  Alert,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

import { AppServices } from '../../application/AppServices';
import { SpaceDetail } from '../../application/projects/ProjectService';
import { Project } from '../../domain/objects/project';
import { RoomId, roomId as toRoomId } from '../../domain/objects/base';
import { AppError } from '../../shared/errors/AppError';
import { ActionButton } from '../components/ToolPalette';
import { TextField } from '../components/fields';
import { SpacePreview } from '../components/SpacePreview';
import { colors, spacing, radius, typography, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProjectWorkspaceScreenProps {
  services: AppServices;
  project: Project;
  onOpenSpace: (roomId: RoomId) => void;
  onBack: () => void;
  /** Exporta el proyecto completo (todos sus espacios). */
  onExportProject?: () => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function ProjectWorkspaceScreen({
  services,
  project,
  onOpenSpace,
  onBack,
  onExportProject,
}: ProjectWorkspaceScreenProps) {
  const [spaces, setSpaces] = useState<SpaceDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renaming, setRenaming] = useState<SpaceDetail | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const load = useCallback(async () => {
    setSpaces(await services.projects.listSpaceDetails(project.id));
  }, [services, project.id]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => Alert.alert('Error', 'No se pudieron cargar los espacios.'))
      .finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  }, [load]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;

    try {
      const { room } = await services.projects.createSpace({ projectId: project.id, name });
      setCreating(false);
      setNewName('');
      await load();
      onOpenSpace(room.roomId);
    } catch (err) {
      Alert.alert('Error', err instanceof AppError ? err.userMessage : 'No se pudo crear el espacio.');
    }
  }, [services, project.id, newName, load, onOpenSpace]);

  const handleRemove = useCallback(
    (detail: SpaceDetail) => {
      Alert.alert(
        'Quitar espacio',
        `Se quitará "${detail.space.name}" de este proyecto.\n\n` +
          'El Recinto y todo lo dibujado en él NO se borran: quedan sin proyecto y se pueden volver ' +
          'a asignar.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Quitar',
            style: 'destructive',
            onPress: async () => {
              try {
                await services.projects.removeSpace(project.id, detail.space.roomId);
                await load();
              } catch (err) {
                Alert.alert(
                  'Error',
                  err instanceof AppError ? err.userMessage : 'No se pudo quitar el espacio.',
                );
              }
            },
          },
        ],
      );
    },
    [services, project.id, load],
  );

  /**
   * Abre el diálogo de renombrado.
   *
   * BUG CORREGIDO: la versión anterior llamaba directamente a `updateSpace` con
   * `space.name` — el nombre que YA tenía —, así que el guard de "no ha
   * cambiado" cortaba siempre y el botón Renombrar no hacía absolutamente nada.
   * Hacía falta pedirle el nombre nuevo al usuario, que es lo que renombrar
   * significa.
   */
  const startRename = useCallback((detail: SpaceDetail) => {
    setRenameValue(detail.space.name);
    setRenaming(detail);
  }, []);

  const commitRename = useCallback(async () => {
    const detail = renaming;
    const name = renameValue.trim();
    if (!detail || !name) return;

    setRenaming(null);
    if (name === detail.space.name) return;

    try {
      await services.projects.updateSpace(project.id, detail.space.roomId, { name });
      await load();
    } catch {
      Alert.alert('Error', 'No se pudo renombrar el espacio.');
    }
  }, [renaming, renameValue, services, project.id, load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.navy} />
        <Text style={styles.muted}>Cargando espacios...</Text>
      </SafeAreaView>
    );
  }

  const closedArea = spaces.reduce((sum, s) => sum + (s.areaM2 ?? 0), 0);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel="Volver a proyectos"
        >
          <Text style={styles.backText}>‹ Proyectos</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.projectHeader}>
        <View style={styles.codeBadge}>
          <Text style={styles.codeBadgeText}>{project.bimCode}</Text>
        </View>
        <View style={styles.projectHeaderText}>
          <Text style={styles.title} numberOfLines={1}>
            {project.name}
          </Text>
          <Text style={styles.subtitle}>
            {project.discipline}
            {project.author ? ` · ${project.author}` : ''} · {spaces.length}{' '}
            {spaces.length === 1 ? 'espacio' : 'espacios'} · {closedArea.toFixed(2)} m²
          </Text>
        </View>
      </View>

      <FlatList
        data={spaces}
        keyExtractor={(item) => item.space.roomId}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Este proyecto no tiene espacios</Text>
            <Text style={styles.muted}>
              Un espacio es una planta, una estancia o cualquier ámbito que se levante por separado.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <SpaceCard
            detail={item}
            onOpen={() => onOpenSpace(toRoomId(item.space.roomId))}
            onRename={() => startRename(item)}
            onRemove={() => handleRemove(item)}
          />
        )}
      />

      <View style={styles.footer}>
        <ActionButton label="+ Nuevo espacio" onPress={() => setCreating(true)} />
        {onExportProject ? (
          <ActionButton
            label="Exportar proyecto"
            variant="secondary"
            onPress={onExportProject}
            disabled={spaces.length === 0}
          />
        ) : null}
      </View>

      <Modal
        visible={renaming != null}
        animationType="fade"
        transparent
        onRequestClose={() => setRenaming(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.dialogScrim}
        >
          <ScrollView contentContainerStyle={styles.dialog} keyboardShouldPersistTaps="handled" style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Renombrar espacio</Text>
            <Text style={styles.muted}>
              El código BIM del espacio ({renaming?.space.bimCode}) no cambia: identifica el espacio
              dentro del proyecto.
            </Text>
            <TextField label="Nombre" value={renameValue} onCommit={setRenameValue} />
            <View style={styles.dialogActions}>
              <ActionButton label="Cancelar" variant="secondary" onPress={() => setRenaming(null)} />
              <ActionButton
                label="Guardar"
                onPress={() => void commitRename()}
                disabled={renameValue.trim().length === 0}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={creating} animationType="fade" transparent onRequestClose={() => setCreating(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.dialogScrim}
        >
          <ScrollView contentContainerStyle={styles.dialog} keyboardShouldPersistTaps="handled" style={styles.dialogCard}>
            <Text style={styles.dialogTitle}>Nuevo espacio</Text>
            <Text style={styles.muted}>
              Se creará un Recinto nuevo dentro de "{project.name}" y se le asignará el siguiente código
              de espacio libre.
            </Text>
            <TextField
              label="Nombre"
              value={newName}
              placeholder="p. ej. Planta baja"
              onCommit={setNewName}
            />
            <View style={styles.dialogActions}>
              <ActionButton
                label="Cancelar"
                variant="secondary"
                onPress={() => {
                  setCreating(false);
                  setNewName('');
                }}
              />
              <ActionButton
                label="Crear y abrir"
                onPress={() => void handleCreate()}
                disabled={newName.trim().length === 0}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de espacio
// ---------------------------------------------------------------------------

function SpaceCard({
  detail,
  onOpen,
  onRename,
  onRemove,
}: {
  detail: SpaceDetail;
  onOpen: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const { space, room, areaM2, objectCount } = detail;

  // Un espacio cuya fila apunta a un Recinto inexistente se muestra en vez de
  // ocultarse: si no, quedaría una fila fantasma que nadie puede ver ni limpiar.
  if (!room) {
    return (
      <View style={[styles.card, styles.cardBroken]}>
        <Text style={styles.cardTitle}>{space.name}</Text>
        <Text style={styles.cardWarning}>
          El Recinto de este espacio ya no existe. Quítalo del proyecto para limpiarlo.
        </Text>
        <TouchableOpacity style={styles.cardActionButton} onPress={onRemove}>
          <Text style={[styles.cardActionText, styles.cardActionDanger]}>Quitar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Abrir espacio ${space.name}`}
    >
      <View style={styles.cardRow}>
        <SpacePreview geometry={room.geometry} width={96} height={72} />

        <View style={styles.cardBody}>
          <View style={styles.cardHeader}>
            <View style={styles.spaceBadge}>
              <Text style={styles.spaceBadgeText}>{space.bimCode}</Text>
            </View>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {space.name}
            </Text>
          </View>

          <Text style={styles.cardMeta}>
            {areaM2 != null ? `${areaM2.toFixed(2)} m² · cerrado` : 'Sin cerrar'}
          </Text>
          <Text style={styles.cardMeta}>
            {objectCount} {objectCount === 1 ? 'elemento' : 'elementos'}
          </Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={onRename}
          accessibilityRole="button"
          accessibilityLabel={`Renombrar ${space.name}`}
        >
          <Text style={styles.cardActionText}>Renombrar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Quitar ${space.name} del proyecto`}
        >
          <Text style={[styles.cardActionText, styles.cardActionDanger]}>Quitar</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
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
  header: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  backButton: {
    minHeight: 36,
    justifyContent: 'center',
  },
  backText: {
    ...typography.bodyStrong,
    color: colors.navy,
  },
  projectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    backgroundColor: colors.surface,
  },
  projectHeaderText: {
    flex: 1,
  },
  codeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: colors.navy,
  },
  codeBadgeText: {
    ...typography.caption,
    color: colors.yellow,
    fontWeight: '700',
  },
  spaceBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.xs,
    backgroundColor: colors.surface3,
  },
  spaceBadgeText: {
    ...typography.caption,
    color: colors.navy,
    fontWeight: '700',
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  list: {
    padding: spacing.md,
    gap: spacing.md,
  },
  emptyState: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  cardBroken: {
    borderWidth: 1,
    borderColor: colors.warning,
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    flex: 1,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardWarning: {
    ...typography.caption,
    color: colors.warning,
  },
  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  cardActionButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  cardActionText: {
    ...typography.label,
    color: colors.navy,
  },
  cardActionDanger: {
    color: colors.error,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.surface,
  },
  dialogScrim: {
    flex: 1,
    backgroundColor: colors.overlayScrim,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  dialogCard: {
    flexGrow: 0,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
  },
  dialog: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dialogTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});

export default ProjectWorkspaceScreen;
