// =============================================================================
// command.fixtures.ts — Secuencia de comandos reutilizable para tests
// Basado en: lista-14-fixtures.md (#10 command-sequence — "3 comandos:
//            CreateWall, MoveWall, UpdateThickness"), tests-comandos.md.
// =============================================================================

import { meters } from '../../src/domain/geometry/types';
import { ICommand } from '../../src/application/commands/Command';
import { CreateWallCommand } from '../../src/application/commands/CreateWallCommand';
import { MoveObjectCommand, MoveSnapshot } from '../../src/application/commands/MoveObjectCommand';
import { UpdateObjectPropertyCommand } from '../../src/application/commands/UpdateObjectPropertyCommand';
import { Wall } from '../../src/domain/objects';
import { createFixtureWall1 } from './geometry.fixtures';

export interface CommandSequenceFixture {
  /** El Wall sobre el que operan los 3 comandos (ya en su estado "movido"). */
  wall: Wall;
  /** [CreateWall, MoveWall, UpdateThickness] — en el orden en que se ejecutarían. */
  commands: [ICommand, ICommand, ICommand];
}

/**
 * command-sequence: 3 comandos que operan sobre wall-1 (createFixtureWall1):
 *
 * 1. CreateWallCommand — testigo de la creación del muro
 * 2. MoveObjectCommand ("MoveWall") — mueve el muro de (0,0)-(4,0) a (1,1)-(5,1)
 * 3. UpdateObjectPropertyCommand ("UpdateThickness") — cambia thickness 0.15 → 0.20
 *
 * NOTA: execute() de estos comandos es no-op por diseño (Command.md) — el
 * UseCase correspondiente ya persiste el cambio antes de emitir el comando.
 * Estos fixtures son útiles para testear CommandStack (undo/redo/FIFO) sin
 * necesidad de levantar UseCases completos ni un IObjectStore real.
 */
export function createFixtureCommandSequence(): CommandSequenceFixture {
  const wall = createFixtureWall1();

  const createCmd = new CreateWallCommand(wall);

  const moveSnapshot: MoveSnapshot = {
    oldStartPoint: { x: 0, y: 0 },
    oldEndPoint: { x: 4, y: 0 },
    newStartPoint: { x: 1, y: 1 },
    newEndPoint: { x: 5, y: 1 },
  };
  const moveCmd = new MoveObjectCommand(wall.id, moveSnapshot);

  const updateThicknessCmd = new UpdateObjectPropertyCommand(
    wall.id,
    'thickness',
    meters(0.15),
    meters(0.2),
  );

  return {
    wall,
    commands: [createCmd, moveCmd, updateThicknessCmd],
  };
}
