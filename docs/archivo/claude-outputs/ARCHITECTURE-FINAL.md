# ARCHITECTURE-FINAL

## Arquitectura final generada — PolyLive (app de levantamientos BIM)

Este documento describe la arquitectura tal como quedó materializada en código TypeScript real tras los seis spikes del experimento Claude-Obsidian, no la arquitectura tal como fue especificada en el documento maestro. Las dos coinciden en casi todo; donde no coinciden (gaps de implementación), se marca explícitamente y se referencia `BUGS-AND-GAPS.md`.

---

## 1. Las cinco capas

El sistema se organiza en cinco capas con una regla rectora única: **la UI nunca contiene reglas de negocio BIM, el dominio nunca conoce React Native, y la infraestructura (SQLite, BLE, filesystem) nunca se accede directamente desde componentes visuales.**

| Capa | Responsabilidad | Ejemplos generados |
|---|---|---|
| **Domain** | Lógica pura, sin dependencias externas. TypeScript puro, testeable en Node sin simulador. | `CDT.ts`, `miter.ts`, `snap.ts`, `coordinates.ts`, `projections.ts`, entidades (`Wall`, `Door`, `Room`, `Column`, `Window`, `Floor`, `RevitObjectBase`) |
| **Infrastructure** | Todo lo que toca el mundo exterior: persistencia, exportación de archivos. | `database.ts`, `ObjectStore.ts`, `schema.ts` (SQLite); `step-writer.ts`, `guid-generator.ts`, `IFCSerializer.ts`, `compatibility-gate.ts` (exportación IFC) |
| **Application** | Orquestación: casos de uso y comandos tipados que conectan dominio, infraestructura y estado. | 13 UseCases (`CreateWallUseCase`, `CloseRoomUseCase`, `ExportRoomIfcUseCase`, …), 12 Commands (`CreateWallCommand`, `MoveObjectCommand`, `DeleteObjectCommand`, …), `CommandStack.ts` |
| **State** | Estado global de la aplicación, independiente de la UI concreta que lo consuma. | `appStore.ts` (Zustand) |
| **UI** (interacción de Canvas) | Traducción de gestos e interacción visual a coordenadas de dominio. | `CanvasManager.ts`, `GestureHandler.ts`, `MiterHandler.ts`, `SnapHandler.ts` |

Estas cinco capas no son una aspiración de diseño: son carpetas reales bajo `app-bim-typescript/src/` (`domain/`, `infrastructure/`, `application/`, `state/`), generadas spike por spike y verificadas por 208 tests que cruzan sus fronteras.

## 2. Diagrama de flujo

```
┌─────────────────────────────────────────────────────────────────┐
│  UI / Canvas (application/canvas)                                │
│  CanvasManager · GestureHandler · SnapHandler · MiterHandler      │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ coordenadas mundo (Point2D)
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  Application — UseCases (application/use-cases)                  │
│  CreateWallUseCase · MoveObjectUseCase · CloseRoomUseCase ·       │
│  CaptureMeasurementUseCase · CapturePhotoUseCase ·                │
│  ExportRoomIfcUseCase · LinkPhotoToObjectUseCase · …              │
└──────────┬───────────────────────────────────────┬────────────────┘
           │ valida contra                          │ construye y ejecuta
           ▼                                        ▼
┌───────────────────────────┐          ┌───────────────────────────────┐
│  Domain                   │          │  Application — Commands        │
│  Wall/Door/Room/Column/…  │◄─────────┤  CreateWallCommand ·            │
│  CDT · miter · snap ·     │  usa     │  MoveObjectCommand ·            │
│  projections · coords     │  tipos   │  DeleteObjectCommand · …        │
└───────────┬────────────────┘          └───────────────┬─────────────────┘
            │ tipos e interfaces                          │ execute()/undo()
            │ (IObjectStore, ICDT, IValidationService)     ▼
            │                                    ┌───────────────────────┐
            │                                    │  CommandStack          │
            │                                    │  (FIFO, 100 max, undo/ │
            │                                    │   redo)                │
            │                                    └───────────┬─────────────┘
            ▼                                                │ persiste vía
┌─────────────────────────────────────────────────────────────┴─────┐
│  Infrastructure                                                    │
│  ObjectStore (SQLite, WAL) · IFCSerializer · step-writer ·          │
│  guid-generator · compatibility-gate                                │
└─────────────────────────────────────────────────────────────────┘
                                 │ actualiza tras execute()
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│  State (Zustand) — appStore.ts                                    │
│  canvasTransform · selectedObjectId · interactionMode              │
└─────────────────────────────────────────────────────────────────┘
```

Flujo de ejemplo (`CreateWall`, verificado por `test/integration/EndToEnd.test.ts`): un gesto en Canvas se traduce a coordenadas mundo → `CreateWallUseCase.execute()` valida con `IValidationService` → construye un `CreateWallCommand` → el `CommandStack` lo ejecuta, lo que persiste el objeto en SQLite a través de `ObjectStore` → la capa de estado refleja el nuevo objeto. El mismo camino, en reversa, es lo que hace posible Undo/Redo sin lógica adicional en cada UseCase.

## 3. Patrones usados

### Command

Dieciocho comandos tipados especificados (`arquitectura-aplicacion-v1.md` §2), de los cuales doce están implementados y verificados en `application/commands/`. Cada comando implementa el contrato mínimo:

```typescript
interface Command {
  execute(): Promise<void>
  undo(): Promise<void>
  describe(): string
}
```

La decisión de diseño más relevante aquí es que **no existe un comando genérico `UpdatePropertyCommand<T>`**: cada campo mutable de cada tipo de objeto (`UpdateWallThicknessCommand`, `MoveObjectCommand`, etc.) tiene su propio comando, de modo que TypeScript rechaza en tiempo de compilación cualquier combinación inválida entre tipo de objeto y campo. La única excepción intencional es `DeleteObjectCommand`, genérico porque el borrado es estructuralmente idéntico para cualquier `RevitObjectBase` — no hay campo específico que perder tipado.

### UseCase

Cada UseCase implementa `execute()` como única entrada pública y es responsable de una acción de negocio completa, de principio a fin: validar, construir el comando correspondiente, ejecutarlo a través del `CommandStack`, y — cuando la operación tiene más de un paso con efectos persistentes — revertir explícitamente lo ya escrito si un paso posterior falla (política de rollback manual, no transacciones implícitas de framework). La relación UseCase↔Command es 1:1 por diseño: cada UseCase específico construye su propio comando internamente, en lugar de existir una puerta de entrada genérica que acepte cualquier `Command` — esa genericidad reintroduciría justo el problema de tipos que los comandos tipados buscan evitar.

### State (Zustand)

`appStore.ts` mantiene el estado de interacción (`canvasTransform`, `selectedObjectId`) desacoplado de cualquier UseCase concreto. La capa de aplicación actualiza el estado después de que un comando se ejecuta con éxito; la UI solo lee y se suscribe, nunca muta el estado directamente. Los tests de `CriticalCases.test.ts` verifican, por ejemplo, que `appStore.updateCanvasTransform` aplica el mismo clamping de escala (5×–500×) que `CanvasManager.setTransform`, evitando que la regla de negocio viva en dos lugares con la posibilidad de divergir.

## 4. Reglas de importación entre capas

La regla de dependencia es estricta y unidireccional, verificada en los 101 archivos generados sin excepciones detectadas:

| Desde ↓ / Hacia → | UI/Canvas | Application | Domain | Infrastructure | State |
|---|---|---|---|---|---|
| **UI/Canvas** | ✅ | ✅ | ❌ | ❌ | ✅ (lectura) |
| **Application** | ❌ | ✅ | ✅ | ✅ (vía interfaz) | ✅ (escritura) |
| **Domain** | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Infrastructure** | ❌ | ❌ | ✅ (solo tipos) | ✅ | ❌ |
| **State** | — | — | ✅ (tipos) | ❌ | ✅ |

El punto más delicado de esta tabla es `Application → Infrastructure`: la capa de aplicación sí necesita invocar SQLite o el serializador IFC, pero nunca importa la clase concreta — siempre recibe una interfaz definida en `domain/` (`IObjectStore`, `ICDT`, `IValidationService`) por inyección de dependencias. Esto es lo que permite, en la práctica, testear la mayoría de los UseCases con mocks livianos y reservar SQLite real solo para los tests de integración donde el objetivo explícito es verificar la persistencia (ver `TESTING-REPORT.md`).

## 5. Relación con la especificación original

La arquitectura de carpetas planeada (`arquitectura-carpetas-v1.md`) es más extensa que lo generado en estos seis spikes: incluye capas de UI de pantalla completa (`screens/`, `components/`), BLE, cámara, ubicación e i18n que no formaban parte del alcance de este experimento — el objetivo era validar la hipótesis de fragmentación de contexto sobre las capas de mayor riesgo técnico (geometría, persistencia, exportación, orquestación), no construir la aplicación completa. Los UseCases y Commands de sistema (`RecoverRoomDraftUseCase`, `BackupDatabaseUseCase`, `RestoreDatabaseUseCase`) y el modelo de errores centralizado (`AppError`) están especificados pero no implementados todavía — se documentan como gaps reales en `BUGS-AND-GAPS.md`, no como trabajo terminado.
