---
name: sistema-de-diseño
description: Tokens de color, espaciado, tipografía y reglas táctiles. Portado de LevON.
type: ui-ux
depends-on: "[[presupuesto-frame]], [[Canvas2D-interacción]]"
mentioned-in: "[[mapa-de-navegacion]], [[trazabilidad-nota-codigo-test]]"
tags: #ui-ux #diseño #tokens #portado-de-levon
---

# Sistema de diseño

## Por qué existe

Antes de `src/ui/theme/tokens.ts`, cada pantalla declaraba sus propios colores literales en su
`StyleSheet` (`#2C3E50`, `#DEE2E6`, `#6C757D`…).

El resultado era que **el mismo concepto** —una superficie, un borde, un texto secundario— tenía
valores distintos según la pantalla, y no había ninguna forma de tocar la identidad visual sin
recorrer las once pantallas a mano.

**Regla: las pantallas no declaran colores literales. Si falta un token, se añade al archivo.**

## Paleta

La identidad (navy + amarillo) viene de LevON (`levon_tokens.dart`), que es la decisión de producto
ya tomada. Los grises y superficies se reconcilian con los que PolyLive ya usaba, para que la
migración no cambie el aspecto de nada que ya estaba bien.

| Grupo | Tokens |
|---|---|
| Marca | `navy` `navyLight` `yellow` `yellowDark` |
| Canvas | `canvasBg` `grid` `gridMajor` `wallStructural` `wallPartition` `wallPreview` `vanoStroke` `columnFill` `snapNode` `nodeColor` `selectStroke` `selectFill` `handleFill` `handleStroke` `roomFill` `roomStroke` `photoMarker` |
| Feedback | `error` `warning` `success` `info` |
| Superficies | `surface` `surface2` `surface3` `divider` `overlayScrim` |
| Texto | `textPrimary` `textSecondary` `textDisabled` `textOnDark` |

## Escalas

- **Espaciado**: 4 / 8 / 12 / 16 / 24 / 32 (escala de 4 pt)
- **Radios**: 4 / 8 / 12 / 16 / 24 / pill
- **Tipografía**: `title` `heading` `body` `bodyStrong` `label` `caption` `mono`

## Reglas táctiles

```typescript
touchTargetMin:   44   // radio táctil mínimo en píxeles
touchTolerancePx: 22   // tolerancia de acierto = la mitad del objetivo visual
handleRadiusPx:    7   // radio de dibujo de los handles
```

La tolerancia se convierte a metros para hablar con [[SelectionService]]:

```typescript
touchToleranceMeters(px, escala) = px / escala
```

Un único sitio donde vive esa fórmula, para que ninguna pantalla la reinvente y la desincronice.

## Campos numéricos: la decisión que importa

`NumberField` edita el valor **como texto** y solo lo confirma al perder el foco o al pulsar
"hecho".

Un `onChangeText` que parseara y persistiera en cada pulsación haría **imposible escribir "0.15"**:
al teclear `0.` el parseo da `0`, el valor se normaliza a `"0"` y el punto desaparece bajo el dedo.

Es el fallo clásico de los formularios numéricos en móvil, y en campo, con guantes, es inutilizable.

Además se acepta **coma decimal**: el teclado numérico de muchos Android en español ofrece `,` y no
`.`, y rechazarla haría el campo intocable.

## Reglas de dibujo en el canvas

Ver [[presupuesto-frame]].

- **El espesor del muro se dibuja a escala, con un mínimo de 2 px.** A zoom bajo, `0.15 m × 5 px/m`
  = 0,75 px: el muro desaparecería.
- **La rejilla usa paso adaptativo** (entre 20 y 100 px por celda). Un paso fijo se vuelve una
  mancha sólida al alejar —miles de líneas por frame, justo lo que se come el presupuesto de 16 ms—
  y desaparece al acercar.
- **La rejilla está anclada al origen del MUNDO**, no a la esquina del viewport. Si se anclara al
  viewport, resbalaría al panear y dejaría de servir de referencia métrica.
- **Una cota ilegible es peor que ninguna.** Por debajo de 40 px de muro en pantalla, la longitud no
  se rotula: se solaparía con el muro contiguo.
- **El caché de tipografías es estático.** Se instancia un `SkiaCanvasAdapter` en cada repintado, así
  que un caché de instancia no llegaría a reutilizarse nunca y `matchFont` se llamaría docenas de
  veces por frame.

## Accesibilidad

Todos los controles llevan `accessibilityRole`, `accessibilityLabel` y, cuando el efecto no es
evidente, `accessibilityHint`. Los toggles usan `accessibilityState.checked`; los selectores,
`accessibilityState.selected`.

## Código

- `src/ui/theme/tokens.ts`
- `src/ui/components/fields.tsx`
- `src/ui/components/ToolPalette.tsx`
