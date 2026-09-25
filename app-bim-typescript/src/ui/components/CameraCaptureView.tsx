// =============================================================================
// CameraCaptureView.tsx — Vista de cámara en vivo para capturar fotos
// Basado en: camera-photo-capture.md
// =============================================================================
//
// GAP CERRADO: ExpoPhotoCapture.takePicture() (native/camera/ExpoPhotoCapture.ts)
// necesita un `cameraRef` apuntando a un <CameraView> MONTADO — hasta ahora
// ningún componente en src/ui/ renderizaba uno, así que la captura de fotos
// no tenía forma de ejecutarse de principio a fin pese a que la lógica de
// ExpoPhotoCapture ya estaba implementada y probada por separado.
// =============================================================================

import React, { useRef, useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { CameraView } from 'expo-camera';
import { ExpoPhotoCapture, PhotoResult } from '../../native/camera/ExpoPhotoCapture';

export interface CameraCaptureViewProps {
  capture: ExpoPhotoCapture;
  onCapture: (photo: PhotoResult) => void | Promise<void>;
  onClose: () => void;
}

export function CameraCaptureView({ capture, onCapture, onClose }: CameraCaptureViewProps) {
  const cameraRef = useRef<InstanceType<typeof CameraView> | null>(null);
  const [capturing, setCapturing] = useState(false);

  const handleShutterPress = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      capture.setCameraRef(cameraRef.current);
      const photo = await capture.takePicture();
      await onCapture(photo);
    } catch (err: any) {
      Alert.alert('Error de cámara', err?.message ?? 'No se pudo capturar la foto.');
    } finally {
      setCapturing(false);
    }
  }, [capture, capturing, onCapture]);

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      <TouchableOpacity style={styles.closeButton} onPress={onClose} disabled={capturing}>
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <View style={styles.shutterContainer}>
        <TouchableOpacity
          style={[styles.shutterButton, capturing && styles.shutterButtonDisabled]}
          onPress={handleShutterPress}
          disabled={capturing}
        >
          {capturing ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.shutterInner} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    top: 48,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  shutterContainer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 4,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shutterButtonDisabled: {
    opacity: 0.6,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
  },
});

export default CameraCaptureView;
