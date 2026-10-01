# 17 — Tema por modo, fluidez del lienzo y convenciones de dibujo

> Rama `feat/ui-tema-fluidez` (sobre `main`). Fecha: 2026-10-01.

## 1. La interfaz toma el color del modo y el tono del tema

Dos ejes, 12 combinaciones precalculadas (`ui/design/theme.ts`):

| Modo | Acento claro | Oscuro | Alto contraste |
|---|---|---|---|
| Levantamiento | ámbar `#FF8F00` | `#FFA726` | `#E65100` |
| Topografía | verde `#2E7D32` | `#66BB6A` | `#1B5E20` |
| Avance | azul `#1E88E5` | `#64B5F6` | `#0D47A1` |
| Revisión | morado `#8E24AA` | `#BA68C8` | `#6A1B9A` |

- **Tema** (drawer ⋮ → "Tema", o herramientas de esquina): claro, oscuro (noche, interiores) y alto contraste
  (sol directo: negro sobre blanco, bordes de 1,5 px). Ahora cambia TODA la interfaz, no solo el lienzo.
- El **lienzo** usa la misma combinación (`canvasPaletteFor`): trazo en curso, selección, snap y recinto en el
  color del modo.
- Los rótulos flotantes (toasts, etiquetas del FAB) van invertidos respecto del tema y usan `tooltipText` /
  `tooltipAccent` para leerse en los tres.
- Lado B del alzado: azul; en Avance (que ya es azul) pasa a verde azulado.

**Cómo se usa** (todas las pantallas ya migradas, 45 archivos):

```ts
const useStyles = themedStyles((colors) => ({ box: { backgroundColor: colors.surface } }));
function X() { const styles = useStyles(); const colors = useTheme(); … }
```

Las hojas de estilo se crean una vez por combinación (caché por paleta): cambiar de modo o tema cuesta un
render. `ui/design/tokens.ts` ya no exporta colores (solo espacios, radios, tamaños, sombras).

## 2. Fluidez del lienzo (lag y parpadeo)

| Causa | Efecto | Solución |
|---|---|---|
| La cámara se entregaba al controlador **cada 50 ms** durante pan/pinch/giro | Toda la pantalla (≈1.000 líneas + cromo) se re-renderizaba a 20 Hz | La cámara vive en shared values y se entrega **una vez al soltar** |
| En un pinch, cada entrega cambiaba la escala de grabado | La planta se **regrababa entera** cada 50 ms; grosores y texto saltaban (parpadeo) | Se regraba solo si el zoom se alejó ×1,5 del grabado, y solo el lienzo se entera |
| Trazar un muro o arrastrar un handle cambiaba el estado ~30 veces/s | Re-render de la pantalla en cada movimiento; al arrastrar, regrabado de toda la planta | **Capa viva** (`canvas/liveOverlay.ts`): trazo, objeto arrastrado, sus handles y el snap van a un Picture propio al que solo se suscribe el lienzo; la pantalla filtra los cambios que solo son "vivos" (`sameStructure`) |
| Alzado: cada evento de pan/pinch hacía patch del viewport | Re-render + regrabado por cada movimiento del dedo | Cámara del gesto en el hilo UI (`Group` con matriz); se entrega al soltar (`applyViewDelta`) |
| `SkiaCanvasAdapter` convertía el color (cadena → Skia) en cada trazo | Miles de llamadas JSI por grabado | Pincel y color solo se tocan cuando cambian; colores en caché |
| Toque simple en exclusión con el doble toque | Cada selección esperaba ~300 ms | El toque responde al instante; el doble toque se reconoce en paralelo |

Transiciones más cortas: `duration` 80/140/200/300 ms; pantallas del ☰ 180/140 ms; entrada al alzado ≈350 ms en
total (antes ≈540).

**Pendiente de probar a mano:** pinch y giro con dos dedos (adb no los simula) en un plano grande.

## 3. Convenciones de dibujo (planta)

Fuentes: jerarquía de grosores ISO 128 / NCS (cortado grueso, visible medio, tramas y cotas finas) y filtros de
fase de Revit (existente en medio tono, demolido discontinuo).

| Elemento | Antes | Ahora |
|---|---|---|
| Caras de muro y columnas (cortadas) | trazo fino 1,2 px | **grueso 2 px** (×2 en alto contraste) |
| Relleno del muro | gris por portante/tabique | **según material**: concreto/portante sólido; ladrillo/bloque/mampostería **trama a 45°**; drywall/yeso/panel solo contorno (`wallRendering`) |
| Fase anterior ("existente") | relleno gris | medio tono, sin poché, trazo medio |
| Puerta | línea de hoja + arco | **hoja con espesor** (≈4 cm) + arco fino |
| Ventana | marco interior + vidrio | caras del muro de jamba a jamba + **vidrio doble** fino |
| Cotas | número junto al muro | **línea de cota** fina con trazos a 45°, del lado de afuera del recinto |
| Muro en curso | longitud | **longitud y ángulo** (0° = +X, antihorario como los ejes) |

La trama se calcula en pantalla (`hatchSegments`, con pruebas) alineada a una retícula común: muros vecinos
comparten la trama.

## 4. Uso a una mano

- **Deshacer junto al FAB +** (`ThumbUndo`): aparece solo en Levantamiento y si hay algo que deshacer; toque =
  deshacer, toque largo = rehacer. Deshacer arriba quedaba fuera del alcance del pulgar.
- Las herramientas de esquina ya no tapan los ejes (se ocultan mientras están abiertas).
- Toque inmediato (ver §2).

## 5. Verificación

- `tsc` y `tsc --noUnusedLocals` limpios; jest 857 + 4 *todo* (nuevas: trama, `wallRendering`, ángulo del trazo).
- Teléfono: tema oscuro + Revisión (interfaz morada, lienzo oscuro), dibujo nuevo (cortes gruesos, cotas con
  trazos, hoja de puerta), trazo en vivo con "1.68 m · 0°", deshacer/rehacer desde el pulgar.
