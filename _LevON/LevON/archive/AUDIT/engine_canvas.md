# Motor de Canvas & Rendering
**Archivos:** `lib/ui/editor/static_layer_painter.dart`, `lib/ui/editor/preview_layer_painter.dart`, `lib/ui/screens/editor_screen.dart` (transform), `lib/ui/editor/preview_generator.dart`

← [[INDEX]]  |  Conectado a: [[engine_editor]], [[engine_state]], [[engine_snap]]

---

## Responsabilidad
Renderizar el modelo BIM en 2D usando `CustomPainter` de Flutter. Gestionar la transformación de coordenadas mundo↔pantalla y la interacción con gestos multitouch.

---

## Arquitectura de Capas

El canvas usa **dos `RepaintBoundary` anidados** para minimizar repaints:

```
Stack
├── RepaintBoundary
│   └── StaticLayerPainter    — muros, rooms, columnas, grid, labels
│       Repinta cuando: walls, rooms, columns, settings, validación, selección, scale, pan
│
└── RepaintBoundary
    └── PreviewLayerPainter   — preview del elemento en creación
        Repinta cuando: drawStart, drawPreview, scale, pan, settings
```

**El RepaintBoundary es crítico:** Mientras el usuario arrastra el dedo para dibujar, solo se repinta la capa de preview (liviana). La capa estática, que dibuja todos los muros, no se repinta.

---

## Sistema de Coordenadas

La transformación mundo↔pantalla usa una matriz implícita (no un Matrix4 explícito):

```
Pantalla → Mundo:
  worldX = (localX - (canvasWidth/2 + panOffset.x)) / scale
  worldY = (localY - (canvasHeight/2 + panOffset.y)) / scale

Mundo → Pantalla:
  screenX = worldX * scale + canvasWidth/2 + panOffset.x
  screenY = worldY * scale + canvasHeight/2 + panOffset.y
```

El origen del mundo (0,0) está en el **centro del canvas**. Pan y escala se aplican desde el centro.

### Zoom con focal point
La corrección del zoom multitouch garantiza que el punto focal no se desplace:
```dart
_panOffset = focalFromCenter - (focalFromCenter - _panOffset) * (newScale / oldScale);
```
La misma fórmula se aplica al scroll del mouse (PointerScrollEvent).

---

## `StaticLayerPainter`

Dibuja en este orden (back-to-front):
1. Grid (si `settings.grid.showGrid` y zoom suficiente)
2. Room fills (polígono relleno semitransparente)
3. Room labels (nombre + área)
4. Columnas (rectángulo o círculo)
5. Muros (línea gruesa con espesor visual)
6. Wall labels (longitud, si `showLengthLabels`)
7. Handles de selección (círculos en extremos + punto medio del muro seleccionado)
8. Validation markers (advertencias/errores de `ValidationPipeline`)

`shouldRepaint` compara todos los campos relevantes. Si `walls`, `rooms`, `columns`, `settings`, `selectedId`, `mode`, `scale` o `panOffset` cambian → repaint.

---

## `PreviewLayerPainter`

Solo dibuja el elemento que se está creando:
- **Muro/Partición:** Línea desde `previewStart` hasta `previewPreview` con etiqueta de longitud en tiempo real
- **Columna:** Rectángulo o círculo en la posición actual

`shouldRepaint` compara: `previewStart`, `previewEnd`, `scale`, `panOffset`, `subMode`, `settings.defaults`, `isCircular`.

**Bug conocido:** `shouldRepaint` no revisaba `settings.defaults` → Preview de columna no actualizaba al cambiar dimensiones en el ribbon. Corregido en 0.7.0.

---

## Magnifier (Lupa)

```
Si (magnifierEnabled && mode == draw && touchPosition != null):
  → Renderiza StaticLayerPainter + PreviewLayerPainter a escala × 2
  → magPanOffset = -worldPt * magScale  (centrado en punto de toque)
  → Posicionada en esquina opuesta al toque
```

La lupa crea dos CustomPainters adicionales que se repintan con el drag. Esto triplica el costo de render durante el dibujo.

---

## Transformación de Gestos

### Pan
`onScaleUpdate` con 1 puntero → `_panOffset += d.focalPointDelta`

### Zoom Pinch
```
_scaleAtPinchStart capturado en onScaleStart
_isPinching = true cuando pointerCount > 1
newScale = _scaleAtPinchStart * d.scale (clamp 10..400)
panOffset corregido con fórmula focal point
```

**Bug conocido:** `_isPinching` permanece `true` si el usuario suelta un dedo pero mantiene el otro — el gesto pasa de pinch a pan pero `_isPinching` no se resetea correctamente. Se resetea en `onScaleEnd` pero no cuando `pointerCount` baja a 1 en `onScaleUpdate`.

---

## Problemas Identificados

### CRÍTICO
- **`editor_screen.dart` tiene 1735 líneas.** Es el God Widget de la aplicación. Gestiona: transformación de coordenadas, gestos, AppBar, 4 modos de editor, keyboard shortcuts, export, dialogs, toolbar, magnifier. Esto viola Single Responsibility masivamente.
- **Magnifier triplica el costo de render** a 60fps durante dibujo. En dispositivos de gama media (Snapdragon 665) esto causará jank. Se necesita throttle o deshabilitar la capa estática en la lupa.
- **`_canvasSize` se asigna en `build()` dentro de `LayoutBuilder`:** Si el widget se reconstruye por un cambio de provider antes de que el `LayoutBuilder` se ejecute, `_canvasSize` puede ser `Size.zero` temporalmente, causando que `_screenToWorld` retorne coordenadas incorrectas.

### MODERADO  
- **`ref.read(wallsProvider)` en `_buildMagnifier`:** Usa `ref.read` (snapshot) en lugar de el valor ya leído en `build()`. Inconsistencia mínima pero podría mostrar estado obsoleto.
- **`scale` y `panOffset` como `setState` local:** Correcto para rendimiento, pero impide que el estado de vista sea persistido o restaurado entre sesiones.
- **Sin `willChange` en los CustomPainters:** Declarar `willChange = true` permite a Flutter pre-alocar buffers de composición. Actualmente ambos painters no declaran este hint.

### MENOR
- Labels de longitud usan `drawText` directo en el painter, sin manejo de RTL para idiomas que no sean LTR. No es crítico para español pero importante para internacionalización.
- `_kMinScale = 10.0`, `_kMaxScale = 400.0` son hardcodeados. Deberían responder al tamaño del modelo para planos muy grandes o muy pequeños.
