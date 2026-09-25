---
name: lista-18-comandos
description: Referencia rápida de los 18 comandos del sistema — categoría, reversibilidad, descripción.
type: aplicación
depends-on: "[[Command-abstracción]]"
mentioned-in: "arquitectura-aplicacion-v1.md §2.3, [[matriz-reglas-de-negocio]]"
tags: #command #referencia #lista
---

# Lista de 18 Comandos

## Creación (4 comandos)

| Comando | Reversible | Descripción |
|---|---|---|
| CreateWall | ✅ | Crea un muro. Undo: soft-delete |
| CreateColumn | ✅ | Crea una columna. Undo: soft-delete |
| CreateDoor | ✅ | Crea una puerta. Undo: soft-delete |
| CreateWindow | ✅ | Crea una ventana. Undo: soft-delete |

## Movimiento (2 comandos)

| Comando | Reversible | Descripción |
|---|---|---|
| MoveWall | ✅ | Mueve un muro. Undo: restaura posición anterior |
| MoveColumn | ✅ | Mueve una columna. Undo: restaura posición anterior |

## Propiedades (5 comandos)

| Comando | Reversible | Descripción |
|---|---|---|
| UpdateWallThickness | ✅ | Cambia espesor. Undo: restaura espesor anterior |
| UpdateWallHeight | ✅ | Cambia alto. Undo: restaura alto anterior |
| UpdateWallMaterial | ✅ | Cambia material. Undo: restaura material anterior |
| UpdateDoorWidth | ✅ | Cambia ancho de puerta. Undo: restaura ancho anterior |
| UpdateObjectProperty | ✅ | Genérico para cualquier propiedad. Undo: restaura valor anterior |

## Borrado (1 comando)

| Comando | Reversible | Descripción |
|---|---|---|
| DeleteObject | ✅ | Soft-delete un objeto + dependientes. Undo: restaura todos |

## Recinto (1 comando)

| Comando | Reversible | Descripción |
|---|---|---|
| CloseRoom | ✅ | Cierra un Recinto, calcula área. Undo: reabre y borra Floor implícito |

## Auditoría (2 comandos)

| Comando | Reversible | Descripción |
|---|---|---|
| CapturePhoto | ✅ | Captura y guarda foto. Undo: borra foto y su registro |
| LinkPhoto | ✅ | Vincula foto a objeto. Undo: desvincula |

## Especiales (2 comandos)

| Comando | Reversible | Descripción |
|---|---|---|
| ApplyWarning | ⚠️ | Aplica un warning (referencial). Undo: lo quita |
| ExportIfc | ❌ | Exporta a IFC. NO reversible |

---

**Total: 18 comandos, 17 reversibles, 1 no-reversible.**

Todos se agregan a [[CommandStack]] (máx 100 en el stack).

---

*Creada: 2026-09-14*