# Motor de Unidades & Precisión
**Archivos:** `lib/utils/unit_service.dart`, `lib/utils/precision_service.dart`, `lib/ui/state/project_settings.dart` (UnitSystem, LengthPrecision)

← [[INDEX]]  |  Conectado a: [[engine_snap]], [[engine_canvas]], [[engine_export]]

---

## Responsabilidad
Convertir y formatear todas las medidas entre el sistema interno (metros SI) y las unidades de display del usuario. Gestionar la precisión numérica en toda la cadena: display, snap, exportación.

---

## Principio Fundamental

```
WORLD SPACE: SIEMPRE metros (double)
DISPLAY: convertido según UnitSystem
INPUT USUARIO: convertido a metros antes de guardar
```

Este principio está respetado en toda la codebase. Ningún dato geométrico del dominio contiene unidades distintas a metros. **Correcto.**

---

## `UnitConverter`

| Método | Dirección |
|--------|-----------|
| `toDisplay(meters, unit)` | metros → unidad de display |
| `toMeters(value, unit)` | unidad de display → metros |
| `toDisplayArea(sqMeters, unit)` | m² → m² (métrico) o ft² (imperial) |

### Factores de conversión
```dart
_mmPerM   = 1000.0
_cmPerM   = 100.0
_inchPerM = 39.3701    // ⚠️ redondeado (exacto: 39.37007874...)
_ftPerM   = 3.28084    // ⚠️ redondeado (exacto: 3.28083989...)
_sqFtPerSqM = 10.7639  // ⚠️ redondeado (exacto: 10.76391042...)
```

El redondeo de los factores imperiales introduce un error acumulado de ~0.003% para pies y ~0.0003% para pulgadas. Para uso arquitectónico diario es aceptable, pero para contratos de precisión puede generar discrepancias.

---

## `UnitFormatter`

| Método | Descripción |
|--------|-------------|
| `length(meters, unit, decimals?, precision?)` | Formatea con etiqueta: "1.500 m" |
| `rawLength(meters, unit, decimals?, precision?)` | Solo número: "1.500" (para TextFields) |
| `area(sqMeters, unit, decimals?)` | "15.00 m²" o "161.46 ft²" |
| `unitLabel(unit)` | "mm", "cm", "m", "in", "ft" |
| `unitName(unit)` | "Milímetros (mm)", etc. |
| `areaUnitLabel(unit)` | "m²" o "ft²" |

### Precedencia de decimales
```
decimals explícito > PrecisionService.decimalsForUnit(precision, unit) > _lengthDecimals(unit)
```

El fallback `_lengthDecimals` existe para compatibilidad con call sites anteriores.

---

## `PrecisionService`

Centraliza la lógica de "cuántos decimales mostrar y cuál es la tolerancia de snap":

```
LengthPrecision.mm1 (1mm):
  stepMeters → 0.001
  snapTolerance → 0.005 (5× el paso, clamp [0.001, 0.1])
  decimalsForUnit(mm) → 0   (150 mm)
  decimalsForUnit(cm) → 1   (15.0 cm)
  decimalsForUnit(m)  → 3   (0.150 m)
  decimalsForUnit(in) → 2   (5.91 in)
  decimalsForUnit(ft) → 3   (0.492 ft)
```

### Duplicación de factores de conversión
`PrecisionService._toDisplayUnit` replica los factores de `UnitConverter` para evitar dependencia circular (`precision_service.dart` → `unit_service.dart` → `project_settings.dart` → circular).

**Esto es un smell arquitectural.** La solución correcta es mover los factores de conversión a un archivo separado (e.g., `lib/utils/unit_constants.dart`) del que ambos servicios importen sin circularidad.

---

## Flujo de Integración en la UI

```
Usuario elige UnitSystem en Settings
  ↓ projectSettingsProvider.defaults.baseUnit actualizado
  ↓
ContextualRibbon (ConsumerWidget)
  ← UnitFormatter.length(wall.length, settings.defaults.baseUnit, precision: settings.precision.lengthPrecision)
  ← UnitConverter.toMeters(rawValue, settings.defaults.baseUnit)  // al confirmar input

StaticLayerPainter
  ← UnitFormatter.length() para labels de muro
  ← UnitFormatter.area() para labels de habitación

PropertiesPanel
  ← UnitFormatter.rawLength() para TextFields
  ← UnitConverter.toMeters() al guardar
```

---

## Problemas Identificados

### CRÍTICO
- **`DefaultParameters.baseUnit` y el UnitSystem efectivo de la UI pueden estar desacoplados.** `DefaultParameters` tiene un campo `baseUnit` (UnitSystem), pero la UI también lee `projectSettingsProvider.defaults.baseUnit` directamente. Si alguien usa `ProjectSettings.copyWith(defaults: ...)` sin preservar el `baseUnit`, la UI puede mostrar unidades incorrectas sin error visible.

### MODERADO
- **Factores imperiales redondeados:** `_inchPerM = 39.3701` vs exacto `39.37007874016`. En 100m esto es 0.003mm de error — negligible para arquitectura pero incorrecto para BIM de precisión industrial.
- **Duplicación de factores en `PrecisionService._toDisplayUnit`:** Si se cambia un factor en `UnitConverter` hay que actualizarlo también en `PrecisionService`. No hay test que verifique consistencia entre ambos.
- **Sin soporte de unidades compuestas:** Arquitectura imperial usa feet+inches (e.g., `5'-3"`). La app solo muestra pies decimales (`5.25 ft`) o pulgadas decimales. Para el mercado americano esto es un bloqueante.

### MENOR
- `UnitSystem` está definido en `project_settings.dart` junto con `LengthPrecision`. Ambos son enums de utilidad que deberían vivir en `lib/utils/` o `lib/domain/`.
- No hay conversión de unidades de tiempo (para scheduling BIM futuro).
- No hay formateo de coordenadas absolutas en la UI — solo longitudes relativas.
