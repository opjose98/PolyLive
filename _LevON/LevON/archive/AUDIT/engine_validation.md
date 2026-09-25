# Motor de Validación BIM
**Archivos:** `lib/domain/validators/validation_pipeline.dart`

← [[INDEX]]  |  Conectado a: [[engine_state]], [[engine_geometry]], [[engine_canvas]]

---

## Responsabilidad
Detectar problemas en el modelo BIM y reportarlos con ubicación y severidad para que el usuario pueda corregirlos. Opera sobre el snapshot completo del proyecto.

---

## Arquitectura del Pipeline

Patrón Strategy + Chain of Responsibility:

```
ValidationPipeline
  └── _rules: List<ValidationRule>
        ├── LongitudMinimaValidator
        └── SolapamientoValidator

ValidationPipeline.run(project) → List<ValidationIssue>
```

### `ValidationRule` (interfaz)
```dart
abstract class ValidationRule {
  List<ValidationIssue> validate(Project project);
}
```

Las reglas son puras: sin estado, sin efectos secundarios. Agregar una nueva regla = implementar la interfaz + añadirla a `_rules`.

---

## Reglas Implementadas

### `LongitudMinimaValidator`
- **Trigger:** muro con `geometry.length < minLength` (default: 0.1m)
- **Severidad:** error
- **Complejidad:** O(n) donde n = muros

### `SolapamientoValidator`
- **Trigger:** dos muros se cruzan en un punto que no es extremo de ninguno de los dos
- **Lógica de exclusión:** Si el punto de intersección está en el extremo de AL MENOS uno de los dos muros, se considera una unión válida (T o esquina). Solo se reporta si no está en ningún extremo.
- **Severidad:** advertencia
- **Complejidad:** O(n²) — todos los pares de muros

---

## Integración con Riverpod

```
validationProvider = Provider<List<ValidationIssue>>
  watch: currentProjectSnapshotProvider
  → ValidationPipeline().run(project)  ← nueva instancia en cada recalculo
```

**Problema:** `ValidationPipeline()` se instancia en cada evaluación del provider. Para las reglas sin estado esto es equivalente a un singleton, pero es innecesariamente costoso (garbage collection).

---

## `ValidationIssue`

```dart
class ValidationIssue {
  final String id;          // "LONG_MINIMA_<wallId>" o "SOLAPAMIENTO_<w1>_<w2>"
  final String message;     // descripción legible
  final ValidationSeverity severity;  // info | advertencia | error
  final Vector2? location;  // coordenada mundo del problema
  final List<String> relatedEntityIds;  // IDs de entidades implicadas
}
```

---

## Problemas Identificados

### CRÍTICO
- **`SolapamientoValidator` es O(n²) y se ejecuta en cada cambio de muro:** Con 50 muros = 1225 comparaciones. Ejecutándose en `validationProvider` que reactivamente se recalcula con cada `addWall/updateWall`. Durante un drag de handle, esto puede ejecutarse 60 veces por segundo. Necesita throttle o ejecución diferida.
- **Solo 2 reglas implementadas:** Para BIM profesional se necesitan al menos: muros sin conectar (nodos sueltos), habitaciones demasiado pequeñas (< 1m²), altura de muro fuera de rango, solapamiento de columnas con muros.

### MODERADO
- **La condición de "unión válida" en `SolapamientoValidator` es demasiado permisiva.** Actualmente, si el punto de intersección está en el extremo de UNO de los dos muros (unión T), no se reporta. Pero si dos muros se cruzan exactamente en sus extremos en forma de X (no T), tampoco se reporta. En realidad, una unión X debería reportarse como advertencia.
- **`ValidationPipeline` instanciada como nueva en cada recalculo.** Debería ser un singleton o `const`.
- **`validationProvider` crea una nueva `ValidationPipeline()` y la descarta en cada evaluación.** El objeto tiene `List<ValidationRule> _rules` que se recrea en cada evaluación. Con reglas sin estado, el costo real es mínimo pero el patrón es incorrecto.

### MENOR
- Los IDs de issue no incluyen información de espacio/planta. Con multi-espacio futuro, "SOLAPAMIENTO_id1_id2" puede repetirse en plantas distintas.
- No hay severidad `info` usada actualmente. Está definida pero ninguna regla la usa.
- Los mensajes de error están en español hardcodeado. Sin i18n.
