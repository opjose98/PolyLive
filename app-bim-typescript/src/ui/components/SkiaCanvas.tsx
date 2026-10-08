// =============================================================================
// SkiaCanvas.tsx — Skia canvas wrapper component
// Basado en: canvas-2d-skia-mapping.md, Canvas2D-interacción.md
// =============================================================================
//
// Componente React Native que envuelve @shopify/react-native-skia Canvas
// y expone un SkiaCanvasAdapter al padre para renderizar geometría BIM.
//
// RESPONSABILIDADES:
// - Crear y mantener el Canvas Skia
// - Proveer SkiaCanvasAdapter al componente padre via onDraw callback
// - Gestionar el ciclo de vida del canvas
//
// NOTA: react-native-skia v1+ usa renderizado declarativo. Este componente
// usa Picture + createPicture para rendering imperativo compatible con
// la interfaz ICanvasRenderer del adapter.
// =============================================================================

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Canvas, Picture, createPicture, useCanvasRef } from '@shopify/react-native-skia';
import type { SkCanvas } from '@shopify/react-native-skia';
import { SkiaCanvasAdapter, ICanvasRenderer } from '../../native/canvas/SkiaCanvasAdapter';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SkiaCanvasProps {
  width: number;
  height: number;
  onReady?: (renderer: ICanvasRenderer) => void;
  onDraw?: (renderer: ICanvasRenderer) => void;
  backgroundColor?: string;
  style?: object;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SkiaCanvas({
  width,
  height,
  onReady,
  onDraw,
  backgroundColor = '#FFFFFF',
  style,
}: SkiaCanvasProps) {
  const canvasRef = useCanvasRef();

  const picture = useMemo(
    () =>
      createPicture(
        (canvas: SkCanvas) => {
          const adapter = new SkiaCanvasAdapter(canvas);
          adapter.clear(backgroundColor);

          if (onReady) {
            onReady(adapter);
          }

          if (onDraw) {
            onDraw(adapter);
          }
        },
        { x: 0, y: 0, width, height },
      ),
    [width, height, onReady, onDraw, backgroundColor],
  );

  return (
    <View style={[styles.container, { width, height }, style]}>
      <Canvas ref={canvasRef} style={{ width, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 4,
  },
});

