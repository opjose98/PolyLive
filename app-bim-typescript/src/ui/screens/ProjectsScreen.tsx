// =============================================================================
// ProjectsScreen.tsx — Lista de proyectos
// Portado de LevON: features/projects/ui/projects_screen.dart,
//                   widgets/project_card.dart, widgets/bim_project_dialog.dart
// =============================================================================
//
// SUSTITUYE A DashboardScreen. Aquella pantalla listaba Recintos sueltos porque
// "no existe ninguna entidad Project en el dominio ni en el esquema SQLite"
// (así lo decía su propia cabecera). Ahora sí existe: ver
// domain/objects/project.ts. Con dos obras a la vez, la lista plana de Recintos
// mezclaba la nave industrial y el chalet sin forma de distinguirlos.
//
// La adopción de Recintos anteriores la hace App.tsx al arrancar, así que el
// trabajo hecho con la versión anterior aparece aquí dentro de un proyecto en
// vez de quedar inalcanzable.
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

import { AppServices } from '../../application/AppServices';
import {
  Project,
  ProjectSummary,
  BIM_DISCIPLINES,
  BimDiscipline,
} from '../../domain/objects/project';
import type { Operator } from '../../domain/objects/operator';
import { AppError } from '../../shared/errors/AppError';
import { ActionButton, alertDialog } from '../primitives';
import { TextField, SegmentedField } from '../components/fields';
import { colors, spacing, radius, typography, layout } from '../theme/tokens';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ProjectsScreenProps {
  services: AppServices;
  operator: Operator;
  onOpenProject: (project: Project) => void;
  onOpenSettings?: () => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function ProjectsScreen({
  services,
  operator,
  onOpenProject,
  onOpenSettings,
}: ProjectsScreenProps) {
  const [summaries, setSummaries] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setSummaries(await services.projects.listProjectSummaries());
  }, [services]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => alertDialog('Error', 'No se pudieron cargar los proyectos.'))
      .finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load().catch(() => undefined);
    setRefreshing(false);
  }, [load]);

  // Búsqueda sobre nombre, código y autor — los tres campos por los que alguien
  // busca una obra en campo.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return summaries;
    return summaries.filter(({ project }) =>
      [project.name, project.bimCode, project.author, project.discipline]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [summaries, query]);

  const handleDelete = useCallback(
    (project: Project) => {
      alertDialog(
        'Eliminar proyecto',
        `Se eliminará el proyecto "${project.name}".\n\n` +
          'Los Recintos y todo lo dibujado en ellos NO se borran: quedan sin proyecto y se pueden ' +
          'volver a asignar más adelante.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: async () => {
              try {
                await services.projects.deleteProject(project.id);
                await load();
              } catch (err) {
                alertDialog(
                  'Error',
                  err instanceof AppError ? err.userMessage : 'No se pudo eliminar el proyecto.',
                );
              }
            },
          },
        ],
      );
    },
    [services, load],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator color={colors.navy} />
        <Text style={styles.muted}>Cargando proyectos...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Proyectos</Text>
          <Text style={styles.subtitle}>Operador: {operator.name}</Text>
        </View>
        {onOpenSettings ? (
          <TouchableOpacity
            style={styles.headerAction}
            onPress={onOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Abrir ajustes"
          >
            <Text style={styles.headerActionText}>⚙</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre, código, autor o disciplina"
          placeholderTextColor={colors.textDisabled}
          accessibilityLabel="Buscar proyectos"
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.project.id as string}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>
              {query ? 'Ningún proyecto coincide con la búsqueda' : 'Todavía no hay proyectos'}
            </Text>
            <Text style={styles.muted}>
              {query
                ? 'Prueba con otro nombre o código.'
                : 'Crea un proyecto para empezar: cada proyecto agrupa los espacios (Recintos) de una obra.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ProjectCard
            summary={item}
            onOpen={() => onOpenProject(item.project)}
            onEdit={() => setEditing(item.project)}
            onDelete={() => handleDelete(item.project)}
          />
        )}
      />

      <View style={styles.footer}>
        <ActionButton label="+ Nuevo proyecto" onPress={() => setCreating(true)} />
      </View>

      <ProjectDialog
        visible={creating}
        title="Nuevo proyecto"
        defaultAuthor={operator.name}
        suggestedCode={() => services.projectStore.nextProjectCode()}
        onCancel={() => setCreating(false)}
        onSubmit={async (values) => {
          try {
            const project = await services.projects.createProject(values);
            setCreating(false);
            await load();
            onOpenProject(project);
          } catch (err) {
            alertDialog(
              'Error',
              err instanceof AppError ? err.userMessage : 'No se pudo crear el proyecto.',
            );
          }
        }}
      />

      <ProjectDialog
        visible={editing !== null}
        title="Editar proyecto"
        initial={editing ?? undefined}
        defaultAuthor={operator.name}
        onCancel={() => setEditing(null)}
        onSubmit={async (values) => {
          if (!editing) return;
          try {
            await services.projects.updateProject(editing.id, values);
            setEditing(null);
            await load();
          } catch (err) {
            alertDialog(
              'Error',
              err instanceof AppError ? err.userMessage : 'No se pudo guardar el proyecto.',
            );
          }
        }}
      />
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Tarjeta de proyecto
// ---------------------------------------------------------------------------

function ProjectCard({
  summary,
  onOpen,
  onEdit,
  onDelete,
}: {
  summary: ProjectSummary;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { project, spaceCount, totalAreaM2, openSpaceCount } = summary;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`Abrir proyecto ${project.name}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.codeBadge}>
          <Text style={styles.codeBadgeText}>{project.bimCode}</Text>
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {project.name}
        </Text>
      </View>

      {project.description ? (
        <Text style={styles.cardDescription} numberOfLines={2}>
          {project.description}
        </Text>
      ) : null}

      <View style={styles.cardMetaRow}>
        <Text style={styles.cardMeta}>{project.discipline}</Text>
        {project.author ? <Text style={styles.cardMeta}>· {project.author}</Text> : null}
      </View>

      <View style={styles.cardStats}>
        <Text style={styles.cardStat}>
          {spaceCount} {spaceCount === 1 ? 'espacio' : 'espacios'}
        </Text>
        <Text style={styles.cardStat}>{totalAreaM2.toFixed(2)} m² cerrados</Text>
        {openSpaceCount > 0 ? (
          <Text style={[styles.cardStat, styles.cardStatWarning]}>{openSpaceCount} sin cerrar</Text>
        ) : null}
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={`Editar ${project.name}`}
        >
          <Text style={styles.cardActionText}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cardActionButton}
          onPress={onDelete}
          accessibilityRole="button"
          accessibilityLabel={`Eliminar ${project.name}`}
        >
          <Text style={[styles.cardActionText, styles.cardActionDanger]}>Eliminar</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Diálogo de creación / edición
// ---------------------------------------------------------------------------

interface ProjectFormValues {
  name: string;
  bimCode: string;
  description: string;
  discipline: BimDiscipline;
  author: string;
}

function ProjectDialog({
  visible,
  title,
  initial,
  defaultAuthor,
  suggestedCode,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  initial?: Project;
  defaultAuthor: string;
  /** Solo al crear: código propuesto (el primero libre). */
  suggestedCode?: () => Promise<string>;
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
}) {
  const [values, setValues] = useState<ProjectFormValues>({
    name: '',
    bimCode: '',
    description: '',
    discipline: 'Arquitectura',
    author: defaultAuthor,
  });

  // `suggestedCode` llega como una función nueva en cada render del padre. Si
  // estuviera en las dependencias del efecto, cualquier re-render de la lista de
  // proyectos (una recarga, por ejemplo) REINICIARÍA el formulario y borraría lo
  // que el usuario llevara escrito. Se guarda en una ref, que es estable.
  const suggestedCodeRef = useRef(suggestedCode);
  suggestedCodeRef.current = suggestedCode;

  // Al ABRIR (y solo al abrir): con `initial` se cargan sus datos; sin él, se
  // propone el primer código libre para que el usuario no tenga que inventárselo.
  useEffect(() => {
    if (!visible) return;

    if (initial) {
      setValues({
        name: initial.name,
        bimCode: initial.bimCode,
        description: initial.description,
        discipline: initial.discipline,
        author: initial.author || defaultAuthor,
      });
      return;
    }

    let cancelled = false;
    setValues({ name: '', bimCode: '', description: '', discipline: 'Arquitectura', author: defaultAuthor });
    suggestedCodeRef
      .current?.()
      .then((code) => {
        if (!cancelled) setValues((v) => ({ ...v, bimCode: code }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
    // `defaultAuthor` es el nombre del operador: estable durante la sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial]);

  const canSubmit = values.name.trim().length > 0 && values.bimCode.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.dialogScrim}
      >
        <View style={styles.dialog}>
          <Text style={styles.dialogTitle}>{title}</Text>
          <ScrollView style={styles.dialogBody} keyboardShouldPersistTaps="handled">

          <TextField
            label="Nombre"
            value={values.name}
            placeholder="p. ej. Nave industrial Polígono Sur"
            onCommit={(name) => setValues((v) => ({ ...v, name }))}
          />
          <TextField
            label="Código BIM"
            value={values.bimCode}
            placeholder="BIM001"
            onCommit={(bimCode) => setValues((v) => ({ ...v, bimCode }))}
          />
          <TextField
            label="Descripción"
            value={values.description}
            placeholder="Alcance del levantamiento"
            multiline
            onCommit={(description) => setValues((v) => ({ ...v, description }))}
          />
          <SegmentedField
            label="Disciplina"
            value={values.discipline}
            options={BIM_DISCIPLINES.slice(0, 3).map((d) => ({ value: d, label: d }))}
            onChange={(discipline) => setValues((v) => ({ ...v, discipline }))}
          />
          <TextField
            label="Autor"
            value={values.author}
            placeholder="Responsable del levantamiento"
            onCommit={(author) => setValues((v) => ({ ...v, author }))}
          />
          </ScrollView>

          <View style={styles.dialogActions}>
            <ActionButton label="Cancelar" variant="secondary" onPress={onCancel} />
            <ActionButton
              label="Guardar"
              onPress={() => void onSubmit(values)}
              disabled={!canSubmit}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  headerAction: {
    width: layout.touchTargetMin,
    height: layout.touchTargetMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActionText: {
    fontSize: 20,
    color: colors.navy,
  },
  searchWrap: {
    padding: spacing.md,
  },
  search: {
    minHeight: layout.touchTargetMin,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
  },
  list: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xl,
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
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    fontFamily: 'Roboto_700Bold',
  },
  cardTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    flex: 1,
  },
  cardDescription: {
    ...typography.body,
    color: colors.textSecondary,
  },
  cardMetaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  cardStat: {
    ...typography.label,
    color: colors.navy,
  },
  cardStatWarning: {
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
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    maxHeight: '90%',
  },
  dialogTitle: {
    ...typography.title,
    color: colors.textPrimary,
    marginBottom: spacing.lg,
  },
  dialogBody: {
    flexGrow: 0,
    flexShrink: 1,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
});

export default ProjectsScreen;
