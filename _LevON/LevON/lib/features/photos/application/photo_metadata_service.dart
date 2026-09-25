import 'dart:io' show File, Platform;
import 'dart:math' as math;
import 'dart:typed_data';

import 'package:geolocator/geolocator.dart';
import 'package:sensors_plus/sensors_plus.dart';

import 'package:levon/features/photos/domain/photo_entity.dart';

/// Motor de captura de metadata para el SPDS.
///
/// Combina:
///   - GPS: coordenadas, altitud, precisión (geolocator)
///   - Orientación: azimut, pitch, roll (sensors_plus)
///   - EXIF: parsing básico desde bytes JPEG
///   - Dispositivo: plataforma y modelo básico
///
/// Degradación graceful: si un sensor no está disponible (desktop, sin GPS),
/// los campos correspondientes quedan null — nunca lanza excepción.
class PhotoMetadataService {
  const PhotoMetadataService();

  /// Captura metadata completa para una fotografía.
  ///
  /// [imagePath]: ruta al archivo de imagen (para extraer EXIF).
  /// [includeLocation]: solicitar GPS (requiere permiso previo).
  /// [includeOrientation]: leer sensores de orientación.
  Future<CaptureMetadata> captureMetadata({
    required String imagePath,
    bool includeLocation = true,
    bool includeOrientation = true,
  }) async {
    // Capturar en paralelo para minimizar el tiempo de espera
    final futures = await Future.wait([
      includeLocation ? _captureLocation() : Future<Position?>.value(null),
      includeOrientation
          ? _captureOrientation()
          : Future<CaptureOrientation?>.value(null),
      _parseExifBasic(imagePath),
    ]);

    final position = futures[0] as Position?;
    final orientation = futures[1] as CaptureOrientation?;
    final exif = futures[2] as Map<String, String>;

    return CaptureMetadata(
      latitude: position?.latitude,
      longitude: position?.longitude,
      altitude: position?.altitude,
      accuracy: position?.accuracy,
      azimuth: orientation?.azimuth,
      compassDirection: orientation?.compassDirection,
      capturedAt: _extractCaptureTime(exif),
      deviceModel: _deviceModel(),
      deviceManufacturer: _deviceManufacturer(),
      exifData: exif,
      orientation: orientation,
    );
  }

  // ── GPS ───────────────────────────────────────────────────────────────────

  Future<Position?> _captureLocation() async {
    try {
      if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
        return null;
      }
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) return null;

      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        return null;
      }

      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 8),
        ),
      ).timeout(const Duration(seconds: 10), onTimeout: () => throw Exception());
    } catch (_) {
      return null;
    }
  }

  // ── ORIENTACIÓN (SENSORES) ────────────────────────────────────────────────

  Future<CaptureOrientation?> _captureOrientation() async {
    try {
      if (Platform.isWindows || Platform.isMacOS || Platform.isLinux) {
        return null;
      }

      // Tomar muestra puntual del magnetómetro y acelerómetro
      MagnetometerEvent? mag;
      AccelerometerEvent? acc;

      try {
        mag = await magnetometerEventStream(
          samplingPeriod: SensorInterval.normalInterval,
        ).first.timeout(const Duration(seconds: 3));
      } catch (_) {}

      try {
        acc = await accelerometerEventStream(
          samplingPeriod: SensorInterval.normalInterval,
        ).first.timeout(const Duration(seconds: 3));
      } catch (_) {}

      if (mag == null) return null;

      // Azimut desde magnetómetro
      final azimuth = _computeAzimuth(mag.x, mag.y);

      // Pitch y roll desde acelerómetro
      double pitch = 0.0;
      double roll = 0.0;
      if (acc != null) {
        pitch = _computePitch(acc.x, acc.y, acc.z);
        roll = _computeRoll(acc.x, acc.y, acc.z);
      }

      return CaptureOrientation.fromAzimuth(azimuth, pitch, roll);
    } catch (_) {
      return null;
    }
  }

  double _computeAzimuth(double mx, double my) {
    var azimuth = math.atan2(my, mx) * (180 / math.pi);
    if (azimuth < 0) azimuth += 360;
    return azimuth;
  }

  double _computePitch(double ax, double ay, double az) {
    return math.atan2(ax, math.sqrt(ay * ay + az * az)) * (180 / math.pi);
  }

  double _computeRoll(double ax, double ay, double az) {
    return math.atan2(ay, az) * (180 / math.pi);
  }

  // ── EXIF ─────────────────────────────────────────────────────────────────

  /// Extrae campos EXIF básicos desde bytes JPEG sin dependencias externas.
  ///
  /// Parsea el segmento APP1/EXIF del JPEG para obtener:
  ///   - DateTime original de captura
  ///   - Dimensiones (si están en EXIF)
  ///
  /// Si el archivo no es JPEG o no tiene EXIF, retorna mapa vacío.
  Future<Map<String, String>> _parseExifBasic(String imagePath) async {
    try {
      final file = File(imagePath);
      if (!await file.exists()) return const {};
      // Leer solo los primeros 64KB para el header EXIF
      final bytes = await file.openRead(0, 65536).toList();
      if (bytes.isEmpty) return const {};
      final data = bytes.expand((b) => b).toList();
      return _extractExifTags(Uint8List.fromList(data));
    } catch (_) {
      return const {};
    }
  }

  Map<String, String> _extractExifTags(Uint8List data) {
    final tags = <String, String>{};
    // Verificar marker JPEG (FFD8)
    if (data.length < 4 || data[0] != 0xFF || data[1] != 0xD8) {
      return tags;
    }

    int offset = 2;
    while (offset < data.length - 4) {
      if (data[offset] != 0xFF) break;
      final marker = data[offset + 1];
      final segLen = (data[offset + 2] << 8) | data[offset + 3];

      // APP1 (0xE1) puede contener EXIF
      if (marker == 0xE1 && offset + segLen < data.length) {
        final seg = data.sublist(offset + 4, offset + 2 + segLen);
        // Verificar header "Exif\x00\x00"
        if (seg.length > 6 &&
            seg[0] == 0x45 && seg[1] == 0x78 &&
            seg[2] == 0x69 && seg[3] == 0x66) {
          _parseIfd(seg, 6, tags);
        }
      }

      offset += 2 + segLen;
      if (marker == 0xDA) break; // SOS: datos de imagen, parar
    }
    return tags;
  }

  void _parseIfd(Uint8List data, int exifStart, Map<String, String> tags) {
    try {
      // Determinar byte order: 'II' (little-endian) o 'MM' (big-endian)
      if (exifStart + 8 > data.length) return;
      final isLittle = data[exifStart] == 0x49; // 'I'

      int readUint16(int offset) {
        if (offset + 1 >= data.length) return 0;
        return isLittle
            ? data[offset] | (data[offset + 1] << 8)
            : (data[offset] << 8) | data[offset + 1];
      }

      int readUint32(int offset) {
        if (offset + 3 >= data.length) return 0;
        return isLittle
            ? data[offset] |
                (data[offset + 1] << 8) |
                (data[offset + 2] << 16) |
                (data[offset + 3] << 24)
            : (data[offset] << 24) |
                (data[offset + 1] << 16) |
                (data[offset + 2] << 8) |
                data[offset + 3];
      }

      final ifdOffset = exifStart + readUint32(exifStart + 4);
      if (ifdOffset + 2 > data.length) return;
      final entryCount = readUint16(ifdOffset);

      for (var i = 0; i < entryCount && i < 64; i++) {
        final entryOffset = ifdOffset + 2 + i * 12;
        if (entryOffset + 12 > data.length) break;

        final tag = readUint16(entryOffset);
        final type = readUint16(entryOffset + 2);
        final count = readUint32(entryOffset + 4);

        // ASCII string (type == 2)
        if (type == 2 && count <= 32) {
          final valOffset = count <= 4
              ? entryOffset + 8
              : exifStart + readUint32(entryOffset + 8);
          if (valOffset + count <= data.length) {
            final str = String.fromCharCodes(
              data.sublist(valOffset, valOffset + count - 1),
            ).trim();

            // Tags de interés (ver EXIF 2.3 spec)
            final name = switch (tag) {
              0x0132 => 'DateTime',
              0x9003 => 'DateTimeOriginal',
              0x9004 => 'DateTimeDigitized',
              0x010F => 'Make',
              0x0110 => 'Model',
              0xA434 => 'LensModel',
              _ => null,
            };
            if (name != null && str.isNotEmpty) tags[name] = str;
          }
        }
      }
    } catch (_) {
      // Ignorar errores de parsing — EXIF es best-effort
    }
  }

  DateTime _extractCaptureTime(Map<String, String> exif) {
    final raw = exif['DateTimeOriginal'] ?? exif['DateTime'];
    if (raw == null) return DateTime.now();
    // Formato EXIF: "2024:12:31 14:30:00"
    try {
      final parts = raw.split(' ');
      if (parts.length != 2) return DateTime.now();
      final dateParts = parts[0].split(':');
      final timeParts = parts[1].split(':');
      if (dateParts.length < 3 || timeParts.length < 3) return DateTime.now();
      return DateTime(
        int.parse(dateParts[0]),
        int.parse(dateParts[1]),
        int.parse(dateParts[2]),
        int.parse(timeParts[0]),
        int.parse(timeParts[1]),
        int.parse(timeParts[2]),
      );
    } catch (_) {
      return DateTime.now();
    }
  }

  // ── DEVICE INFO ───────────────────────────────────────────────────────────

  String? _deviceModel() {
    try {
      if (Platform.isAndroid) return 'Android Device';
      if (Platform.isIOS) return 'iOS Device';
      return null;
    } catch (_) {
      return null;
    }
  }

  String? _deviceManufacturer() {
    try {
      if (Platform.isAndroid) return 'Android';
      if (Platform.isIOS) return 'Apple';
      return null;
    } catch (_) {
      return null;
    }
  }
}
