import 'package:shared_preferences/shared_preferences.dart';

/// Gestiona las preferencias globales de la aplicación LevON que persisten
/// entre sesiones y son independientes de cualquier proyecto específico.
///
/// Actualmente almacena:
///   - [defaultExportPath]: carpeta por defecto para archivos exportados (DXF, IFC, .levon)
///   - [defaultProjectPath]: carpeta por defecto para proyectos editables
///
/// Usa [SharedPreferences] para compatibilidad con Android y Windows/Desktop.
/// Las claves están prefijadas con `levon.global.` para evitar colisiones.
class GlobalPrefsService {
  static const String _keyDefaultExportPath = 'levon.global.defaultExportPath';
  static const String _keyDefaultProjectPath =
      'levon.global.defaultProjectPath';
  static const String _keyLastExportPath = 'levon.global.lastExportPath';

  // ── RUTA DE EXPORTACIÓN POR DEFECTO ────────────────────────────────────────

  /// Retorna la carpeta de exportación configurada por el usuario, o null si
  /// nunca se ha configurado (en ese caso se usa el directorio del sistema).
  Future<String?> getDefaultExportPath() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyDefaultExportPath);
  }

  /// Guarda la carpeta de exportación por defecto seleccionada por el usuario.
  Future<void> saveDefaultExportPath(String path) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyDefaultExportPath, path);
  }

  /// Elimina la carpeta de exportación por defecto (vuelve al comportamiento
  /// estándar del sistema operativo).
  Future<void> clearDefaultExportPath() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyDefaultExportPath);
  }

  // ── RUTA DE PROYECTOS POR DEFECTO ───────────────────────────────────────────

  /// Retorna la carpeta por defecto para proyectos editables, o null si
  /// no se ha configurado.
  Future<String?> getDefaultProjectPath() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyDefaultProjectPath);
  }

  /// Guarda la carpeta por defecto para nuevos proyectos.
  Future<void> saveDefaultProjectPath(String path) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyDefaultProjectPath, path);
  }

  /// Elimina la carpeta de proyectos por defecto.
  Future<void> clearDefaultProjectPath() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keyDefaultProjectPath);
  }

  // ── ÚLTIMA CARPETA DE EXPORTACIÓN USADA ────────────────────────────────────

  /// Retorna la última carpeta de exportación utilizada en una sesión anterior.
  /// Se usa para pre-seleccionar en el FilePicker, ofreciendo una UX fluida.
  Future<String?> getLastExportPath() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_keyLastExportPath);
  }

  /// Persiste la última carpeta usada para exportar (llamado automáticamente
  /// tras cada exportación exitosa).
  Future<void> saveLastExportPath(String path) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyLastExportPath, path);
  }

  // ── UTILIDADES ──────────────────────────────────────────────────────────────

  /// Retorna la ruta efectiva de exportación siguiendo el orden de prioridad:
  ///   1. Última carpeta usada (si existe)
  ///   2. Carpeta por defecto configurada (si existe)
  ///   3. null (el sistema usará su directorio estándar)
  Future<String?> resolveExportPath() async {
    final last = await getLastExportPath();
    if (last != null && last.isNotEmpty) return last;
    return getDefaultExportPath();
  }
}
