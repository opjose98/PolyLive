import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive_io.dart';

/// Entrada de media a embeber dentro del contenedor .levon.
///
/// [relativePath] sigue el convenio "media/<id>.<ext>" para mantener
/// referencias portables e independientes del sistema de archivos anfitrión.
class MediaEntry {
  final String relativePath;
  final Uint8List bytes;

  const MediaEntry({required this.relativePath, required this.bytes});
}

/// Encapsula la lectura y escritura del contenedor ZIP con extensión .levon.
///
/// Estructura interna del archivo:
/// ```
/// project.levon (ZIP)
/// ├── project.json    — modelo BIM completo (muros, columnas, relaciones…)
/// ├── metadata.json   — descriptor ligero para listado rápido
/// ├── preview.png     — miniatura generada del canvas (opcional)
/// └── media/
///     └── <photo_id>.<ext>   — imágenes embebidas con rutas relativas
/// ```
///
/// Principios de diseño:
/// - Escritura atómica: se escribe a un `.levon.tmp` y luego se renombra,
///   evitando archivos corruptos si el proceso se interrumpe a mitad.
/// - Los archivos JSON se comprimen con DEFLATE; las imágenes se almacenan
///   sin compresión (PNG/JPEG ya están comprimidos internamente).
/// - La lectura de metadata es O(1) — sólo descomprime el primer entry
///   `metadata.json`, sin leer el modelo completo.
class LevonArchiveService {
  static const String _entryProjectJson = 'project.json';
  static const String _entryMetadata = 'metadata.json';
  static const String _entryPreview = 'preview.png';

  // ── ESCRITURA ──────────────────────────────────────────────────────────────

  /// Escribe (o sobreescribe) el archivo .levon de forma atómica.
  ///
  /// Si [previewBytes] es null, no se incluye `preview.png`.
  /// Si [mediaFiles] está vacío, el directorio `media/` queda ausente.
  ///
  /// Lanza [LevonArchiveWriteException] ante cualquier fallo de I/O.
  Future<void> writeArchive({
    required File levonFile,
    required String projectJson,
    required String metadataJson,
    Uint8List? previewBytes,
    List<MediaEntry> mediaFiles = const [],
  }) async {
    // Construir el archivo ZIP en memoria antes de toccar disco.
    final archive = Archive();

    // project.json — comprimido con DEFLATE
    archive.addFile(ArchiveFile(
      _entryProjectJson,
      projectJson.length,
      utf8.encode(projectJson),
    ));

    // metadata.json — comprimido con DEFLATE
    archive.addFile(ArchiveFile(
      _entryMetadata,
      metadataJson.length,
      utf8.encode(metadataJson),
    ));

    // preview.png — almacenado sin compresión adicional (PNG ya comprimido)
    if (previewBytes != null) {
      archive.addFile(ArchiveFile(
        _entryPreview,
        previewBytes.length,
        previewBytes,
      ));
    }

    // media/* — almacenados sin compresión adicional
    for (final entry in mediaFiles) {
      archive.addFile(ArchiveFile(
        entry.relativePath,
        entry.bytes.length,
        entry.bytes,
      ));
    }

    // Serializar a bytes ZIP
    final zipBytes = ZipEncoder().encode(archive);
    if (zipBytes == null) {
      throw LevonArchiveWriteException(
          levonFile.path, 'ZipEncoder retornó null');
    }

    // Escritura atómica: archivo temporal → rename
    final tmpFile = File('${levonFile.path}.tmp');
    try {
      await tmpFile.writeAsBytes(zipBytes, flush: true);
      // Asegurar que el directorio padre existe antes del rename
      await levonFile.parent.create(recursive: true);
      await tmpFile.rename(levonFile.path);
    } on IOException catch (e) {
      // Limpiar el temporal si el rename falló
      if (await tmpFile.exists()) await tmpFile.delete();
      throw LevonArchiveWriteException(levonFile.path, e);
    }
  }

  // ── LECTURA — project.json ─────────────────────────────────────────────────

  /// Deserializa y retorna el mapa de `project.json` del contenedor.
  ///
  /// Lanza [LevonArchiveReadException] si el archivo no existe,
  /// no es un ZIP válido o no contiene `project.json`.
  Future<Map<String, dynamic>> readProjectJson(File levonFile) async {
    final archive = await _openArchive(levonFile);
    final entry = archive.findFile(_entryProjectJson);
    if (entry == null) {
      throw LevonArchiveReadException(
        levonFile.path,
        'Entry project.json no encontrado en el archivo',
      );
    }
    final content = utf8.decode(entry.content as List<int>);
    return jsonDecode(content) as Map<String, dynamic>;
  }

  // ── LECTURA — metadata.json ────────────────────────────────────────────────

  /// Lee únicamente `metadata.json` para listar proyectos sin cargar el modelo.
  ///
  /// Optimización: el decoder ZIP busca el entry por nombre y sólo descomprime
  /// ese bloque — el modelo BIM completo no se toca.
  Future<Map<String, dynamic>> readMetadata(File levonFile) async {
    final archive = await _openArchive(levonFile);
    final entry = archive.findFile(_entryMetadata);
    if (entry == null) {
      throw LevonArchiveReadException(
        levonFile.path,
        'Entry metadata.json no encontrado',
      );
    }
    final content = utf8.decode(entry.content as List<int>);
    return jsonDecode(content) as Map<String, dynamic>;
  }

  // ── LECTURA — preview.png ──────────────────────────────────────────────────

  /// Retorna los bytes de `preview.png`, o null si no existe en el archivo.
  Future<Uint8List?> readPreview(File levonFile) async {
    final archive = await _openArchive(levonFile);
    final entry = archive.findFile(_entryPreview);
    if (entry == null) return null;
    return Uint8List.fromList(entry.content as List<int>);
  }

  // ── LECTURA — media ────────────────────────────────────────────────────────

  /// Extrae un archivo de media a un directorio temporal y retorna el [File].
  ///
  /// [relativePath] debe coincidir con el valor guardado en la entidad Photo
  /// (e.g., `"media/photo_abc123.jpg"`).
  ///
  /// Lanza [LevonArchiveReadException] si el entry no existe.
  Future<File> extractMedia(
    File levonFile,
    String relativePath,
    Directory tempDir,
  ) async {
    final archive = await _openArchive(levonFile);
    final entry = archive.findFile(relativePath);
    if (entry == null) {
      throw LevonArchiveReadException(
        levonFile.path,
        'Media entry no encontrado: $relativePath',
      );
    }
    final fileName = relativePath.split('/').last;
    final outFile = File('${tempDir.path}${Platform.pathSeparator}$fileName');
    await outFile.writeAsBytes(entry.content as List<int>);
    return outFile;
  }

  // ── PRIVADOS ───────────────────────────────────────────────────────────────

  /// Abre el archivo .levon y retorna el [Archive] decodificado.
  Future<Archive> _openArchive(File levonFile) async {
    if (!await levonFile.exists()) {
      throw LevonArchiveReadException(
        levonFile.path,
        'Archivo .levon no encontrado en disco',
      );
    }
    try {
      final bytes = await levonFile.readAsBytes();
      return ZipDecoder().decodeBytes(bytes);
    } on ArchiveException catch (e) {
      throw LevonArchiveReadException(levonFile.path, e);
    } on IOException catch (e) {
      throw LevonArchiveReadException(levonFile.path, e);
    }
  }
}

// ── EXCEPCIONES ───────────────────────────────────────────────────────────────

class LevonArchiveWriteException implements Exception {
  final String path;
  final Object cause;
  const LevonArchiveWriteException(this.path, this.cause);

  @override
  String toString() => 'LevonArchiveWriteException($path): $cause';
}

class LevonArchiveReadException implements Exception {
  final String path;
  final Object cause;
  const LevonArchiveReadException(this.path, this.cause);

  @override
  String toString() => 'LevonArchiveReadException($path): $cause';
}
