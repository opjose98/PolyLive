// =============================================================================
// ExportProjectIfcUseCase.ts — El proyecto completo en un solo IFC
// =============================================================================
//
// Lee cada espacio (muros, vanos, columnas, suelos) y los junta en un IFC con
// un único IfcProject/IfcSite/IfcBuilding y un piso por nivel; cada espacio
// queda en su ubicación del proyecto (amarre). Los espacios que no pasan la
// validación se omiten y se informan.
// =============================================================================

import { revitObjectId, type IObjectStore, type RoomId } from '../../domain/objects/base';
import { Column } from '../../domain/objects/column';
import { Door } from '../../domain/objects/door';
import { Floor, floorZoneId, isFreeFloor } from '../../domain/objects/floor';
import { Room } from '../../domain/objects/room';
import { Wall } from '../../domain/objects/wall';
import { Window } from '../../domain/objects/window';
import type { IFCSerializer, ProjectSerializeInput, SpaceContent } from '../../infrastructure/export/ifc/IFCSerializer';
import type { IfcBareOpeningInput, IfcLevelInput, IfcMemberInput, IfcZoneInput } from '../../infrastructure/export/ifc/types';

interface ProjectSpaceInput {
  readonly roomId: RoomId;
  readonly placement?: SpaceContent['placement'];
  readonly zones?: readonly IfcZoneInput[];
  readonly openingSills?: ReadonlyMap<string, number>;
  readonly bareOpenings?: readonly IfcBareOpeningInput[];
  /** Niveles y fases del espacio (docs/23 § 7). */
  readonly levels?: readonly IfcLevelInput[];
  readonly phaseNames?: ReadonlyMap<string, string>;
  readonly members?: readonly IfcMemberInput[];
}

type ExportProjectIfcInput = Omit<ProjectSerializeInput, 'spaces'> & { readonly spaces: readonly ProjectSpaceInput[] };

interface ExportProjectIfcOutput {
  readonly ifcContent: string;
  readonly spaces: number;
  readonly skipped: readonly string[];
}

export class ExportProjectIfcUseCase {
  constructor(
    private readonly store: IObjectStore,
    private readonly serializer: Pick<IFCSerializer, 'serializeProject'>,
  ) {}

  async execute(input: ExportProjectIfcInput): Promise<ExportProjectIfcOutput> {
    const spaces: SpaceContent[] = [];
    const skipped: string[] = [];
    for (const s of input.spaces) {
      const room = await this.store.readObject(revitObjectId(s.roomId));
      if (!(room instanceof Room)) {
        skipped.push(s.roomId as string);
        continue;
      }
      const objects = await this.store.listObjects(s.roomId);
      const floors = objects.filter((o): o is Floor => o instanceof Floor);
      spaces.push({
        room,
        walls: objects.filter((o): o is Wall => o instanceof Wall),
        doors: objects.filter((o): o is Door => o instanceof Door),
        windows: objects.filter((o): o is Window => o instanceof Window),
        columns: objects.filter((o): o is Column => o instanceof Column),
        floor: floors.find((f) => floorZoneId(f) === null) ?? null,
        zoneFloors: floors.filter((f) => floorZoneId(f) !== null || isFreeFloor(f)),
        zones: s.zones,
        openingSills: s.openingSills,
        bareOpenings: s.bareOpenings,
        levels: s.levels,
        phaseNames: s.phaseNames,
        members: s.members,
        placement: s.placement,
      });
    }
    const r = await this.serializer.serializeProject({ ...input, spaces });
    return { ifcContent: r.content, spaces: r.spaces, skipped: [...skipped, ...r.skipped.map((x) => x.name)] };
  }
}
