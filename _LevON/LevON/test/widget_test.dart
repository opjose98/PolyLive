// Smoke test funcional: verifica que LevonApp arranca y muestra la pantalla
// de proyectos sin errores. No prueba navegación profunda (requiere mocks de router).

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:levon/main.dart';
import 'package:levon/shared/state/providers.dart';
import 'package:levon/persistence/project_repository.dart';

void main() {
  testWidgets('LevonApp — pantalla inicial renderiza sin errores',
      (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: LevonApp()),
    );
    await tester.pump(); // primer frame

    // La pantalla de proyectos debe mostrar el logo en el appbar.
    expect(find.byKey(const Key('projects_appbar')), findsOneWidget);
  });

  testWidgets('LevonApp — AppBar contiene ícono de búsqueda', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: LevonApp()),
    );
    await tester.pump();

    expect(find.byIcon(Icons.search_rounded), findsOneWidget);
  });

  testWidgets('LevonApp — lista de proyectos mock está presente',
      (tester) async {
    final List<ProjectSummary> mockProjects = [
      ProjectSummary(id: '1', title: 'Casa Pérez', updatedAt: DateTime.now(), filePath: '1.levon'),
      ProjectSummary(id: '2', title: 'Oficina Central', updatedAt: DateTime.now(), filePath: '2.levon'),
      ProjectSummary(id: '3', title: 'Ampliación Terraza', updatedAt: DateTime.now(), filePath: '3.levon'),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          projectsListProvider.overrideWith((ref) => Future.value(mockProjects)),
        ],
        child: const LevonApp(),
      ),
    );
    await tester.pumpAndSettle();

    // Los tres proyectos mock deben aparecer en la pantalla inicial.
    expect(find.text('Casa Pérez'), findsOneWidget);
    expect(find.text('Oficina Central'), findsOneWidget);
    expect(find.text('Ampliación Terraza'), findsOneWidget);
  });
}
