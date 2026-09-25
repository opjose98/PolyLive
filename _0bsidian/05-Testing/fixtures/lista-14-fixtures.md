---
name: lista-14-fixtures
description: Definición de 14 fixtures (test data) reutilizables en todos los tests.
type: testing
depends-on: "[[RevitObjectBase]], [[tipos-geométricos]], [[estrategia-unit-testing]]"
mentioned-in: "Spike #2-5 tests usaron fixtures"
tags: #testing #fixtures #test-data
---

# Fixtures (Test Data)

## 1. room-1
4-vertex rectangle (4m × 3m)

## 2. wall-1, wall-2, wall-3, wall-4
Cada muro del room-1

## 3. door-1, door-2
Door en wall-1 y wall-2

## 4. column-1
Column en centro de room-1

## 5. floor-1
Floor implícito de room-1

## 6. measurement-1
BLE measurement: 3.45m ± 0.05m

## 7. photo-1
BLOB foto (pequeño JPEG para test)

## 8. polygon-complex
Polígono U-shape para CDT stress

## 9. point-array-100
Array de 100 puntos para snap performance

## 10. command-sequence
3 comandos: CreateWall, MoveWall, UpdateThickness

---

*Creada: 2026-09-15*