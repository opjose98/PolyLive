// =============================================================================
// App.tsx — Punto de entrada y navegación
// Basado en: docs/10-NEXT-PHASE-ROADMAP.md §3.5, arquitectura-expo-skia.md
// =============================================================================
//
// FLUJO DE NAVEGACIÓN:
//   OperatorSelector → Proyectos → Espacios del proyecto → pestañas del espacio
//                                                           (Levantamiento /
//                                                            Galería / Exportar /
//                                                            Ajustes)
//   Perfil de operador y Topografía se abren como pantallas modales desde Ajustes.
//
// QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR: el flujo era
// `OperatorSelector → Dashboard (lista plana de Recintos) → pestañas`. Ahora hay
// un nivel de Proyecto por encima (ver domain/objects/project.ts sobre por qué).
// Al arrancar se adoptan los Recintos que existían sin proyecto, para que el
// trabajo hecho con la versión anterior no quede inalcanzable.
// =============================================================================

import React, { useEffect, useState, useCallback } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, Text, View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import * as Updates from 'expo-updates';

import { OperatorSelectorScreen } from './screens/OperatorSelectorScreen';
import { OperatorProfileScreen } from './screens/OperatorProfileScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProjectWorkspaceScreen } from './screens/ProjectWorkspaceScreen';
import { SurveyScreen } from './screens/SurveyScreen';
import { GalleryScreen } from './screens/GalleryScreen';
import { ExportScreen } from './screens/ExportScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SurveyControlScreen } from './screens/SurveyControlScreen';
import { WallElevationScreen } from './screens/WallElevationScreen';
// Alias para no chocar con el `StatusBar` de react-native (la barra del sistema
// operativo) — este es nuestro componente de estado BLE.
import { StatusBar as AppStatusBar } from './components/StatusBar';
import { PermissionsManager } from '../native/permissions/PermissionsManager';
import { ExpoSQLiteDatabase } from '../native/sqlite/ExpoSQLiteDatabase';
import { ExpoBackupDatabaseUseCase } from '../native/backup/ExpoBackupDatabaseUseCase';
import { createAppServices, AppServices } from '../application/AppServices';
import { createAppStore } from '../state/appStore';
import { RoomId } from '../domain/objects';
import { Operator } from '../domain/objects/operator';
import { Project } from '../domain/objects/project';
import { AppError } from '../shared/errors/AppError';
import { colors, spacing, typography, layout } from './theme/tokens';

const DB_NAME = 'polylive.db';
const Tab = createBottomTabNavigator();

// ---------------------------------------------------------------------------
// Estado de arranque
// ---------------------------------------------------------------------------

type BootStatus =
  | { phase: 'loading' }
  | { phase: 'ready'; services: AppServices }
  | { phase: 'error'; message: string };

/** Pantalla modal abierta por encima de la navegación por pestañas. */
type Overlay =
  | { kind: 'none' }
  | { kind: 'profile' }
  | { kind: 'surveyControl' }
  | { kind: 'elevation'; wallDbId: string };

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [permManager] = useState(() => new PermissionsManager());
  const [boot, setBoot] = useState<BootStatus>({ phase: 'loading' });
  const [appStore] = useState(() => createAppStore());

  const [operator, setOperator] = useState<Operator | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [activeRoomId, setActiveRoomId] = useState<RoomId | null>(null);
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });

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
        await Promise.race([
          permManager.requestAll(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('permissions timeout')), 8000)),
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
            Alert.alert(
              'Levantamientos recuperados',
              `Se agruparon ${adopted.adopted} Recinto(s) anteriores en el proyecto ` +
                `"${adopted.project.name}". Puedes renombrarlo o repartirlos en otros proyectos.`,
            );
          }
        } catch (err) {
          // La adopción es una comodidad, no un requisito para arrancar: si
          // falla, la app abre igual y los Recintos siguen adoptables después.
          // eslint-disable-next-line no-console
          console.warn('[PolyLive] Adopción de Recintos huérfanos falló (no bloqueante):', err);
        }

        if (cancelled) return;
        setBoot({ phase: 'ready', services });

        // Backup rotacional al arrancar — no bloquea ni tumba la app si falla.
        new ExpoBackupDatabaseUseCase().execute({ db }).catch((err) => {
          const message = err instanceof AppError ? err.toLogObject() : err;
          // eslint-disable-next-line no-console
          console.warn('[PolyLive] Backup automático falló (no bloqueante):', message);
        });
      } catch (err) {
        const message =
          err instanceof AppError ? err.userMessage : 'No se pudo abrir la base de datos local.';
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
    Alert.alert(
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
              Alert.alert(
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

  // --- Overlays (se muestran por encima de cualquier paso) ---
  if (overlay.kind === 'profile') {
    return (
      <OperatorProfileScreen
        store={services.store}
        operator={operator}
        onUpdated={setOperator}
        onSwitchOperator={() => {
          setOverlay({ kind: 'none' });
          setOperator(null);
          setProject(null);
          setActiveRoomId(null);
        }}
      />
    );
  }

  if (overlay.kind === 'surveyControl') {
    return (
      <View style={styles.flex}>
        <OverlayBar title="Topografía" onBack={() => setOverlay({ kind: 'none' })} />
        <SurveyControlScreen services={services} operator={operator} appStore={appStore} />
      </View>
    );
  }

  if (overlay.kind === 'elevation' && activeRoomId) {
    return (
      <View style={styles.flex}>
        <OverlayBar title="Elevación de muro" onBack={() => setOverlay({ kind: 'none' })} />
        <WallElevationScreen
          services={services}
          roomId={activeRoomId}
          wallDbId={overlay.wallDbId}
          onClose={() => setOverlay({ kind: 'none' })}
        />
      </View>
    );
  }

  // --- Paso 2: proyecto ---
  if (!project) {
    return (
      <ProjectsScreen
        services={services}
        operator={operator}
        onOpenProject={setProject}
        onOpenSettings={() => setOverlay({ kind: 'profile' })}
      />
    );
  }

  // --- Paso 3: espacio dentro del proyecto ---
  if (!activeRoomId) {
    return (
      <ProjectWorkspaceScreen
        services={services}
        project={project}
        onOpenSpace={setActiveRoomId}
        onBack={() => setProject(null)}
      />
    );
  }

  // --- Paso 4: espacio activo, navegación por pestañas ---
  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor={colors.surface} />
      {/* Barra de estado BLE oculta: el medidor láser queda para una versión posterior. */}

      <NavigationContainer>
        <Tab.Navigator
          screenOptions={{
            headerShown: false,
            tabBarStyle: styles.tabBar,
            tabBarActiveTintColor: colors.navy,
            tabBarInactiveTintColor: colors.textDisabled,
            tabBarLabelStyle: styles.tabLabel,
          }}
        >
          <Tab.Screen
            name="Survey"
            options={{
              tabBarLabel: 'Levantamiento',
              tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>✎</Text>,
            }}
          >
            {() => (
              <SurveyScreen
                services={services}
                roomId={activeRoomId}
                appStore={appStore}
                onOpenElevation={(wallDbId) => setOverlay({ kind: 'elevation', wallDbId })}
                projectId={project.id as unknown as string}
                projectName={project.name}
                projectCode={project.bimCode}
                operatorName={operator.name}
                onExit={() => setActiveRoomId(null)}
              />
            )}
          </Tab.Screen>

          <Tab.Screen
            name="Gallery"
            options={{
              tabBarLabel: 'Galería',
              tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>▣</Text>,
            }}
          >
            {() => <GalleryScreen services={services} roomId={activeRoomId} />}
          </Tab.Screen>

          <Tab.Screen
            name="Export"
            options={{
              tabBarLabel: 'Exportar',
              tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>↑</Text>,
            }}
          >
            {() => <ExportScreen services={services} roomId={activeRoomId} />}
          </Tab.Screen>

          <Tab.Screen
            name="Settings"
            options={{
              tabBarLabel: 'Ajustes',
              tabBarIcon: ({ color }) => <Text style={[styles.tabIcon, { color }]}>⚙</Text>,
            }}
          >
            {() => (
              <SettingsScreen
                services={services}
                dbName={DB_NAME}
                onOpenProfile={() => setOverlay({ kind: 'profile' })}
                onOpenSurveyControl={() => setOverlay({ kind: 'surveyControl' })}
                onRestored={handleRestored}
              />
            )}
          </Tab.Screen>
        </Tab.Navigator>
      </NavigationContainer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Barra de las pantallas modales
// ---------------------------------------------------------------------------

function OverlayBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.overlayBar}>
      <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Volver">
        <Text style={styles.breadcrumbLink}>‹ Volver</Text>
      </TouchableOpacity>
      <Text style={styles.overlayTitle}>{title}</Text>
      <View style={styles.overlaySpacer} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.surface2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  breadcrumbLink: {
    ...typography.bodyStrong,
    color: colors.navy,
  },
  breadcrumbCode: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  overlayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  overlayTitle: {
    ...typography.heading,
    color: colors.textPrimary,
  },
  overlaySpacer: {
    width: 64,
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.divider,
    height: layout.tabBarHeight,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
  },
  tabLabel: {
    ...typography.caption,
    fontWeight: '600',
  },
  tabIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
});
