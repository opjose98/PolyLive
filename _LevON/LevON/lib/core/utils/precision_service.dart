import 'dart:math';
import 'package:levon/shared/state/project_settings.dart';

/// Motor de precisión de LevON.
///
/// Traduce [LengthPrecision] en:
///   - Paso en metros ([stepMeters])
///   - Decimales de display según unidad ([decimalsForUnit])
///   - Tolerancia de snap geométrico ([snapTolerance])
///   - Redondeo al paso más cercano ([roundToStep])
///
/// PRINCIPIO: ningún método aquí modifica geometría.
/// Solo produce valores para display y snap visual.
class PrecisionService {
  static const Map<LengthPrecision, double> _stepMeters = {
    LengthPrecision.m1:    1.000,
    LengthPrecision.mm100: 0.100,
    LengthPrecision.mm10:  0.010,
    LengthPrecision.mm1:   0.001,
  };

  /// Paso en metros correspondiente al nivel de precisión.
  static double stepMeters(LengthPrecision p) => _stepMeters[p]!;

  /// Tolerancia de snap geométrico en metros: 5× el paso, entre 1mm y 10cm.
  ///
  /// Garantiza que el snap visual sea coherente con la precisión configurada
  /// sin exceder un radio que confunda al usuario.
  static double snapTolerance(LengthPrecision p) =>
      (_stepMeters[p]! * 5).clamp(0.001, 0.1);

  /// Decimales necesarios para representar [p] en [unit] sin pérdida visible.
  ///
  /// Fórmula: decimales = ⌈-log₁₀(paso_en_unidad)⌉, mínimo 0.
  ///
  /// Ejemplos con precisión 1mm:
  ///   mm  → 0 dec  ("150 mm")
  ///   cm  → 1 dec  ("15.0 cm")
  ///   m   → 3 dec  ("0.150 m")
  ///   in  → 2 dec  ("5.91 in")
  ///   ft  → 3 dec  ("0.492 ft")
  static int decimalsForUnit(LengthPrecision p, UnitSystem unit) {
    final stepInUnit = _toDisplayUnit(_stepMeters[p]!, unit);
    if (stepInUnit >= 1.0) return 0;
    return (-log(stepInUnit) / ln10).ceil().clamp(0, 6);
  }

  /// Redondea [meters] al paso de precisión más cercano.
  ///
  /// Solo debe usarse para ajuste de input del usuario, nunca para
  /// modificar coordenadas almacenadas en el dominio.
  static double roundToStep(double meters, LengthPrecision p) {
    final step = _stepMeters[p]!;
    return (meters / step).round() * step;
  }

  /// Nombre descriptivo del nivel de precisión para menús de selección.
  static String precisionName(LengthPrecision p) => switch (p) {
        LengthPrecision.m1    => '1 m (baja)',
        LengthPrecision.mm100 => '10 cm (0.1 m)',
        LengthPrecision.mm10  => '1 cm (0.01 m)',
        LengthPrecision.mm1   => '1 mm (alta, BIM)',
      };

  // Convierte metros a la unidad de display — replica factores de UnitConverter
  // sin crear dependencia circular con unit_service.dart.
  static double _toDisplayUnit(double meters, UnitSystem unit) =>
      switch (unit) {
        UnitSystem.mm   => meters * 1000.0,
        UnitSystem.cm   => meters * 100.0,
        UnitSystem.m    => meters,
        UnitSystem.inch => meters * 39.3701,
        UnitSystem.foot => meters * 3.28084,
      };
}
