import 'dart:io';

import 'package:flutter/material.dart';

import 'package:levon/features/photos/domain/photo_entity.dart';
import 'package:levon/ui/theme/levon_tokens.dart';
import 'package:levon/features/photos/ui/widgets/photo_overlay_stack.dart';

/// Panel de propiedades BIM de una [PhotoEntity].
///
/// Mostrado como BottomSheet al hacer long-press en [PhotoCard].
/// Permite editar nombre y notas, y ver metadata de captura (GPS, orientación, EXIF).
class PhotoPropertiesPanel extends StatefulWidget {
  final PhotoEntity photo;
  final String collectionId;
  final VoidCallback onDelete;
  final ValueChanged<PhotoEntity> onUpdate;

  const PhotoPropertiesPanel({
    super.key,
    required this.photo,
    required this.collectionId,
    required this.onDelete,
    required this.onUpdate,
  });

  @override
  State<PhotoPropertiesPanel> createState() => _PhotoPropertiesPanelState();
}

class _PhotoPropertiesPanelState extends State<PhotoPropertiesPanel> {
  late final TextEditingController _nameCtrl;
  late final TextEditingController _notesCtrl;

  @override
  void initState() {
    super.initState();
    _nameCtrl = TextEditingController(text: widget.photo.name);
    _notesCtrl = TextEditingController(text: widget.photo.notes);
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  void _save() {
    final name = _nameCtrl.text.trim();
    final updated = widget.photo.copyWith(
      name: name.isEmpty ? null : name,
      notes: _notesCtrl.text.trim(),
    );
    widget.onUpdate(updated);
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final photo = widget.photo;
    final meta = photo.captureMetadata;
    final relations = photo.spatialRelations;

    return DraggableScrollableSheet(
      initialChildSize: 0.65,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (ctx, scrollCtrl) => ListView(
        controller: scrollCtrl,
        padding: EdgeInsets.only(
          left: 20,
          right: 20,
          top: 12,
          bottom: MediaQuery.of(context).viewInsets.bottom + 32,
        ),
        children: [
          // ── Handle ────────────────────────────────────────────────────────
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: LevonColors.divider,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),
          const SizedBox(height: 16),

          // ── Header ────────────────────────────────────────────────────────
          Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: LevonColors.navy.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(LevonRadius.sm),
                ),
                child: const Icon(Icons.camera_alt_outlined,
                    color: LevonColors.navy, size: 20),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      photo.bimCode,
                      style: const TextStyle(
                        fontSize: 10,
                        fontFamily: 'monospace',
                        letterSpacing: 1.2,
                        color: LevonColors.navy,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      photo.name,
                      style: const TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: LevonColors.textPrimary,
                      ),
                    ),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline,
                    color: LevonColors.errorRed),
                onPressed: widget.onDelete,
                tooltip: 'Eliminar foto',
              ),
            ],
          ),
          const SizedBox(height: 16),

          // ── Preview ───────────────────────────────────────────────────────
          _PreviewImage(photo: photo),
          const SizedBox(height: 20),

          // ── Nombre ────────────────────────────────────────────────────────
          TextField(
            controller: _nameCtrl,
            decoration: const InputDecoration(
              labelText: 'Nombre',
              prefixIcon: Icon(Icons.label_outline, size: 18),
            ),
          ),
          const SizedBox(height: 12),

          // ── Notas ─────────────────────────────────────────────────────────
          TextField(
            controller: _notesCtrl,
            maxLines: 3,
            maxLength: 500,
            decoration: const InputDecoration(
              labelText: 'Notas de campo',
              hintText: 'Observaciones, patologías, referencias…',
              alignLabelWithHint: true,
              prefixIcon: Padding(
                padding: EdgeInsets.only(bottom: 40),
                child: Icon(Icons.notes_outlined, size: 18),
              ),
            ),
          ),
          const SizedBox(height: 8),

          // ── GPS ───────────────────────────────────────────────────────────
          if (meta.latitude != null) ...[
            const _SectionTitle('Ubicación GPS'),
            _MetaRow('Latitud', meta.latitude!.toStringAsFixed(6)),
            _MetaRow('Longitud', meta.longitude!.toStringAsFixed(6)),
            if (meta.altitude != null)
              _MetaRow('Altitud', '${meta.altitude!.toStringAsFixed(1)} m'),
            if (meta.accuracy != null)
              _MetaRow('Precisión', '±${meta.accuracy!.toStringAsFixed(1)} m'),
            const SizedBox(height: 8),
          ],

          // ── Orientación ───────────────────────────────────────────────────
          if (photo.orientationData != null) ...[
            const _SectionTitle('Orientación'),
            _MetaRow('Dirección', photo.orientationData!.compassDirection),
            _MetaRow(
                'Azimut', '${photo.orientationData!.azimuth.toStringAsFixed(1)}°'),
            _MetaRow(
                'Inclinación', '${photo.orientationData!.pitch.toStringAsFixed(1)}°'),
            const SizedBox(height: 8),
          ],

          // ── EXIF ──────────────────────────────────────────────────────────
          if (meta.exifData.isNotEmpty) ...[
            const _SectionTitle('EXIF'),
            for (final entry in meta.exifData.entries.take(6))
              _MetaRow(entry.key, entry.value),
            const SizedBox(height: 8),
          ],

          // ── BIM Relations ─────────────────────────────────────────────────
          if (!relations.isEmpty) ...[
            const _SectionTitle('Relaciones BIM'),
            if (relations.spaceIds.isNotEmpty)
              _MetaRow('Espacios', relations.spaceIds.join(', ')),
            if (relations.wallIds.isNotEmpty)
              _MetaRow('Muros', relations.wallIds.join(', ')),
            if (relations.tags.isNotEmpty)
              _MetaRow('Tags', relations.tags.join(', ')),
            const SizedBox(height: 8),
          ],

          // ── Tags ──────────────────────────────────────────────────────────
          if (photo.tags.isNotEmpty) ...[
            const _SectionTitle('Etiquetas'),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: photo.tags
                  .map((t) => Chip(
                        label: Text(t,
                            style: const TextStyle(fontSize: 11)),
                        padding: EdgeInsets.zero,
                        materialTapTargetSize:
                            MaterialTapTargetSize.shrinkWrap,
                      ))
                  .toList(),
            ),
            const SizedBox(height: 8),
          ],

          // ── Save ──────────────────────────────────────────────────────────
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: _save,
              child: const Text('Guardar cambios'),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

class _PreviewImage extends StatelessWidget {
  final PhotoEntity photo;
  const _PreviewImage({required this.photo});

  @override
  Widget build(BuildContext context) {
    final path = photo.previewImagePath ?? photo.originalImagePath;
    return ClipRRect(
      borderRadius: BorderRadius.circular(LevonRadius.md),
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.file(
              File(path),
              fit: BoxFit.cover,
              cacheWidth: 800,
              errorBuilder: (_, __, ___) => Container(
                color: LevonColors.surface2,
                child: const Center(
                  child: Icon(Icons.image_outlined,
                      size: 48, color: LevonColors.textDisabled),
                ),
              ),
            ),
            IgnorePointer(child: PhotoOverlayStack(photo: photo)),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          letterSpacing: 1.2,
          color: LevonColors.textSecondary,
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  final String label;
  final String value;
  const _MetaRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: const TextStyle(
                  fontSize: 12, color: LevonColors.textSecondary),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: LevonColors.textPrimary,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
