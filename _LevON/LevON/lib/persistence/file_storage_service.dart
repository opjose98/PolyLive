import 'dart:io';
import 'package:path_provider/path_provider.dart';

/// Gestiona las rutas del sistema de archivos para el almacenamiento de LevON.
///
/// Todos los proyectos se guardan como contenedores .levon en:
///   <documentos>/LevON/projects/project_<id>.levon
///
/// Los exportes (DXF, IFC JSON) se guardan en:
///   <documentos>/LevON/exports/<nombre>
///
/// Los directorios se crean de forma lazy en el primer acceso
/// (no se crean en el constructor para evitar I/O síncrono en caliente).
class FileStorageService {
  static const String _rootDir = 'LevON';
  static const String _projectsDir = 'projects';
  static const String _exportDir = 'exports';

  // ── DIRECTORIOS ────────────────────────────────────────────────────────────

  Future<Directory> get projectsDirectory => _resolveDir([_projectsDir]);

  Future<Directory> get exportDirectory => _resolveDir([_exportDir]);

  // ── ARCHIVOS DE PROYECTO ───────────────────────────────────────────────────

  /// Retorna el [File] correspondiente al archivo .levon del proyecto [projectId].
  ///
  /// El archivo puede no existir todavía; los callers deben verificar con
  /// [File.exists()] antes de leer, o simplemente escribir para crearlo.
  Future<File> levonFile(String projectId) async {
    final dir = await projectsDirectory;
    return File('${dir.path}${Platform.pathSeparator}project_$projectId.levon');
  }

  /// Alias de [levonFile] para compatibilidad con callers existentes.
  ///
  /// Todos los nuevos callers deben usar [levonFile] directamente.
  Future<File> projectFile(String projectId) => levonFile(projectId);

  // ── ARCHIVOS DE EXPORTACIÓN ────────────────────────────────────────────────

  /// Retorna un [File] en el directorio de exportes con el nombre dado.
  Future<File> exportFile(String name) async {
    final dir = await exportDirectory;
    return File('${dir.path}${Platform.pathSeparator}$name');
  }

  // ── LISTADO ────────────────────────────────────────────────────────────────

  /// Lista todos los archivos .levon ordenados por fecha de modificación
  /// descendente (más reciente primero).
  Future<List<File>> listLevonFiles() async {
    final dir = await projectsDirectory;
    final entities = await dir.list().toList();
    final files = entities
        .whereType<File>()
        .where((f) => f.path.endsWith('.levon'))
        .toList();
    files.sort((a, b) {
      return b.lastModifiedSync().compareTo(a.lastModifiedSync());
    });
    return files;
  }

  /// Alias de [listLevonFiles] para compatibilidad con callers existentes.
  Future<List<File>> listProjectFiles() => listLevonFiles();

  // ── PRIVADOS ───────────────────────────────────────────────────────────────

  Future<Directory> _resolveDir(List<String> segments) async {
    final docs = await getApplicationDocumentsDirectory();
    final path =
        [docs.path, _rootDir, ...segments].join(Platform.pathSeparator);
    final dir = Directory(path);
    if (!await dir.exists()) await dir.create(recursive: true);
    return dir;
  }
}
