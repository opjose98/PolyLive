import 'dart:io';

import 'package:flutter/material.dart';

import 'package:levon/features/photos/domain/photo_entity.dart';
import 'package:levon/ui/theme/levon_tokens.dart';

/// Tarjeta de fotografía BIM en la cuadrícula de colección.
///
/// Muestra el thumbnail (150px) con código BIM, nombre y fecha.
/// Long-press abre el panel de propiedades completo.
class PhotoCard extends StatelessWidget {
  final PhotoEntity photo;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final VoidCallback? onDelete;

  const PhotoCard({
    super.key,
    required this.photo,
    this.onTap,
    this.onLongPress,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onTap,
        onLongPress: onLongPress,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ── Thumbnail ────────────────────────────────────────────────────
            Expanded(child: _PhotoThumbnail(photo: photo, onDelete: onDelete)),

            // ── Info ─────────────────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 6, 8, 8),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    photo.bimCode,
                    style: const TextStyle(
                      fontSize: 9,
                      fontFamily: 'monospace',
                      letterSpacing: 1.1,
                      color: LevonColors.navy,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    photo.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: LevonColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _formatDate(photo.captureMetadata.capturedAt),
                    style: const TextStyle(
                      fontSize: 10,
                      color: LevonColors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime? dt) {
    if (dt == null) return '';
    return '${dt.day.toString().padLeft(2, '0')}/'
        '${dt.month.toString().padLeft(2, '0')}/'
        '${dt.year}';
  }
}

// ─── THUMBNAIL ────────────────────────────────────────────────────────────────

class _PhotoThumbnail extends StatelessWidget {
  final PhotoEntity photo;
  final VoidCallback? onDelete;

  const _PhotoThumbnail({required this.photo, this.onDelete});

  @override
  Widget build(BuildContext context) {
    final thumbPath = photo.thumbnailPath ??
        photo.previewImagePath ??
        photo.originalImagePath;

    return Stack(
      fit: StackFit.expand,
      children: [
        // Image — decoded at 300px max to cap memory; errorBuilder handles
        // missing files without a synchronous existsSync() on the UI thread.
        Image.file(
          File(thumbPath),
          fit: BoxFit.cover,
          cacheWidth: 300,
          errorBuilder: (_, __, ___) => const _PhotoPlaceholder(),
          frameBuilder: (ctx, child, frame, wasSynchronouslyLoaded) {
            if (wasSynchronouslyLoaded || frame != null) return child;
            return AnimatedOpacity(
              opacity: frame == null ? 0.0 : 1.0,
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeIn,
              child: child,
            );
          },
        ),

        // GPS badge
        if (photo.captureMetadata.latitude != null)
          Positioned(
            bottom: 6,
            left: 6,
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.black54,
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.location_on, size: 9, color: Colors.white),
                  SizedBox(width: 2),
                  Text('GPS',
                      style: TextStyle(fontSize: 8, color: Colors.white)),
                ],
              ),
            ),
          ),

        // Delete button — only rendered when callback is provided
        Positioned(
          top: 4,
          right: 4,
          child: GestureDetector(
            onTap: onDelete,
            child: onDelete == null
                ? const SizedBox.shrink()
                : Container(
                    width: 24,
                    height: 24,
                    decoration: const BoxDecoration(
                      color: Colors.black54,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.close,
                        size: 14, color: Colors.white),
                  ),
          ),
        ),
      ],
    );
  }
}

class _PhotoPlaceholder extends StatelessWidget {
  const _PhotoPlaceholder();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: LevonColors.surface2,
      child: const Center(
        child: Icon(Icons.image_outlined, size: 32, color: LevonColors.textDisabled),
      ),
    );
  }
}
