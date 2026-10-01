// =============================================================================
// PhotoViewer.tsx — Visor a pantalla completa con overlays no destructivos
// Portado de LevON: features/photos/ui/widgets/photo_viewer_dialog.dart,
//                   photo_overlay_stack.dart, photo_properties_panel.dart
// =============================================================================
//
// GAP CERRADO: la galería solo mostraba una rejilla de miniaturas. No había
// forma de ver una foto a tamaño completo, ni de saber cuándo se tomó, dónde,
// quién, ni a qué objeto está vinculada — toda esa metadata se escribía en
// SQLite y nunca se mostraba.
//
// OVERLAYS NO DESTRUCTIVOS: los datos se dibujan ENCIMA de la imagen en la
// pantalla, no se queman en el JPEG. El archivo original se mantiene intacto,
// que es lo que hace falta si la foto se va a usar como prueba documental o se
// va a entregar a un tercero. Es la misma decisión que tomó LevON, y la razón
// por la que el overlay se puede apagar.
// =============================================================================

import React, { useState } from 'react';
import { View, Text, Image, Modal, ScrollView, TouchableOpacity } from 'react-native';
import type { AuditPhoto } from '../../domain/objects/audit-photo';
import { ActionButton, Chip } from '../primitives';
import { spacing, radius, sizes } from '../design/tokens';
import { type } from '../design/typography';
import { themedStyles } from '../design/theme';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface PhotoViewerProps {
  visible: boolean;
  /** Ruta local del archivo JPEG. */
  uri: string | null;
  /** Registro de auditoría, si se pudo correlacionar con el archivo. */
  photo: AuditPhoto | null;
  /** Descripción legible del objeto BIM vinculado. */
  linkedObjectLabel?: string;
  onClose: () => void;
  onLink?: () => void;
  onDelete?: () => void;
  /** Oculta o vuelve a mostrar el marcador de esta foto en la planta. */
  onToggleMarkerVisible?: (visible: boolean) => void;
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function PhotoViewer({
  visible,
  uri,
  photo,
  linkedObjectLabel,
  onClose,
  onLink,
  onDelete,
  onToggleMarkerVisible,
}: PhotoViewerProps) {
  const styles = useStyles();
  const [showOverlay, setShowOverlay] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

  const metadata = photo?.metadata;
  const marker = metadata?.marker;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        {/* --- Imagen --- */}
        <View style={styles.imageWrap}>
          {uri ? (
            <Image source={{ uri }} style={styles.image} resizeMode="contain" />
          ) : (
            <Text style={styles.missing}>No se encontró el archivo de esta foto.</Text>
          )}

          {/* Overlay: se dibuja sobre la imagen, NO se quema en el archivo. */}
          {showOverlay && metadata ? (
            <View style={styles.overlay} pointerEvents="none">
              {metadata.bimCode ? (
                <View style={styles.overlayBadge}>
                  <Text style={styles.overlayBadgeText}>{metadata.bimCode}</Text>
                </View>
              ) : null}

              <View style={styles.overlayLines}>
                <Text style={styles.overlayText}>
                  {new Date(metadata.timestamp).toLocaleString()}
                </Text>
                {metadata.geo ? (
                  <Text style={styles.overlayText}>
                    {metadata.geo.latitude.toFixed(5)}, {metadata.geo.longitude.toFixed(5)} · ±
                    {metadata.geo.accuracyMeters.toFixed(0)} m
                  </Text>
                ) : null}
                {marker ? (
                  <Text style={styles.overlayText}>
                    Planta: ({marker.position.x.toFixed(2)}, {marker.position.y.toFixed(2)}) m
                  </Text>
                ) : null}
                {metadata.operator ? (
                  <Text style={styles.overlayText}>{metadata.operator}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar visor"
          >
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* --- Controles --- */}
        <View style={styles.controls}>
          <Chip label="Datos sobre la foto" active={showOverlay} onPress={() => setShowOverlay(!showOverlay)} />
          <Chip label="Ficha" active={showDetails} onPress={() => setShowDetails(!showDetails)} />
        </View>

        {showDetails ? (
          <ScrollView style={styles.details} contentContainerStyle={styles.detailsContent}>
            <DetailRow label="Archivo" value={metadata?.filename ?? '—'} />
            <DetailRow label="Código BIM" value={metadata?.bimCode ?? 'sin asignar'} />
            <DetailRow
              label="Capturada"
              value={metadata ? new Date(metadata.timestamp).toLocaleString() : '—'}
            />
            <DetailRow label="Operador" value={metadata?.operator ?? '—'} />
            <DetailRow label="Objeto vinculado" value={linkedObjectLabel ?? 'ninguno'} />
            <DetailRow
              label="Marcador en planta"
              value={
                marker
                  ? `(${marker.position.x.toFixed(2)}, ${marker.position.y.toFixed(2)}) m${
                      marker.visible === false ? ' · oculto' : ''
                    }`
                  : 'sin colocar'
              }
            />
            <DetailRow
              label="GPS"
              value={
                metadata?.geo
                  ? `${metadata.geo.latitude.toFixed(6)}, ${metadata.geo.longitude.toFixed(6)} (±${metadata.geo.accuracyMeters.toFixed(1)} m)`
                  : 'sin señal en la captura'
              }
            />
            {metadata?.notes ? <DetailRow label="Notas" value={metadata.notes} /> : null}

            {!photo ? (
              <Text style={styles.warning}>
                Esta foto no tiene registro de auditoría asociado: puede haberse capturado antes de
                que la app guardara metadata, o su registro se eliminó.
              </Text>
            ) : null}
          </ScrollView>
        ) : null}

        {/* --- Acciones --- */}
        <View style={styles.actions}>
          {onLink ? <ActionButton label="Vincular" variant="secondary" onPress={onLink} /> : null}
          {marker && onToggleMarkerVisible ? (
            <ActionButton
              label={marker.visible === false ? 'Mostrar en planta' : 'Ocultar en planta'}
              variant="secondary"
              onPress={() => onToggleMarkerVisible(marker.visible === false)}
            />
          ) : null}
          {onDelete ? <ActionButton label="Eliminar" variant="danger" onPress={onDelete} /> : null}
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = themedStyles((colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.text,
  },
  imageWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  image: {
    flex: 1,
    width: '100%',
  },
  missing: {
    ...type.body,
    color: colors.textOnAccent,
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    gap: spacing.xs,
  },
  overlayBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.xs,
    backgroundColor: colors.textOnAccent,
  },
  overlayBadgeText: {
    ...type.caption,
    color: colors.accentText,
    fontFamily: 'Roboto_700Bold',
  },
  overlayLines: {
    backgroundColor: colors.scrim,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  overlayText: {
    ...type.caption,
    color: colors.textOnAccent,
  },
  closeButton: {
    position: 'absolute',
    top: spacing.xl,
    right: spacing.md,
    width: sizes.touchMin,
    height: sizes.touchMin,
    borderRadius: radius.round,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: colors.textOnAccent,
  },
  controls: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surface,
  },
  details: {
    maxHeight: 260,
    backgroundColor: colors.surface,
  },
  detailsContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  detailRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    ...type.label,
    color: colors.textSecondary,
  },
  detailValue: {
    ...type.body,
    color: colors.text,
  },
  warning: {
    ...type.caption,
    color: colors.warning,
    marginTop: spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surface,
  },
}));

export default PhotoViewer;
