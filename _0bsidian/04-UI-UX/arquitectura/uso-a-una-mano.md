---
name: uso-a-una-mano
description: Decisiones para usar la app en obra con una mano, al sol, con guantes.
type: ui-ux
depends-on: "[[sistema-de-diseño]], [[capa-viva-y-camara]]"
mentioned-in: "[[mapa-de-navegacion]], [[MOC-PolyLive]]"
tags: #ui-ux #campo #accesibilidad
---

# Uso a una mano (obra)

- **Abajo lo frecuente**: FAB + (crear) y deshacer (`ui/workspace/ThumbUndo.tsx`, largo = rehacer) a la
  derecha; herramientas de esquina a la izquierda.
- **Tolerancias generosas**: 22 px de acierto en el lienzo, 8 px de margen para que un toque con guante no
  se vuelva arrastre, objetivos ≥ 44 px.
- **Respuesta inmediata**: el toque no espera al doble toque; háptica al seleccionar, al enganchar a un nodo,
  al soltar y al borrar.
- **Retroalimentación rica**: longitud y ángulo del muro en vivo, anillo de snap, anillo de progreso del
  toque largo, pulso de selección, toasts con "Deshacer".
- **Sol directo**: tema de alto contraste (negro sobre blanco, trazos ×2, bordes 1,5 px).
- **Saber dónde estoy**: el color de toda la interfaz dice el modo; el chip dice nivel y fase.
- Los ejes se ocultan mientras las herramientas de esquina están abiertas (no se tapan).
