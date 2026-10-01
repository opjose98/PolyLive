---
name: CDT-algoritmo
description: Constrained Delaunay Triangulation — algoritmo de triangulación de polígonos simples y con huecos.
type: dominio
depends-on: "[[tipos-geometricos]]"
mentioned-in: "pseudocodigo-cdt.md, Maestro §5.6, [[CDT-casos-prueba]]"
tags: #geometría #core #triangulation #algorithm
---
 # CDT — Constrained Delaunay Triangulation

## Resumen
Algoritmo que toma un polígono simple (con o sin huecos internos) y lo divide en triángulos de forma que:
1. Todos los vértices del polígono exterior y de los huecos son vértices de triángulos
2. Los triángulos respetan exactamente los bordes del polígono (no los cruzan)
3. Cada triángulo es lo más "regular" posible (maximiza el ángulo mínimo)

## El problema que resuelve

Cuando el usuario traza un Recinto en el Canvas, obtiene un polígono (ej. 8 vértices). Para calcular el área, validar que la geometría es válida, o exportar a IFC, necesitamos descomponer ese polígono en triángulos.

**Trivial si es un triángulo.** Complejo si hay columnas (huecos) embebidas.

## Fases del algoritmo

### Fase 1: Triangulación de Delaunay (sin restricciones)

Dado un conjunto de puntos (vértices + huecos), Bowyer-Watson genera una triangulación donde:
- El círculo circunscrito de cada triángulo NO contiene ningún otro punto en su interior
- Resultado: triángulos "buenos" (ángulos no demasiado agudos)

### Fase 2: Forzado de aristas restringidas

Los triángulos de Fase 1 pueden cruzar los bordes del polígono exterior o los huecos. Fase 2 divide triángulos para forzar exactamente los bordes requeridos.

**Entrada:** Bowyer-Watson + lista de aristas restringidas (bordes del polígono)
**Salida:** Triangulación donde cada arista de restricción es exactamente un borde de triángulo (o dos, si un borde es compartido)

### Fase 3: Eliminación de triángulos dentro de huecos

Los triángulos generados en Fases 1-2 pueden caer dentro de los huecos (columnas). Fase 3 elimina cualquier triángulo cuyo centroide está dentro de un hueco.

**Entrada:** Todos los triángulos de Fase 2 + definición de huecos
**Salida:** Solo los triángulos que están dentro del polígono exterior y FUERA de todos los huecos

---

## Resultado

```typescript
interface TriangulationResult {
  triangles: Triangle[]  // triángulos finales, validados
  valid: boolean         // ¿resultado geométricamente válido?
  degenerateCount: number  // cuántos triángulos tuvieron área muy pequeña
  totalArea: SquareMeters  // suma de áreas de todos los triángulos
}
```

## Parámetros

- `EPSILON: 1e-9` — tolerancia para comparaciones de punto flotante (ej. ¿está un punto dentro del círculo circunscrito?)
- `AREA_MINIMA_VALIDA: 1e-6` — área mínima válida de un triángulo (ej. 1 mm²); triángulos menores se marcan como degenerados pero no se eliminan (información diagnóstica)

## Casos de prueba

Ver [[CDT-casos-prueba]] — 12 casos cubren rectángulos simples, formas cóncavas, múltiples huecos, puntos tangentes, y casos límite.

## Complejidad

- **Tiempo:** O(n log n) donde n = número de vértices (exterior + huecos)
- **Espacio:** O(n²) en el peor caso (para almacenar todos los triángulos posibles)

## Invariantes

- La suma de áreas de todos los triángulos finales = área del polígono exterior MENOS suma de áreas de huecos
- Ningún triángulo final tiene vértices dentro de un hueco
- Ningún borde del polígono exterior o de un hueco cruza el interior de otro triángulo

---

## Relacionado con

- [[tipos-geometricos]] — usa Point2D, Triangle, SquareMeters
- [[CDT-casos-prueba]] — validación del algoritmo
- [[miter-encuentros]] — qué pasa después de triangular (cálculo de encuentros limpios)
- [[CloseRoomUseCase]] — orquesta la triangulación cuando el usuario cierra un Recinto

---

*Creada: 2026-09-14*