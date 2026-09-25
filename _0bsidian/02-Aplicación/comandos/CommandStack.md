---
name: CommandStack
description: Gestor de undo/redo — mantiene FIFO de 100 comandos, orquesta execute/undo.
type: aplicación
depends-on: "[[Command-abstracción]]"
mentioned-in: "Maestro §14, arquitectura-aplicacion-v1.md §2, [[matriz-reglas-de-negocio]]"
tags: #command #stack #undo-redo #core
---

# CommandStack

## Resumen
Mantiene un stack (FIFO) de hasta 100 comandos. Permite:
- `execute(command)` — ejecuta un comando y lo agrega al stack
- `undo()` — revierte el último comando
- `redo()` — repite el último comando deshecho
- `clear()` — borra todo el stack (ej. al exportar)

## Interfaz

```typescript
class CommandStack {
  private stack: ICommand[] = []
  private undoneStack: ICommand[] = []
  private readonly MAX_SIZE = 100
  
  execute(command: ICommand): void {
    command.execute()
    this.stack.push(command)
    
    // Descartar comandos deshecho si hay uno nuevo
    this.undoneStack = []
    
    // Mantener tamaño máximo (FIFO)
    if (this.stack.length > this.MAX_SIZE) {
      this.stack.shift()
    }
  }
  
  async undo(): Promise<void> {
    if (this.stack.length === 0) return
    
    const command = this.stack.pop()!
    if (command.canUndo()) {
      await command.undo()
      this.undoneStack.push(command)
    }
  }
  
  async redo(): Promise<void> {
    if (this.undoneStack.length === 0) return
    
    const command = this.undoneStack.pop()!
    await command.execute()
    this.stack.push(command)
  }
  
  clear(): void {
    this.stack = []
    this.undoneStack = []
  }
  
  canUndo(): boolean { return this.stack.length > 0 }
  canRedo(): boolean { return this.undoneStack.length > 0 }
  size(): number { return this.stack.length }
}
```

## Invariantes

- Máximo 100 comandos en stack (para evitar exceso de memoria)
- Cada `execute()` de comando debe idempotente (pueda correrse 2 veces sin cambiar estado final)
- `undo()` es la inversa exacta de `execute()`
- Agregar un comando nuevo borra el undone stack (no se puede "redo" después de nuevo comando)

## Casos especiales

### Comando no reversible (canUndo = false)

Algunos comandos no pueden revertirse. Ej: "Exportar IFC" (no tiene sentido deshacer una exportación).

```typescript
class ExportIfcCommand extends Command {
  canUndo(): boolean { return false }
  async undo(): Promise<void> { /* no-op */ }
}
```

---

## Relacionado con

- [[Command-abstracción]] — base de todos los comandos
- [[matriz-reglas-de-negocio]] — qué entra en CommandStack
- Todas las UseCases — emiten comandos al CommandStack

---

*Creada: 2026-09-14*