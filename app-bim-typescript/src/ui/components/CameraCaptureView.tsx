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

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView } from 'expo-camera';
import { ExpoPhotoCapture, PhotoResult } from '../../native/camera/ExpoPhotoCapture';
import { alertDialog } from '../primitives';

interface CameraCaptureViewProps {
  capture: ExpoPhotoCapture;
  onCapture: (photo: PhotoResult) => void | Promise<void>;
  onClose: () => void;
}

export function CameraCaptureView({ capture, onCapture, onClose }: CameraCaptureViewProps) {
  const cameraRef = useRef<InstanceType<typeof CameraView> | null>(null);
  const [capturing, setCapturing] = useState(false);
  // El permiso se pide aquí, al abrir la cámara (no al arrancar la app): Android
  // y Google Play esperan que cada permiso se pida en el momento en que se usa.
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    capture
      .requestPermission()
      .then((s) => alive && setAllowed(s === 'granted'))
      .catch(() => alive && setAllowed(false));
    return () => {
      alive = false;
    };
  }, [capture]);

  const handleShutterPress = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      capture.setCameraRef(cameraRef.current);
      const photo = await capture.takePicture();
      await onCapture(photo);
    } catch (err: any) {
      alertDialog('Error de cámara', err?.message ?? 'No se pudo capturar la foto.');
    } finally {
      setCapturing(false);
    }
  }, [capture, capturing, onCapture]);

  if (allowed === false) {
    return (
      <View style={[styles.container, styles.denied]}>
        <Text style={styles.deniedText}>PolyLive necesita la cámara para tomar fotos de evidencia. Actívala en Ajustes del equipo → Apps → PolyLive BIM → Permisos.</Text>
        <TouchableOpacity style={styles.deniedButton} onPress={onClose}>
          <Text style={styles.deniedButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {allowed ? <CameraView ref={cameraRef} style={styles.camera} facing="back" /> : <ActivityIndicator style={styles.camera} color="#FFFFFF" />}

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
  denied: { justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  deniedText: { color: '#FFFFFF', fontSize: 16, textAlign: 'center' },
  deniedButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, backgroundColor: '#FFFFFF' },
  deniedButtonText: { color: '#000000', fontSize: 16 },
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
    fontFamily: 'Roboto_700Bold',
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

