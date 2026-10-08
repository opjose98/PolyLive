// =============================================================================
// dates.ts — Fechas LOCALES para nombres de archivo y cortes
// =============================================================================
//
// `toISOString()` da la hora UTC: en Colombia (UTC−5), un acta exportada a
// las 8 p. m. salía con la fecha de mañana. Lo que ve el operador (nombres de
// archivo, cortes de avance) usa siempre la fecha y la hora locales.
// =============================================================================

const two = (n: number) => String(n).padStart(2, '0');

/** Fecha local `AAAA-MM-DD`. */
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** Marca local `AAAAMMDD-HHMM` para nombres de archivo. */
export function localStamp(now = new Date()): string {
  return `${localDate(now).replace(/-/g, '')}-${two(now.getHours())}${two(now.getMinutes())}`;
}
