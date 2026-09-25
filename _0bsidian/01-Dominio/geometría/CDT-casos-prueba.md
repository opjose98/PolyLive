---
name: CDT-casos-prueba
description: 12 casos de prueba con input/output exacto para validar triangulación CDT.
type: testing
depends-on: "[[CDT-algoritmo]], [[tipos-geométricos]]"
mentioned-in: "geometry-kernel-test-cases.md, estrategia-testing-y-fixtures.md §1.1"
tags: #geometría #testing #validation
---
# CDT — 12 Casos de Prueba

## Resumen
Casos de prueba unitarios para [[CDT-algoritmo]], con input/output conocido. Corren en Node/Jest sin SQLite ni UI.

## Caso A: Rectángulo Simple

**Input:** 4 vértices (rectángulo 5m×3m)

**Expected:** 
- `valid: true`
- `totalArea: 15.0 m²`
- `triangles.length: 2` (N-2 = 4-2)
- `degenerateCount: 0`

**Propósito:** Caso base — valida Fases 1+3 en lo más simple.

---

## Caso B: Forma en L

**Input:** 6 vértices formando una L

**Expected:**
- `valid: true`
- `totalArea: 27.0 m²`
- `triangles.length: 4`
- `degenerateCount: 0`

**Propósito:** Concavidad simple — valida que Fase 2 (forzado de aristas) maneja esquinas cóncavas.

---

## Caso C: Forma en U (Concavidad múltiple)

**Input:** 8 vértices formando una U

**Expected:**
- `valid: true`
- `totalArea: 24.0 m²`
- `triangles.length: 6`

**Propósito:** Múltiples entrantes — robustez del forzado de aristas.

---

## Caso D: Rectángulo con 2 huecos (Columnas)

**Input:** Rectángulo 10m×6m + 2 cuadrados 1m×1m (columnas)

**Expected:**
- `valid: true`
- `totalArea: 58.0 m²` (60 - 2)
- `degenerateCount: 0`
- Ningún triángulo tiene centroide dentro de los huecos

**Propósito:** Caso de uso real más común — valida Fase 3 (eliminación de triángulos en huecos).

---

## Caso E: Puntos Tangentes (Hueco tocando borde)

**Input:** Hueco cuya esquina toca exactamente el borde exterior

**Expected:**
- `valid: true` (con posible degeneración aceptable)
- `area ≈ 23.0 m²` (tolerancia ±0.01, no exacta)

**Propósito:** Caso límite — validar robustez cuando geometrías colisionan exactamente.

---

## Caso F: Vértices Casi Colineales (ángulo <5°)

**Input:** Polígono con 3 vértices muy cercanos entre sí

**Expected:**
- `valid: true`
- No NaN en áreas
- No triángulos con área negativa

**Propósito:** Validar manejo de `EPSILON` en test de círculo circunscrito.

---

## Caso G: Hueco muy pequeño (5cm × 5cm)

**Input:** Huecos diminutos

**Expected:**
- `valid: true`
- Huecos procesados correctamente (no descartados erróneamente)

**Propósito:** Validar que `AREA_MINIMA_VALIDA` no rechaza huecos válidos pequeños.

---

## Caso H: Puntos Duplicados

**Input:** Polígono con dos vértices idénticos consecutivos

**Expected Behavior:**
- O: `valid: false` con `degenerateCount > 0`
- O: Deduplicar automáticamente y resultado válido
- **Decisión:** Implementador elige, pero debe documentarse

**Propósito:** Fuerza decisión explícita sobre tolerancia.

---

## Caso I: Casi Cerrado (4cm de gap)

**Input:** Último vértice a 4cm del primero

**Expected:** Este test valida la **integración** `isClosed()` → snapeo → `triangulate()` (ver [[Room-especificación]]).

**Propósito:** No testea CDT aislado, sino el flujo completo de cierre.

---

## Caso J: Polígono Auto-Intersectante ("Mariposa")

**Input:** Polígono que se cruza a sí mismo

**Expected:**
- `valid: false`
- Warning tipo `self_intersecting_polygon`

**Propósito:** Validar fallo controlado — el algoritmo rechaza input inválido, no crashea.

---

## Caso K: Recinto muy alargado (Ratio extremo)

**Input:** Rectángulo 40m×1.2m (pasillo largo y angosto)

**Expected:**
- `valid: true`
- `area: 48.0 m²`
- Sin falsos positivos de degeneración por ratio extremo

**Propósito:** Validar robustez en geometrías reales de edificios.

---

## Caso L: Realista completo (Referencia)

**Input:** Forma irregular compleja + 2 columnas

**Expected:**
- `valid: true`
- Área calculada correctamente (verificar con shoelace formula aparte)
- Usado también en prueba de **campo #2** del Maestro §16

**Propósito:** Caso de referencia para medición de rendimiento real en dispositivo.

---

## Orden recomendado de implementación

A → B → D → C → K → F → G → I → H → J → E → L

(De más simple/aislado a más compuesto/realista)

---

*Creada: 2026-09-14*