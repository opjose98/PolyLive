// =============================================================================
// SimpleCommand.ts — Variante ligera de Command para operaciones que NO
// operan sobre RevitObjectBase (arquitectura-aplicacion-v1.md §3).
//
// A diferencia de ICommand (Command.ts), un SimpleCommand no recibe un
// IObjectStore en execute()/undo() — cada comando concreto recibe lo que
// necesita por constructor/closure. Existe para casos como
// CreateControlPointCommand y DefineSiteCoordinateSystemCommand, que
// pertenecen a una Sede completa, no a un Room, y por lo tanto no encajan en
// el contrato de ICommand (pensado para entidades BIM).
//
// NOTA DE DISEÑO — resuelve una contradicción real entre dos documentos del
// proyecto:
//
//   - arquitectura-aplicacion-v1.md §3 agrupa `SurveyControlPoint` junto con
//     `LinkPhotoToObjectUseCase` bajo "SimpleCommand ... que igual se
//     registra en el mismo CommandStack".
//   - matriz-reglas-de-negocio.md §3 (que cierra el gap N4-2, específicamente
//     sobre membresía a Undo/Redo) dice lo contrario para estos dos casos:
//     "Crear un SurveyControlPoint → ❌" y "Definir SiteCoordinateSystem → ❌",
//     explícitamente A DIFERENCIA de vincular una foto (✅).
//
// Aquí se sigue matriz-reglas-de-negocio.md por ser la fuente más específica
// sobre esta pregunta exacta, y porque es consistente con una invariante de
// dominio real: SiteCoordinateSystem es INMUTABLE una vez definido
// (SiteCoordinateSystem.md), así que no existe una operación de "deshacer"
// segura para ese caso en particular. En consecuencia, los dos UseCases de
// Spike #7 (CreateControlPointUseCase, DefineSiteCoordinateSystemUseCase) NO
// llaman a CommandStack.execute() con estos comandos.
//
// Aun así, SimpleCommand se implementa y prueba como pieza de
// infraestructura completa (NEXT-STEPS.md la pide explícitamente como gap
// pendiente), disponible para un futuro caso "no-BIM" que sí deba entrar al
// stack — el propio CommandStack ya es genérico sobre cualquier objeto con
// forma execute()/undo()/canUndo(), no solo sobre ICommand.
// =============================================================================

export interface SimpleCommand {
  readonly type: string;
  execute(): Promise<void>;
  undo(): Promise<void>;
  describe(): string;
  /** Por defecto true (mismo default que ICommand.canUndo()). */
  canUndo(): boolean;
}
