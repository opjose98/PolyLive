import 'dart:io';
import 'package:flutter/material.dart';
import 'package:levon/features/photos/domain/photo_entity.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/photos/ui/widgets/photo_overlay_stack.dart';

/// Abre un visor de foto a pantalla completa sobre cualquier ruta de pantalla.
///
/// [onInfo]: callback opcional para mostrar un botón de propiedades BIM.
/// Cuando se provee, se cierra el diálogo antes de invocar el callback.
void showPhotoViewerDialog(
  BuildContext context,
  PhotoEntity photo, {
  VoidCallback? onInfo,
}) {
  final path = photo.previewImagePath ?? photo.originalImagePath;

  showDialog<void>(
    context: context,
    barrierColor: Colors.black87,
    builder: (dialogCtx) => _PhotoViewerDialogContent(
      photo: photo,
      imagePath: path,
      onInfo: onInfo != null
          ? () {
              Navigator.pop(dialogCtx);
              onInfo();
            }
          : null,
    ),
  );
}

class _PhotoViewerDialogContent extends StatelessWidget {
  final PhotoEntity photo;
  final String imagePath;
  final VoidCallback? onInfo;

  const _PhotoViewerDialogContent({
    required this.photo,
    required this.imagePath,
    this.onInfo,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: EdgeInsets.zero,
      child: Stack(
        children: [
          // Fullscreen image
          Center(
            child: InteractiveViewer(
              minScale: 0.5,
              maxScale: 4.0,
              child: File(imagePath).existsSync()
                  ? Image.file(File(imagePath), fit: BoxFit.contain)
                  : const Center(
                      child: Icon(Icons.image_not_supported_outlined,
                          size: 80, color: Colors.white54),
                    ),
            ),
          ),

          // Overlays rendered non-destructively on top of the image
          Positioned.fill(
            child: IgnorePointer(
              child: PhotoOverlayStack(photo: photo),
            ),
          ),

          // Top bar: close + BIM code
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.close, color: Colors.white),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        photo.bimCode,
                        style: const TextStyle(
                          fontSize: 10,
                          fontFamily: 'monospace',
                          letterSpacing: 1.2,
                          color: Colors.white,
                        ),
                      ),
                    ),
                    if (onInfo != null) ...[
                      const SizedBox(width: 4),
                      IconButton(
                        icon: const Icon(Icons.info_outline,
                            color: Colors.white),
                        tooltip: 'Propiedades BIM',
                        onPressed: onInfo,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),

          // Bottom: name + description
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                    colors: [Colors.black54, Colors.transparent],
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      photo.name,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                      ),
                    ),
                    if (photo.description.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        photo.description,
                        style: TextStyle(
                          color: Colors.white.withValues(alpha: 0.8),
                          fontSize: 12,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Muestra un thumbnail cuadrado de la foto.
///
/// Muestra la imagen de previsualización si existe, o un icono placeholder.
/// Al pulsar abre [showPhotoViewerDialog].
class PhotoThumbnailButton extends StatelessWidget {
  final PhotoEntity photo;
  final double size;

  const PhotoThumbnailButton({
    super.key,
    required this.photo,
    this.size = 80,
  });

  @override
  Widget build(BuildContext context) {
    final path =
        photo.thumbnailPath ?? photo.previewImagePath ?? photo.originalImagePath;

    return GestureDetector(
      onTap: () => showPhotoViewerDialog(context, photo),
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: LevonColors.surface,
          borderRadius: BorderRadius.circular(LevonRadius.sm),
          border: Border.all(color: LevonColors.divider),
        ),
        clipBehavior: Clip.antiAlias,
        child: Image.file(
          File(path),
          fit: BoxFit.cover,
          cacheWidth: (size * 2).round(),
          errorBuilder: (_, __, ___) => const Center(
            child: Icon(Icons.image_outlined,
                size: 32, color: LevonColors.textDisabled),
          ),
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
      ),
    );
  }
}
