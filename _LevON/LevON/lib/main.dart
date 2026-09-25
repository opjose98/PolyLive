import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:levon/features/projects/ui/projects_screen.dart';
import 'package:levon/features/projects/ui/project_workspace_screen.dart';
import 'package:levon/features/editor/ui/editor_screen.dart';
import 'package:levon/features/photos/ui/photo_collection_screen.dart';
import 'package:levon/ui/theme/levon_tokens.dart';

/// Punto de entrada de la aplicación LevON.
///
/// Envuelve el árbol de widgets en [ProviderScope] para habilitar Riverpod
/// como sistema de gestión de estado reactivo en toda la aplicación.
void main() {
  runApp(
    const ProviderScope(
      child: LevonApp(),
    ),
  );
}

/// Widget raíz de la aplicación.
///
/// Configura:
///   - [LevonTheme.light]: tema visual de la aplicación.
///   - [_router]: árbol de rutas con GoRouter.
///   - [MaterialApp.router]: integración del router con Flutter.
class LevonApp extends StatelessWidget {
  const LevonApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'LevON',
      theme: LevonTheme.light,
      routerConfig: _router,
    );
  }
}

/// Configuración de rutas de la aplicación usando GoRouter.
///
/// Árbol de rutas:
///   /projects                                              → ProjectsScreen
///   /projects/:id/workspaces                               → ProjectWorkspaceScreen
///   /projects/:id/workspaces/:workspaceId                  → EditorScreen
///   /projects/:id/workspaces/photos/:collectionId          → PhotoCollectionScreen
final _router = GoRouter(
  initialLocation: '/projects',
  routes: [
    GoRoute(
      path: '/projects',
      builder: (context, state) => const ProjectsScreen(),
      routes: [
        GoRoute(
          path: ':projectId/workspaces',
          builder: (context, state) => ProjectWorkspaceScreen(
            projectId: state.pathParameters['projectId']!,
          ),
          routes: [
            GoRoute(
              path: 'photos/:collectionId',
              builder: (context, state) => PhotoCollectionScreen(
                projectId: state.pathParameters['projectId']!,
                collectionId: state.pathParameters['collectionId']!,
              ),
            ),
            GoRoute(
              path: ':workspaceId',
              builder: (context, state) => EditorScreen(
                projectId: state.pathParameters['projectId']!,
                workspaceId: state.pathParameters['workspaceId']!,
              ),
            ),
          ],
        ),
      ],
    ),
  ],
);
