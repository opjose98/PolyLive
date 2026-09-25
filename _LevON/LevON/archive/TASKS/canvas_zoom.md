# Task: Optimización del Focal-Point Zoom en Canvas

**Estado:** Implementado (Refinamiento Pendiente)
**Módulo:** `lib/ui/widgets/editor/zoom_pan_controller.dart` (o donde recaiga el `InteractiveViewer`)

## Problema
El zoom funciona correctamente centrado, pero en pantallas táctiles muy grandes, al hacer "pinch-to-zoom", el centro matemático del escalado no siempre es preciso al punto central entre los dos dedos, provocando un salto visual ("jitter").

## Restricciones
*   No usar paquetes de terceros para gestos si entran en conflicto con la lógica de drag-and-drop del editor.
*   Mantener todo en 60 FPS.

## Objetivos
1.  Revisar la matriz de transformación (Matrix4) del canvas.
2.  Interpolar suavemente (con un `AnimationController`) el punto focal en lugar de saltar discretamente en la escala.
