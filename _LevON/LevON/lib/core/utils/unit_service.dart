import 'package:levon/shared/state/project_settings.dart';
import 'package:levon/core/utils/precision_service.dart';

/// Motor de unidades de LevON.
///
/// PRINCIPIO: el mundo interno (domain, geometría, persistencia) usa SIEMPRE
/// metros SI. Las unidades de display son puramente una capa de presentación.
///
/// Pipeline:
///   world-space metros → [UnitConverter.toDisplay] → valor display
///   valor display (input usuario) → [UnitConverter.toMeters] → world-space metros

// ─── CONVERSIÓN ────────────────────────────────────────────────────────────────

class UnitConverter {
  static const double _mmPerM = 1000.0;
  static const double _cmPerM = 100.0;
  static const double _inchPerM = 39.3701;
  static const double _ftPerM = 3.28084;
  static const double _sqFtPerSqM = 10.7639;

  /// Metros → valor en unidad de display.
  static double toDisplay(double meters, UnitSystem unit) => switch (unit) {
        UnitSystem.mm => meters * _mmPerM,
        UnitSystem.cm => meters * _cmPerM,
        UnitSystem.m => meters,
        UnitSystem.inch => meters * _inchPerM,
        UnitSystem.foot => meters * _ftPerM,
      };

  /// Valor en unidad de display → metros (para guardar en dominio).
  static double toMeters(double value, UnitSystem unit) => switch (unit) {
        UnitSystem.mm => value / _mmPerM,
        UnitSystem.cm => value / _cmPerM,
        UnitSystem.m => value,
        UnitSystem.inch => value / _inchPerM,
        UnitSystem.foot => value / _ftPerM,
      };

  /// m² → valor en unidad de área apropiada (m² para métrico, ft² para imperial).
  static double toDisplayArea(double sqMeters, UnitSystem unit) =>
      (unit == UnitSystem.inch || unit == UnitSystem.foot)
          ? sqMeters * _sqFtPerSqM
          : sqMeters;
}

// ─── FORMATEO ──────────────────────────────────────────────────────────────────

class UnitFormatter {
  /// Formatea metros → string completo con etiqueta.
  ///
  /// Si se pasa [precision], los decimales se calculan vía [PrecisionService]
  /// para representar el paso de precisión sin pérdida visual.
  /// Si se pasa [decimals] explícito, tiene precedencia sobre ambos.
  /// Ejemplo: length(0.15, cm, precision: LengthPrecision.mm1) → "15.0 cm"
  static String length(
    double meters,
    UnitSystem unit, {
    int? decimals,
    LengthPrecision? precision,
  }) {
    final d = decimals ??
        (precision != null
            ? PrecisionService.decimalsForUnit(precision, unit)
            : _lengthDecimals(unit));
    final v = UnitConverter.toDisplay(meters, unit);
    return '${v.toStringAsFixed(d)} ${unitLabel(unit)}';
  }

  /// Solo el número en unidades de display, sin etiqueta.
  /// Usado como [rawValue] en _PropField para que el TextField no muestre la unidad.
  static String rawLength(
    double meters,
    UnitSystem unit, {
    int? decimals,
    LengthPrecision? precision,
  }) {
    final d = decimals ??
        (precision != null
            ? PrecisionService.decimalsForUnit(precision, unit)
            : _lengthDecimals(unit));
    return UnitConverter.toDisplay(meters, unit).toStringAsFixed(d);
  }

  /// Formatea m² → string con unidad de área.
  /// Métrico (mm/cm/m): m² | Imperial (inch/foot): ft²
  static String area(double sqMeters, UnitSystem unit, {int? decimals}) {
    final d = decimals ?? 2;
    if (unit == UnitSystem.inch || unit == UnitSystem.foot) {
      return '${UnitConverter.toDisplayArea(sqMeters, unit).toStringAsFixed(d)} ft²';
    }
    return '${sqMeters.toStringAsFixed(d)} m²';
  }

  /// Etiqueta abreviada: 'mm', 'cm', 'm', 'in', 'ft'.
  static String unitLabel(UnitSystem unit) => switch (unit) {
        UnitSystem.mm => 'mm',
        UnitSystem.cm => 'cm',
        UnitSystem.m => 'm',
        UnitSystem.inch => 'in',
        UnitSystem.foot => 'ft',
      };

  /// Nombre descriptivo completo para menús de selección.
  static String unitName(UnitSystem unit) => switch (unit) {
        UnitSystem.mm => 'Milímetros (mm)',
        UnitSystem.cm => 'Centímetros (cm)',
        UnitSystem.m => 'Metros (m)',
        UnitSystem.inch => 'Pulgadas (in)',
        UnitSystem.foot => 'Pies (ft)',
      };

  /// Etiqueta para unidad de área según sistema.
  static String areaUnitLabel(UnitSystem unit) =>
      (unit == UnitSystem.inch || unit == UnitSystem.foot) ? 'ft²' : 'm²';

  // Decimales de fallback cuando no se pasa precision — mantiene comportamiento
  // anterior para call sites que aún no han sido migrados.
  static int _lengthDecimals(UnitSystem unit) => switch (unit) {
        UnitSystem.mm => 0,
        UnitSystem.cm => 1,
        UnitSystem.m => 2,
        UnitSystem.inch => 2,
        UnitSystem.foot => 3,
      };
}
