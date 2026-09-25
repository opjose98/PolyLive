/// Precisión métrica BIM en metros.
///
/// Cualquier diferencia de coordenadas inferior a este valor se considera
/// que los puntos son idénticos. Equivale a 1 mm, suficiente para el
/// levantamiento arquitectónico a escala humana.
const double metricPrecision = 0.001;

/// Alias semántico de [metricPrecision]. Se usa en comparaciones geométricas
/// donde el nombre "epsilon" es más expresivo que "metricPrecision".
const double epsilon = metricPrecision;

/// Compara dos valores double con tolerancia [precision].
///
/// Evita errores de punto flotante en comparaciones geométricas.
/// Por defecto usa [metricPrecision] (1 mm).
bool isCloseEnough(double a, double b, [double precision = metricPrecision]) {
  return (a - b).abs() <= precision;
}
