// =============================================================================
// DefineSiteCoordinateSystemCommand.ts — Comando (SimpleCommand) para la
// definición del SiteCoordinateSystem de una Sede (Spike #7)
// =============================================================================

import { SimpleCommand } from './SimpleCommand';
import { SiteCoordinateSystem } from '../../domain/objects/survey';

/**
 * execute() es no-op — el SiteCoordinateSystem ya fue persistido por
 * DefineSiteCoordinateSystemUseCase.
 *
 * canUndo() es `false` de forma deliberada: SiteCoordinateSystem es
 * INMUTABLE una vez definido (SiteCoordinateSystem.md — "cambiar el sistema
 * invalidaría todas las coordenadas de Recintos ya trazados"), así que no
 * existe una operación de reversión segura. undo() lanza si llegara a
 * invocarse, en vez de fingir revertir algo que no puede revertirse.
 *
 * NOTA: por decisión documentada en matriz-reglas-de-negocio.md §3, este
 * comando NO se registra en CommandStack desde
 * DefineSiteCoordinateSystemUseCase — ver SimpleCommand.ts para el detalle
 * completo de esa decisión (que aquí además está reforzada por la propia
 * invariante de inmutabilidad del dominio).
 */
export class DefineSiteCoordinateSystemCommand implements SimpleCommand {
  readonly type = 'DefineSiteCoordinateSystem' as const;

  constructor(private readonly system: SiteCoordinateSystem) {}

  async execute(): Promise<void> {
    // Ya persistido por DefineSiteCoordinateSystemUseCase
  }

  canUndo(): boolean {
    return false;
  }

  async undo(): Promise<void> {
    throw new Error(
      `DefineSiteCoordinateSystemCommand no es reversible — el SiteCoordinateSystem de la Sede ${this.system.siteId} es inmutable una vez definido`,
    );
  }

  describe(): string {
    return 'Definir sistema de coordenadas de Sede';
  }
}
