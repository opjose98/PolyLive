// =============================================================================
// App.tsx — Punto de entrada y navegación
// Basado en: docs/10-NEXT-PHASE-ROADMAP.md §3.5, arquitectura-expo-skia.md
// =============================================================================
//
// FLUJO DE NAVEGACIÓN:
//   OperatorSelector → Proyectos → Espacios del proyecto → Levantamiento
//   Sin pestañas (F5): Galería, Exportar, Topografía, Operador y Ajustes se
//   abren desde el menú ☰ como pantallas que se deslizan por encima; el
//   levantamiento sigue montado debajo y se recupera tal cual al volver.
//
// QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR: el flujo era
// `OperatorSelector → Dashboard (lista plana de Recintos) → pestañas`. Ahora hay
// un nivel de Proyecto por encima (ver domain/objects/project.ts sobre por qué).
// Al arrancar se adoptan los Recintos que existían sin proyecto, para que el
// trabajo hecho con la versión anterior no quede inalcanzable.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { StatusBar, Text, View } from 'react-native';
import * as Updates from 'expo-updates';

import { OperatorSelectorScreen } from './screens/OperatorSelectorScreen';
import { OperatorProfileScreen } from './screens/OperatorProfileScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProjectWorkspaceScreen } from './screens/ProjectWorkspaceScreen';
import { SurveyScreen, MenuScreen } from './screens/SurveyScreen';
import { GalleryScreen } from './screens/GalleryScreen';
import { ExportScreen } from './screens/ExportScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { PermissionsManager } from '../native/permissions/PermissionsManager';
import { ExpoSQLiteDatabase } from '../native/sqlite/ExpoSQLiteDatabase';
import { ExpoBackupDatabaseUseCase } from '../native/backup/ExpoBackupDatabaseUseCase';
import { diagnostics } from '../shared/diagnostics';
import { startDiagnosticsLog } from '../native/diagnostics/diagnosticsLog';
import { bindWorkspacePrefs } from '../state/workspacePrefs';
import { workspaceStore } from '../state/workspaceStore';
import { AppPrefs, loadAppPrefs, workspacePrefsFile } from '../native/prefs/prefsFile';
import { MigrationError } from '../infrastructure/sqlite/migrations';
import { createAppServices, AppServices } from '../application/AppServices';
import { RoomId } from '../domain/objects';
import { Operator } from '../domain/objects/operator';
import { Project } from '../domain/objects/project';
import { AppError } from '../shared/errors/AppError';
import { alertDialog, ScreenShell } from './primitives';
import { type } from './design/typography';
import { themedStyles, useTheme } from './design/theme';

const DB_NAME = 'polylive.db';

// ---------------------------------------------------------------------------
// Estado de arranque
// ---------------------------------------------------------------------------

type BootStatus =
  | { phase: 'loading' }
  | { phase: 'ready'; services: AppServices }
  | { phase: 'error'; message: string };


// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const styles = useStyles();
  const colors = useTheme();
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [permManager] = useState(() => new PermissionsManager());
  const [boot, setBoot] = useState<BootStatus>({ phase: 'loading' });

  const [operator, setOperator] = useState<Operator | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<RoomId | null>(null);
  /** Pantalla del menú ☰ abierta por encima (null = ninguna). */
  const [screen, setScreen] = useState<MenuScreen | null>(null);
  /** Galería abierta desde la planta: fotos de un objeto, o una foto concreta. */
  const [galleryFocus, setGalleryFocus] = useState<{ objectId?: string; photoId?: string } | null>(null);

  // -----------------------------------------------------------------------
  // Permisos
  // -----------------------------------------------------------------------

  useEffect(() => {
    let settled = false;

    async function initPermissions() {
      try {
        // Red de seguridad además del fix de raíz en PermissionsManager
        // (solicitudes secuenciales, no Promise.all): si CUALQUIER llamada
        // nativa de permisos se cuelga por cualquier otra razón futura, la app
        // arranca igual en vez de quedarse congelada para siempre en "Iniciando
        // PolyLive" — el permiso pendiente se vuelve a pedir más tarde, cuando
        // la función que lo necesita (cámara, BLE, GPS) se use.
        // Ya no se piden todos los permisos al arrancar: cámara, ubicación y
        // Bluetooth se piden cuando la función que los usa se abre (lo que exige
        // Google Play y lo que entiende el usuario). Aquí solo se lee el estado.
        await Promise.race([
          permManager.checkAll(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('permissions timeout')), 3000)),
        ]);
      } catch {
        // Los permisos se piden individualmente cuando hagan falta.
      }
      if (!settled) {
        settled = true;
        setPermissionsReady(true);
      }
    }

    initPermissions();
    return () => {
      settled = true;
    };
  }, [permManager]);

  // -----------------------------------------------------------------------
  // Base de datos y servicios
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function initDatabase() {
      try {
        // ExpoSQLiteDatabase y no `Database` (paquete npm sqlite3): ese último
        // es un addon nativo de Node, incompatible con Hermes/React Native.
        // Registro de diagnóstico persistente y preferencias del lienzo (tema, snaps…).
        await startDiagnosticsLog().catch(() => undefined);
        void bindWorkspacePrefs(workspaceStore, workspacePrefsFile);
        const appPrefs = await loadAppPrefs().catch(() => ({}) as AppPrefs);

        const db = new ExpoSQLiteDatabase(DB_NAME);
        await db.open();
        await db.migrate();
        if (cancelled) return;

        const services = createAppServices(db);

        // Adopta los Recintos que existían antes de que hubiera proyectos. Es
        // idempotente: sin huérfanos no crea nada. Sin esto, tras actualizar la
        // app la lista de proyectos saldría vacía y todo el trabajo anterior
        // quedaría inalcanzable — seguiría en la base, sin pantalla que lo
        // alcanzara.
        try {
          const adopted = await services.projects.adoptOrphanRooms();
          if (adopted && !cancelled) {
            alertDialog(
              'Levantamientos recuperados',
              `Se agruparon ${adopted.adopted} Recinto(s) anteriores en el proyecto ` +
                `"${adopted.project.name}". Puedes renombrarlo o repartirlos en otros proyectos.`,
            );
          }
        } catch (err) {
          // La adopción es una comodidad, no un requisito para arrancar: si
          // falla, la app abre igual y los Recintos siguen adoptables después.
          diagnostics.warn('boot', 'Adopción de recintos huérfanos falló (no bloqueante)', err);
        }

        if (cancelled) return;
        setBoot({ phase: 'ready', services });

        // Respaldo rotacional al arrancar, como mucho cada 12 h (con fotos dentro de la
        // base, copiarla en cada arranque costaba tiempo y batería). No bloquea.
        if (appPrefs.autoBackup !== false) new ExpoBackupDatabaseUseCase()
          .execute({ db, minIntervalMs: 12 * 3600 * 1000 })
          .then((r) => r.skipped || diagnostics.info('backup', `Respaldo local: ${r.backupPath}`))
          .catch((err) => diagnostics.error('backup', 'El respaldo automático falló (no bloqueante)', err instanceof AppError ? err.toLogObject() : err));
      } catch (err) {
        diagnostics.error('boot', 'No se pudo abrir la base de datos', err);
        const message =
          err instanceof AppError
            ? err.userMessage
            : err instanceof MigrationError
              ? `No se pudo actualizar la base de datos (${err.message}). Tus datos no se modificaron; restaura un respaldo o reinstala la versión anterior.`
              : 'No se pudo abrir la base de datos local.';
        if (!cancelled) setBoot({ phase: 'error', message });
      }
    }

    initDatabase();
    return () => {
      cancelled = true;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Restauración: reiniciar la app
  // -----------------------------------------------------------------------

  const handleRestored = useCallback((restoredFrom: string) => {
    alertDialog(
      'Copia restaurada',
      `Se restauró la copia ${restoredFrom.split('/').pop()}. La app va a reiniciarse para cargar los ` +
        'datos restaurados.',
      [
        {
          text: 'Reiniciar',
          onPress: async () => {
            try {
              // Reinicio obligatorio, no una cortesía: la conexión anterior está
              // cerrada y todo el árbol de componentes tiene referencias a los
              // servicios construidos sobre ella.
              await Updates.reloadAsync();
            } catch {
              alertDialog(
                'Reinicia manualmente',
                'No se pudo reiniciar automáticamente. Cierra la app por completo y vuelve a abrirla.',
              );
            }
          },
        },
      ],
    );
  }, []);

  // -----------------------------------------------------------------------
  // Render — pasos del flujo
  // -----------------------------------------------------------------------

  if (!permissionsReady || boot.phase === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Iniciando PolyLive...</Text>
      </View>
    );
  }

  if (boot.phase === 'error') {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{boot.message}</Text>
      </View>
    );
  }

  const { services } = boot;

  // --- Paso 1: operador ---
  if (!operator) {
    return <OperatorSelectorScreen store={services.store} onSelect={setOperator} />;
  }

  const switchOperator = () => {
    setScreen(null);
    setOperator(null);
    setProject(null);
    setActiveRoomId(null);
  };
  const closeScreen = () => {
    setScreen(null);
    setGalleryFocus(null);
  };
  const openGallery = (focus: { objectId?: string; photoId?: string }) => {
    setGalleryFocus(focus);
    setScreen('gallery');
  };

  /** Pantallas del menú ☰: se deslizan por encima de lo que haya debajo. */
  const renderScreen = () => {
    if (!screen) return null;
    switch (screen) {
      case 'profile':
        return (
          <ScreenShell title="Operador" subtitle={operator.name} onBack={closeScreen}>
            <OperatorProfileScreen
              store={services.store}
              operator={operator}
              onUpdated={setOperator}
              onSwitchOperator={switchOperator}
            />
          </ScreenShell>
        );
      case 'settings':
        return (
          <ScreenShell title="Ajustes y respaldos" onBack={closeScreen} scroll={false}>
            <SettingsScreen
              services={services}
              dbName={DB_NAME}
              onOpenProfile={() => setScreen('profile')}
              onRestored={handleRestored}
            />
          </ScreenShell>
        );
      case 'gallery':
        return activeRoomId ? (
          <ScreenShell
            title={galleryFocus?.objectId ? 'Fotos del objeto' : 'Galería de fotos'}
            subtitle={project?.name}
            onBack={closeScreen}
            scroll={false}
          >
            <GalleryScreen
              services={services}
              roomId={activeRoomId}
              objectId={galleryFocus?.objectId}
              photoId={galleryFocus?.photoId}
              operatorName={operator.name}
            />
          </ScreenShell>
        ) : null;
      case 'export':
        return activeRoomId ? (
          <ScreenShell title="Exportar" subtitle="IFC 4 y DXF del recinto" onBack={closeScreen} scroll={false}>
            <ExportScreen
              services={services}
              roomId={activeRoomId}
              projectId={project?.id as unknown as string | undefined}
              projectName={project?.name}
              operatorName={operator.name}
            />
          </ScreenShell>
        ) : null;
    }
  };

  // --- Paso 2: proyecto ---
  if (!project) {
    return (
      <View style={styles.flex}>
        <ProjectsScreen
          services={services}
          operator={operator}
          onOpenProject={setProject}
          onOpenSettings={() => setScreen('settings')}
        />
        {renderScreen()}
      </View>
    );
  }

  // --- Paso 3: espacio dentro del proyecto ---
  if (!activeRoomId) {
    return (
      <View style={styles.flex}>
        <ProjectWorkspaceScreen
          services={services}
          project={project}
          onOpenSpace={setActiveRoomId}
          onBack={() => setProject(null)}
        />
        {renderScreen()}
      </View>
    );
  }

  // --- Paso 4: el levantamiento. Sin pestañas: todo lo demás está en ☰ ---
  return (
    <View style={styles.flex}>
      <StatusBar barStyle={colors.isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
      <SurveyScreen
        services={services}
        roomId={activeRoomId}
        projectId={project.id as unknown as string}
        projectName={project.name}
        projectCode={project.bimCode}
        operatorName={operator.name}
        onExit={() => setActiveRoomId(null)}
        onExitProject={() => {
          setActiveRoomId(null);
          setProject(null);
        }}
        onNavigate={setScreen}
        onOpenPhotos={(objectId) => openGallery({ objectId })}
        onOpenPhoto={(photoId) => openGallery({ photoId })}
      />
      {renderScreen()}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = themedStyles((colors) => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingText: {
    ...type.body,
    color: colors.textSecondary,
  },
}));
