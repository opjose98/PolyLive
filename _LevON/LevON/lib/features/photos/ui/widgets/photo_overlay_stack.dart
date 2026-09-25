import 'package:flutter/material.dart';
import 'package:levon/features/photos/domain/photo_entity.dart';

/// Renderiza los overlays visibles de una [PhotoEntity] como un [Stack].
///
/// Usa [overlayConfiguration] si no está vacío; si lo está, usa las capas
/// del [templateData] asignado. Posicionamiento relativo {x: 0–1, y: 0–1}.
///
/// Los overlays son estrictamente no-destructivos: solo se renderizan encima
/// de la imagen, nunca se graban en el archivo original.
class PhotoOverlayStack extends StatelessWidget {
  final PhotoEntity photo;

  const PhotoOverlayStack({super.key, required this.photo});

  @override
  Widget build(BuildContext context) {
    final layers = photo.overlayConfiguration.isNotEmpty
        ? photo.overlayConfiguration
        : (photo.templateData?.overlays ?? const <OverlayLayer>[]);

    final visible = layers.where((l) => l.visible).toList();
    if (visible.isEmpty) return const SizedBox.shrink();

    return LayoutBuilder(
      builder: (ctx, constraints) {
        final w = constraints.maxWidth;
        final h = constraints.maxHeight;
        return Stack(
          children: visible.map((layer) {
            final x = (layer.position['x'] ?? 0.05) * w;
            final y = (layer.position['y'] ?? 0.05) * h;
            return Positioned(
              left: x.clamp(0.0, w),
              top: y.clamp(0.0, h),
              child: _OverlayLayerWidget(layer: layer, photo: photo),
            );
          }).toList(),
        );
      },
    );
  }
}

class _OverlayLayerWidget extends StatelessWidget {
  final OverlayLayer layer;
  final PhotoEntity photo;

  const _OverlayLayerWidget({required this.layer, required this.photo});

  @override
  Widget build(BuildContext context) {
    final text = _buildText();
    if (text == null || text.isEmpty) return const SizedBox.shrink();

    final bgColor =
        _parseColor(layer.style['backgroundColor'] as String?) ??
            Colors.black54;
    final textColor =
        _parseColor(layer.style['color'] as String?) ?? Colors.white;
    final fontSize =
        (layer.style['fontSize'] as num?)?.toDouble() ?? 11.0;

    return Transform.scale(
      scale: layer.scale,
      alignment: Alignment.topLeft,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(4),
        ),
        child: Text(
          text,
          style: TextStyle(
            color: textColor,
            fontSize: fontSize,
            fontFamily: 'monospace',
            letterSpacing: 0.5,
          ),
        ),
      ),
    );
  }

  String? _buildText() {
    switch (layer.type) {
      case OverlayType.date:
        final fmt = layer.content['format'] as String? ?? 'dd/MM/yyyy HH:mm';
        return _formatDate(photo.captureMetadata.capturedAt, fmt);

      case OverlayType.coordinate:
        final lat = photo.captureMetadata.latitude;
        final lon = photo.captureMetadata.longitude;
        if (lat == null || lon == null) return null;
        return '${lat.toStringAsFixed(5)}, ${lon.toStringAsFixed(5)}';

      case OverlayType.compass:
        final dir = photo.captureMetadata.compassDirection ??
            photo.orientationData?.compassDirection;
        final az = photo.captureMetadata.azimuth ??
            photo.orientationData?.azimuth;
        if (dir == null && az == null) return null;
        if (dir != null && az != null) {
          return '$dir ${az.toStringAsFixed(0)}°';
        }
        return dir ?? '${az!.toStringAsFixed(0)}°';

      case OverlayType.text:
        return layer.content['text'] as String?;

      case OverlayType.metadata:
        final field = layer.content['field'] as String?;
        if (field == null) return null;
        return _resolveMetadataField(field);

      case OverlayType.image:
        return null; // Image overlays handled separately; not text-based.
    }
  }

  String _formatDate(DateTime dt, String format) {
    return format
        .replaceAll('dd', dt.day.toString().padLeft(2, '0'))
        .replaceAll('MM', dt.month.toString().padLeft(2, '0'))
        .replaceAll('yyyy', dt.year.toString())
        .replaceAll('HH', dt.hour.toString().padLeft(2, '0'))
        .replaceAll('mm', dt.minute.toString().padLeft(2, '0'));
  }

  String? _resolveMetadataField(String field) {
    final meta = photo.captureMetadata;
    return switch (field) {
      'device' => meta.deviceModel,
      'bimCode' => photo.bimCode,
      _ => meta.exifData[field],
    };
  }

  Color? _parseColor(String? hex) {
    if (hex == null) return null;
    try {
      final h = hex.startsWith('#') ? hex.substring(1) : hex;
      return Color(int.parse(h.length == 6 ? 'FF$h' : h, radix: 16));
    } catch (_) {
      return null;
    }
  }
}
