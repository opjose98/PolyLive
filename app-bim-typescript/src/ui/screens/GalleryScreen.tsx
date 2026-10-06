// =============================================================================
// GalleryScreen.tsx — Photo gallery screen
// Basado en: filesystem-photo-storage.md, camera-photo-capture.md
// =============================================================================
//
// Pantalla de galería que muestra fotos capturadas durante el levantamiento.
// Integra ExpoFileSystem para listar/borrar y CameraCaptureView + ExpoPhotoCapture
// para capturar.
//
// ANTES de esta wiring, el botón de captura solo mostraba un Alert de aviso —
// no existía ningún componente que renderizara una cámara en vivo, así que
// ExpoPhotoCapture (ya implementado y probado por separado) nunca se ejecutaba
// de principio a fin. Ahora cada foto capturada se guarda dos veces con
// propósitos distintos:
// - Como archivo JPEG (ExpoFileSystem) — la fuente para esta grilla.
// - Como AuditPhoto en SQLite (CapturePhotoUseCase, vía AppServices) — el
//   rastro de auditoría que ExportRoomIfcUseCase y el resto de la app BIM
//   pueden consultar (ObjectStore.listAuditPhotos), ligado al Recinto activo.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, SafeAreaView, RefreshControl, Modal } from 'react-native';
import { useLayout } from '../design/layout';
import { themedStyles } from '../design/theme';
import { ExpoFileSystem, type StoredPhoto } from '../../native/filesystem/ExpoFileSystem';
import { ExpoPhotoCapture, type PhotoResult } from '../../native/camera/ExpoPhotoCapture';
import { CameraCaptureView } from '../components/CameraCaptureView';
import { AppServices } from '../../application/AppServices';
import { RoomId, RevitObjectBase, Wall, Door, Window, Column } from '../../domain/objects';
import { AppError, AppErrorCode } from '../../shared/errors/AppError';
import { PhotoViewer } from '../components/PhotoViewer';
import { AuditPhoto } from '../../domain/objects/audit-photo';
import { alertDialog } from '../primitives';
import { saveFieldPhoto } from '../workspace/fieldPhotos';

// ---------------------------------------------------------------------------
// Object label helper — descriptor legible para el selector de vinculación
// ---------------------------------------------------------------------------

function describeObject(obj: RevitObjectBase): string {
  if (obj instanceof Wall) {
    const s = obj.startPoint;
    const e = obj.endPoint;
    return `Muro (${s.x.toFixed(1)},${s.y.toFixed(1)}) → (${e.x.toFixed(1)},${e.y.toFixed(1)})`;
  }
  if (obj instanceof Door) return `Puerta (offset ${Number(obj.offsetAlongWall).toFixed(1)}m)`;
  if (obj instanceof Window) return `Ventana (offset ${Number(obj.offsetAlongWall).toFixed(1)}m)`;
  if (obj instanceof Column) return `Columna (${obj.position.x.toFixed(1)},${obj.position.y.toFixed(1)})`;
  return `${obj.type} (${obj.id})`;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAP = 4;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface GalleryScreenProps {
  services: AppServices;
  roomId: RoomId;
  /** Solo las fotos vinculadas a este objeto BIM (desde sus propiedades). */
  objectId?: string;
  /** Abre el visor en esta foto (al tocar su marcador en la planta). */
  photoId?: string;
  /** Quién toma las fotos (va en su sello de evidencia). */
  operatorName?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GalleryScreen({ services, roomId, objectId, photoId, operatorName }: GalleryScreenProps) {
  const styles = useStyles();
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [fileSystem] = useState(() => new ExpoFileSystem());
  const [camera] = useState(() => new ExpoPhotoCapture());

  // Vinculación de foto → objeto BIM (LinkPhotoToObjectUseCase)
  const [linkTarget, setLinkTarget] = useState<StoredPhoto | null>(null);
  const [linkableObjects, setLinkableObjects] = useState<RevitObjectBase[]>([]);
  const [linking, setLinking] = useState(false);

  // Visor a pantalla completa. `auditPhotos` mantiene los registros de SQLite
  // indexados por nombre de archivo: es la única forma de correlacionar un
  // archivo de la rejilla con su metadata (ver el comentario de handlePhotoCaptured).
  const [auditPhotos, setAuditPhotos] = useState<Map<string, AuditPhoto>>(new Map());
  const [viewing, setViewing] = useState<StoredPhoto | null>(null);
  const openedFocus = useRef(false);

  // -----------------------------------------------------------------------
  // Load photos
  // -----------------------------------------------------------------------

  const loadPhotos = useCallback(async () => {
    try {
      const [list, audits] = await Promise.all([
        fileSystem.listPhotos(),
        services.store.listAuditPhotos(roomId),
      ]);
      // El directorio de fotos es uno solo para toda la app: se muestran las
      // registradas en ESTE espacio (antes salían las de todos los proyectos).
      const own = new Map(audits.map((a) => [a.metadata.filename, a]));
      const shown = list.filter((p) => {
        const a = own.get(p.filename);
        return !!a && (!objectId || (a.linkedObjectId as string | undefined) === objectId);
      });
      setPhotos(shown);
      setAuditPhotos(own);
      if (photoId && !openedFocus.current) {
        const target = audits.find((a) => (a.id as string) === photoId);
        const file = target ? shown.find((p) => p.filename === target.metadata.filename) : undefined;
        if (file) {
          openedFocus.current = true;
          setViewing(file);
        }
      }
    } catch (error: any) {
      alertDialog('Error', `No se pudieron cargar las fotos: ${error.message}`);
    }
  }, [fileSystem, services, roomId, objectId, photoId]);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadPhotos();
    setRefreshing(false);
  }, [loadPhotos]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  const handleOpenCamera = useCallback(async () => {
    try {
      const permission = await camera.requestPermission();
      if (permission !== 'granted') {
        alertDialog('Permiso requerido', 'Se necesita acceso a la cámara para capturar fotos.');
        return;
      }
      setCameraOpen(true);
    } catch (error: any) {
      alertDialog('Error', error.message);
    }
  }, [camera]);

  const handlePhotoCaptured = useCallback(
    async (photo: PhotoResult) => {
      setCameraOpen(false);
      try {
        // 1. Guardar como archivo — es lo que esta grilla lista/muestra.
        // Archivo (lo que lista esta grilla) + AuditPhoto con su código, autor y sello.
        await saveFieldPhoto({ services, fs: fileSystem, roomId, base64: photo.base64, operator: operatorName });

        await loadPhotos();
      } catch (error) {
        const message = error instanceof AppError ? error.userMessage : 'No se pudo guardar la foto capturada.';
        alertDialog('Error', message);
      }
    },
    [fileSystem, services, roomId, loadPhotos, operatorName],
  );

  const handleDelete = useCallback(
    async (photo: StoredPhoto) => {
      alertDialog('Eliminar foto', `¿Eliminar ${photo.filename}?`, [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            const success = await fileSystem.deletePhoto(photo.filename);
            if (success) {
              await loadPhotos();
            } else {
              alertDialog('Error', 'No se pudo eliminar la foto.');
            }
          },
        },
      ]);
    },
    [fileSystem, loadPhotos],
  );

  // -----------------------------------------------------------------------
  // Vincular foto a un objeto BIM (LinkPhotoToObjectUseCase)
  // -----------------------------------------------------------------------

  const openLinkPicker = useCallback(
    async (photo: StoredPhoto) => {
      const objects = await services.store.listObjects(roomId);
      if (objects.length === 0) {
        alertDialog('Sin objetos', 'Aún no hay muros, puertas, ventanas ni columnas en este Recinto.');
        return;
      }
      setLinkableObjects(objects);
      setLinkTarget(photo);
    },
    [services, roomId],
  );

  const handleLongPress = useCallback(
    (photo: StoredPhoto) => {
      alertDialog(photo.filename, '¿Qué deseas hacer con esta foto?', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Vincular a objeto BIM', onPress: () => void openLinkPicker(photo) },
        { text: 'Eliminar', style: 'destructive', onPress: () => handleDelete(photo) },
      ]);
    },
    [openLinkPicker, handleDelete],
  );

  /** Descripción del objeto vinculado a una foto, para la ficha del visor. */
  const linkedLabelOf = useCallback(
    (photo: StoredPhoto | null): string | undefined => {
      if (!photo) return undefined;
      const audit = auditPhotos.get(photo.filename);
      if (!audit?.linkedObjectId) return undefined;
      const target = linkableObjects.find((o) => o.id === audit.linkedObjectId);
      return target ? describeObject(target) : (audit.linkedObjectId as string);
    },
    [auditPhotos, linkableObjects],
  );

  /**
   * Oculta o vuelve a mostrar el marcador de la foto en la planta.
   *
   * Ocultar NO borra: en un levantamiento con muchas fotos del mismo rincón, la
   * planta se llena de marcadores superpuestos, y poder apagar algunos sin
   * perder la foto es lo que mantiene el plano legible.
   */
  const toggleMarkerVisible = useCallback(
    async (photo: StoredPhoto, visible: boolean) => {
      const audit = auditPhotos.get(photo.filename);
      const marker = audit?.metadata.marker;
      if (!audit || !marker) return;

      try {
        audit.patchMetadata({ marker: { ...marker, visible } });
        await services.store.updateAuditPhoto(audit.id, { metadata_json: audit.metadata_json });
        await loadPhotos();
      } catch {
        alertDialog('Error', 'No se pudo cambiar la visibilidad del marcador.');
      }
    },
    [auditPhotos, services, loadPhotos],
  );

  const handleSelectLinkObject = useCallback(
    async (target: RevitObjectBase) => {
      if (!linkTarget) return;
      setLinking(true);
      try {
        // Correlacionar el archivo de la grilla con su AuditPhoto en SQLite
        // por filename (ver el comentario en handlePhotoCaptured sobre por
        // qué ambos ahora comparten el mismo nombre).
        const auditPhotos = await services.store.listAuditPhotos(roomId);
        const match = auditPhotos.find((p) => p.metadata.filename === linkTarget.filename);
        if (!match) {
          throw new AppError({
            code: AppErrorCode.NOT_FOUND,
            userMessage: 'No se encontró el registro de auditoría de esta foto — puede haberse capturado antes de esta actualización.',
          });
        }

        await services.useCases.linkPhotoToObject.execute({ photoId: match.id, objectId: target.id });
        alertDialog('Vinculada', `Foto vinculada a: ${describeObject(target)}`);
      } catch (err) {
        const message = err instanceof AppError ? err.userMessage : 'No se pudo vincular la foto.';
        alertDialog('Error', message);
      } finally {
        setLinking(false);
        setLinkTarget(null);
      }
    },
    [linkTarget, services, roomId],
  );

  // -----------------------------------------------------------------------
  // Render item
  // -----------------------------------------------------------------------

  const { width: screenW, galleryColumns: columns } = useLayout();
  const thumbSize = (screenW - GAP * (columns + 1)) / columns;

  const renderPhoto = useCallback(
    ({ item }: { item: StoredPhoto }) => (
      <TouchableOpacity
        style={styles.photoContainer}
        onPress={() => setViewing(item)}
        onLongPress={() => handleLongPress(item)}
        accessibilityRole="button"
        accessibilityLabel={`Ver ${auditPhotos.get(item.filename)?.metadata.bimCode ?? item.filename}`}
      >
        <Image
          source={{ uri: item.filepath }}
          style={[styles.thumbnail, { width: thumbSize, height: thumbSize }]}
          resizeMode="cover"
        />
        <Text style={[styles.photoLabel, { width: thumbSize }]} numberOfLines={1}>
          {auditPhotos.get(item.filename)?.metadata.bimCode ?? item.filename}
        </Text>
      </TouchableOpacity>
    ),
    [handleLongPress, auditPhotos, thumbSize],
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.count}>{photos.length} fotos</Text>
      </View>

      {/* Photo grid */}
      {photos.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Sin fotos</Text>
          <Text style={styles.emptySubtext}>
            Captura fotos con el botón de abajo, o usa la herramienta Foto del Levantamiento para
            anclarlas a un punto de la planta. Toca una foto para verla; mantenla pulsada para
            vincularla a un objeto BIM o eliminarla.
          </Text>
        </View>
      ) : (
        <FlatList
          data={photos}
          renderItem={renderPhoto}
          keyExtractor={item => item.filename}
          // Columnas según el ancho (girar el equipo o tableta); FlatList exige otra key al cambiarlas.
          key={`cols-${columns}`}
          numColumns={columns}
          contentContainerStyle={styles.grid}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* Capture button */}
      <TouchableOpacity style={styles.captureButton} onPress={handleOpenCamera}>
        <View style={styles.captureIcon} />
      </TouchableOpacity>

      {/* Visor a pantalla completa con overlays no destructivos */}
      <PhotoViewer
        visible={viewing != null}
        uri={viewing?.filepath ?? null}
        photo={viewing ? auditPhotos.get(viewing.filename) ?? null : null}
        linkedObjectLabel={linkedLabelOf(viewing)}
        onClose={() => setViewing(null)}
        onLink={
          viewing
            ? () => {
                const target = viewing;
                setViewing(null);
                void openLinkPicker(target);
              }
            : undefined
        }
        onDelete={
          viewing
            ? () => {
                const target = viewing;
                setViewing(null);
                void handleDelete(target);
              }
            : undefined
        }
        onToggleMarkerVisible={
          viewing && auditPhotos.get(viewing.filename)?.metadata.marker
            ? (visible) => void toggleMarkerVisible(viewing, visible)
            : undefined
        }
      />

      {/* Cámara en vivo — pantalla completa modal */}
      <Modal visible={cameraOpen} animationType="slide" onRequestClose={() => setCameraOpen(false)}>
        <CameraCaptureView
          capture={camera}
          onCapture={handlePhotoCaptured}
          onClose={() => setCameraOpen(false)}
        />
      </Modal>

      {/* Selector de objeto BIM para vincular la foto (LinkPhotoToObjectUseCase) */}
      <Modal
        visible={linkTarget != null}
        animationType="slide"
        transparent
        onRequestClose={() => setLinkTarget(null)}
      >
        <View style={styles.linkModalOverlay}>
          <View style={styles.linkModalSheet}>
            <Text style={styles.linkModalTitle}>Vincular a objeto BIM</Text>
            <Text style={styles.linkModalSubtitle} numberOfLines={1}>
              {linkTarget?.filename}
            </Text>
            <FlatList
              data={linkableObjects}
              keyExtractor={(obj) => obj.id as string}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.linkObjectRow}
                  onPress={() => handleSelectLinkObject(item)}
                  disabled={linking}
                >
                  <Text style={styles.linkObjectLabel}>{describeObject(item)}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.linkCancelButton} onPress={() => setLinkTarget(null)} disabled={linking}>
              <Text style={styles.linkCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = themedStyles((colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Roboto_700Bold',
    color: colors.text,
  },
  count: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  grid: {
    padding: GAP,
  },
  photoContainer: {
    margin: GAP / 2,
  },
  thumbnail: {
    borderRadius: 4,
    backgroundColor: colors.background,
  },
  photoLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontFamily: 'Roboto_500Medium',
    color: colors.textDisabled,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textDisabled,
    marginTop: 8,
    textAlign: 'center',
  },
  captureButton: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  captureIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: colors.textOnAccent,
  },
  linkModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  linkModalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '70%',
  },
  linkModalTitle: {
    fontSize: 16,
    fontFamily: 'Roboto_700Bold',
    color: colors.text,
  },
  linkModalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  linkObjectRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkObjectLabel: {
    fontSize: 14,
    color: colors.text,
  },
  linkCancelButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  linkCancelText: {
    fontSize: 14,
    fontFamily: 'Roboto_500Medium',
    color: colors.error,
  },
}));

export default GalleryScreen;
