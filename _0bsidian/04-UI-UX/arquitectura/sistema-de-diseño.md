---
name: sistema-de-diseño
description: Tema por modo × tono (claro, oscuro, alto contraste), tokens, tipografía y estilos con caché.
type: ui-ux
depends-on: "[[modos-de-trabajo]], [[presupuesto-frame]]"
mentioned-in: "[[mapa-de-navegacion]], [[convenciones-de-dibujo]], [[trazabilidad-nota-codigo-test]]"
tags: #ui-ux #diseño #tema #tokens
---

# Sistema de diseño

Código: `ui/design/theme.ts` (colores), `ui/design/tokens.ts` (espacios, radios, tamaños, sombras — **sin
colores**), `ui/design/typography.ts` (Roboto), `ui/design/canvasThemes.ts` (paletas del lienzo),
`ui/design/motion.ts` (duraciones), `ui/design/haptics.ts`. Detalle: `docs/17-TEMA-FLUIDEZ-Y-DIBUJO.md`.

Historia: LevON (navy + amarillo) → mockup (ámbar) en F0 → `ui/theme/tokens.ts` eliminado en la
[[auditoria-post-M2]] → tema por modo en PR #11.

## Dos ejes

- **Modo → acento**: ámbar / verde / azul / morado (los colores de los íconos de [[modos-de-trabajo]]).
- **Tema → tono**: claro, oscuro, alto contraste (sol directo).

`chromeColors(tema, modo)` y `canvasPaletteFor(tema, modo)`: 12 combinaciones precalculadas. El lienzo usa
la misma: trazo en curso, selección, snap y recinto en el color del modo.

## Uso

```ts
const useStyles = themedStyles((colors) => ({ box: { backgroundColor: colors.surface } }));
function X() { const styles = useStyles(); const colors = useTheme(); /* … */ }
```

Hojas de estilo en caché por paleta: cambiar de modo o tema cuesta un render.

## Claves

`accent` (relleno), `accentText` (texto/bordes), `accentSoft`, `textOnAccent`, `surface`, `background`,
`border`, `text`, `textSecondary`, `textDisabled`, `tooltip` / `tooltipText` / `tooltipAccent` (rótulos
invertidos), `glass` (sobre el lienzo), `scrim`, semánticos, `hairline`, `isDark`, `sideB`.

## Reglas

- Ningún color literal en las pantallas (salvo la cámara).
- Objetivos táctiles ≥ 44 px; tolerancia de acierto en el lienzo 22 px.
- Transiciones cortas: 80 / 140 / 200 / 300 ms.
