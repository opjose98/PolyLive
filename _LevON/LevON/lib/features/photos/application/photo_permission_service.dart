import 'dart:io' show Platform;

import 'package:permission_handler/permission_handler.dart';

/// Resultado de una solicitud de permiso.
enum PermissionResult { granted, denied, permanentlyDenied, restricted }

/// Servicio de permisos Android para el SPDS.
///
/// REGLA: solicitar solo cuando sea necesario (contextual y lazy).
/// NO pedir todos los permisos al iniciar la app.
///
/// Compatibilidad: Android 13 (API 33), Android 14 (API 34), Android 15 (API 35).
class PhotoPermissionService {
  const PhotoPermissionService();

  // ── CÁMARA ────────────────────────────────────────────────────────────────

  /// Solicita permiso de cámara si no está concedido.
  /// Llamar justo antes de abrir la cámara.
  Future<PermissionResult> requestCameraPermission() async {
    if (!_isAndroid) return PermissionResult.granted;
    return _request(Permission.camera);
  }

  /// Verifica si el permiso de cámara está concedido (sin solicitar).
  Future<bool> isCameraGranted() async {
    if (!_isAndroid) return true;
    return Permission.camera.isGranted;
  }

  // ── MEDIA / GALERÍA ───────────────────────────────────────────────────────

  /// Solicita acceso a imágenes del dispositivo.
  ///
  /// - Android 13+ (API 33+): usa READ_MEDIA_IMAGES
  /// - Android 12 y anterior: usa READ_EXTERNAL_STORAGE
  Future<PermissionResult> requestMediaPermission() async {
    if (!_isAndroid) return PermissionResult.granted;

    // Android 13+ / API 33+: permiso granular de imágenes
    if (await _isAtLeastAndroid13()) {
      final result = await _request(Permission.photos);
      // En Android 14+ también puede necesitar permiso de acceso parcial
      if (result == PermissionResult.denied && await _isAtLeastAndroid14()) {
        return _request(Permission.mediaLibrary);
      }
      return result;
    }

    // Android ≤ 12: acceso general a almacenamiento externo
    return _request(Permission.storage);
  }

  /// Verifica si el acceso a galería está concedido.
  Future<bool> isMediaGranted() async {
    if (!_isAndroid) return true;
    if (await _isAtLeastAndroid13()) {
      return await Permission.photos.isGranted ||
          await Permission.mediaLibrary.isGranted;
    }
    return Permission.storage.isGranted;
  }

  // ── LOCALIZACIÓN ──────────────────────────────────────────────────────────

  /// Solicita permiso de ubicación precisa (GPS).
  /// Llamar justo antes de capturar metadatos de ubicación.
  Future<PermissionResult> requestLocationPermission() async {
    if (!_isAndroid) return PermissionResult.granted;

    // Primero solicitar ubicación aproximada (requerida antes de precisa en Android 12+)
    final coarse = await _request(Permission.locationWhenInUse);
    if (coarse != PermissionResult.granted) return coarse;

    return _request(Permission.location);
  }

  /// Verifica si el permiso de ubicación está concedido.
  Future<bool> isLocationGranted() async {
    if (!_isAndroid) return true;
    return await Permission.location.isGranted ||
        await Permission.locationWhenInUse.isGranted;
  }

  // ── FLUJOS COMPUESTOS ─────────────────────────────────────────────────────

  /// Solicita todos los permisos necesarios para captura fotográfica completa.
  ///
  /// - Cámara: requerida
  /// - Medios: requerida para guardar/acceder a galería
  /// - Ubicación: opcional (si el usuario deniega, se omite el GPS)
  ///
  /// Retorna mapa con el resultado de cada categoría.
  Future<Map<PhotoPermissionCategory, PermissionResult>> requestForCapture() async {
    final results = <PhotoPermissionCategory, PermissionResult>{};

    results[PhotoPermissionCategory.camera] = await requestCameraPermission();
    results[PhotoPermissionCategory.media] = await requestMediaPermission();
    results[PhotoPermissionCategory.location] = await requestLocationPermission();

    return results;
  }

  /// Solicita permisos para selección desde galería (sin cámara).
  Future<Map<PhotoPermissionCategory, PermissionResult>> requestForGalleryPick() async {
    return {
      PhotoPermissionCategory.media: await requestMediaPermission(),
      PhotoPermissionCategory.location: await requestLocationPermission(),
    };
  }

  /// Verifica si la captura completa es posible (cámara + media concedidos).
  Future<bool> canCapture() async {
    return await isCameraGranted() && await isMediaGranted();
  }

  // ── INTERNAL ──────────────────────────────────────────────────────────────

  bool get _isAndroid => Platform.isAndroid;

  Future<bool> _isAtLeastAndroid13() async {
    // permission_handler expone el estado del permiso según la versión real
    // Si READ_MEDIA_IMAGES no existe en la plataforma, devuelve granted/restricted
    // lo que indica que estamos en Android < 13
    final status = await Permission.photos.status;
    return status != PermissionStatus.restricted;
  }

  Future<bool> _isAtLeastAndroid14() async {
    final status = await Permission.mediaLibrary.status;
    return status != PermissionStatus.restricted;
  }

  Future<PermissionResult> _request(Permission permission) async {
    final status = await permission.request();
    return switch (status) {
      PermissionStatus.granted => PermissionResult.granted,
      PermissionStatus.limited => PermissionResult.granted,
      PermissionStatus.denied => PermissionResult.denied,
      PermissionStatus.permanentlyDenied => PermissionResult.permanentlyDenied,
      PermissionStatus.restricted => PermissionResult.restricted,
      PermissionStatus.provisional => PermissionResult.granted,
    };
  }
}

enum PhotoPermissionCategory { camera, media, location }
