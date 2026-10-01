---
name: convenciones-de-dibujo
description: Cómo se representa cada elemento en planta — jerarquía de trazos, poché por material, puertas, ventanas, cotas.
type: ui
depends-on: "[[Wall-especificacion]], [[Door-especificacion]], [[Window-especificacion]], [[Column-especificación]], [[Niveles-y-fases]]"
mentioned-in: "[[sistema-de-diseño]], [[MOC-PolyLive]]"
tags: #canvas #dibujo #convenciones
---

# Convenciones de dibujo (planta)

Código: `ui/canvas/planRenderer.ts` (función pura sobre `ICanvasRenderer`), `ui/canvas/wallGeometry.ts`
(`buildWallOutlines`, `faceSegments`, `hatchSegments`). Tests: `test/ui/planRenderer.test.ts`,
`test/ui/wallGeometry.test.ts`.

Fuentes: jerarquía de grosores ISO 128 / NCS; filtros de fase de Revit.

| Elemento | Representación |
|---|---|
| Jerarquía | **Cortado** 2 px · visible 1,2 px · símbolos, tramas y cotas 0,75 px (×2 en alto contraste) |
| Muro | Dos caras gruesas a inglete, jambas en los vanos, tapa en extremos libres |
| Poché (`wallRendering`) | Concreto/portante: **sólido** · ladrillo/bloque/mampostería: **trama a 45°** · drywall/yeso/panel: **contorno** · sin material: portante sólido, tabique trama |
| Existente (fase anterior) | Medio tono, sin poché, trazo medio |
| Puerta | Hoja con espesor (≈4 cm) abierta a 90° + arco fino |
| Ventana | Caras del muro de jamba a jamba + vidrio doble fino |
| Columna | Sección real, poché sólido, trazo grueso |
| Cota | Línea fina con trazos a 45°, valor encima, del lado de **afuera** del recinto |
| Recinto | Relleno suave del color del modo; nombre y área al centro |
| Muro en curso | Contorno en el color del modo; **longitud y ángulo** en vivo |
| Mojón | Triángulo verde (relleno si es punto de control) |

Pendiente (F6b): cotas libres, texto, etiquetas, línea, polígono, vigas (discontinuas, sobre el corte).
