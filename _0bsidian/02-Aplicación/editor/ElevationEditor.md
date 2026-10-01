---
name: ElevationEditor
description: Controlador puro del alzado de un muro — vanos en la cara, lados A/B, niveles, cámara.
type: aplicación
depends-on: "[[WallElevation-MEM]], [[WallElevationService]], [[Restricciones-verticales]], [[CommandStack]]"
mentioned-in: "[[EditorController]], [[mapa-de-navegacion]], [[capa-viva-y-camara]]"
tags: #aplicación #alzado #F4
---

# ElevationEditor — el alzado

Código: `src/application/elevation/ElevationEditor.ts` · Vista: `ui/screens/ElevationView.tsx`
Comando: `ElevationSnapshotCommand` (una edición del alzado = un paso de deshacer en la historia compartida).

- Coordenadas de la cara del muro (CSL): x a lo largo, y hacia arriba; el lado **B** es espejo.
- Herramientas: Vano, Puerta, Ventana (con antepecho y alto). Arrastre y píldoras solo en Levantamiento.
- Perfil trapezoidal cuando los extremos tienen base/tope distintos.
- "Igualar niveles con muros conectados" propaga las restricciones.
- **Cámara**: el gesto se anima en el hilo UI y se entrega una vez con `applyViewDelta` (antes, cada
  evento del dedo hacía un patch y regrababa el alzado).
- `load()` atrapa sus errores (la vista la llama sin esperar).
