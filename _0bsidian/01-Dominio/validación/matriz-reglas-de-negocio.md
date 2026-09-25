---
name: matriz-reglas-de-negocio
description: Tabla de referencia rápida — relaciones objeto-objeto, acciones permitida/warning/bloqueo.
type: dominio
depends-on: "[[RevitObjectBase]], [[Wall-especificación]], [[Door-especificación]], [[Room-especificación]]"
mentioned-in: "matriz-reglas-de-negocio.md (documento original)"
tags: #reglas #negocio #matriz #referencia
---

# Matriz de Reglas de Negocio

## Relaciones Objeto-Objeto

| Objeto | Puede existir sin | Puede tocar/superponerse con | Debe estar dentro de | 
|---|---|---|---|
| **Wall** | Room (nunca) | Wall (en esquina/T-joint OK) / Column (embebida, sin validar) | Room |
| **Door** | Wall padre (nunca) | Wall (obligatorio padre) | Wall → Room |
| **Window** | Wall padre (nunca) | Wall (obligatorio padre) | Wall → Room |
| **Column** | Room (nunca) | Wall/Column (sin validar) | Room |
| **Floor** | Floor explícito (materializado implícito) | — | Room |
| **Room** | Level (nunca) | — | Level |

## Acciones — Permitida / Warning / Bloqueo

| Acción | Permitida | Warning | Bloqueo |
|---|---|---|---|
| Door/Window fuera de límites muro | ✅ | ⚠️ | — |
| Wall vs Wall cruce no-limpio | — | — | ❌ |
| Column embebida en Wall | ✅ | — | — |
| Ángulo esquina < 10° | ✅ | ⚠️ | — |
| Recinto 400 objetos (80%) | ✅ | ⚠️ | — |
| Recinto 500 objetos (límite) | — | — | ❌ |
| Exportar IFC/JSON Room abierto | ✅ | ⚠️ | — |
| Exportar Sede sin SiteCoordinateSystem | ✅ | ⚠️ | — |
| Triangulación CDT degenerada | ✅ | ⚠️ (si degenerateCount > 0) | — |
| UseCase falla a mitad | — | — | ❌ (rollback) |
| Backup falla integridad | — | — | ❌ |

---

## Undo/Redo — Qué entra al CommandStack

| Acción | ¿Entra? |
|---|---|
| Crear/editar/borrar Wall/Column/Door/Window/Floor | ✅ |
| Cerrar Room | ✅ |
| Vincular foto a objeto | ✅ |
| Cambiar snap angular | ❌ |
| Cambiar tema | ❌ |
| Capturar medición BLE cruda | ❌ |
| Tomar foto sin vincular | ❌ |
| Exportar IFC/JSON | ❌ |
| Cambiar zoom/pan | ❌ |
| Crear SurveyControlPoint | ❌ |
| Definir SiteCoordinateSystem | ❌ |

---

## Cuándo usar esta matriz

Cuando surja una pregunta "¿esto es error o warning?" o "¿este objeto puede tocar a aquel?" durante desarrollo:
1. Busca la respuesta aquí primero
2. Si no aparece, es una decisión nueva que debe documentarse aquí
3. **Nunca improvises** validaciones silenciosamente

---

## Relacionado con

- Todos los servicios de validación
- [[ValidationWarning-tipos]] — tipos de error/warning
- [[matriz-trazabilidad]] — función → validación asociada

---

*Creada: 2026-09-14*