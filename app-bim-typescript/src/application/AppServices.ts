// =============================================================================
// AppServices.ts — Composition root: cablea Infrastructure/Native detrás de
// las interfaces que Application espera, y arma los UseCases con sus
// dependencias reales.
//
// GAP CERRADO: no existía ningún punto único donde IObjectStore,
// IValidationService, ICDT y CommandStack se ensamblaran contra
// implementaciones REALES — cada test los mockeaba individualmente, y
// src/ui/screens/SurveyScreen.tsx (antes de esta wiring) no usaba ninguna
// capa de Application/Infrastructure en absoluto: dibujaba con estado local
// de React que se perdía al desmontar el componente.
// =============================================================================

import { IDatabase } from '../infrastructure/sqlite/database';
import { LevelId, levelId } from '../domain/objects/base';
import { ObjectStore } from '../infrastructure/sqlite/ObjectStore';
import { ProjectStore } from '../infrastructure/sqlite/ProjectStore';
import { ProjectService } from './projects/ProjectService';
import { ValidationService } from '../infrastructure/validation/ValidationService';
import { CDTAdapter } from '../infrastructure/geometry/CDTAdapter';
import { CommandStack } from './state/CommandStack';
import {
  CreateWallUseCase,
  CreateDoorUseCase,
  CreateWindowUseCase,
  CreateColumnUseCase,
  MoveObjectUseCase,
  DeleteObjectUseCase,
  CloseRoomUseCase,
  CapturePhotoUseCase,
  LinkPhotoToObjectUseCase,
  CaptureMeasurementUseCase,
  ExportRoomIfcUseCase,
  SaveRoomDraftUseCase,
  RecoverRoomDraftUseCase,
  DetectRoomsUseCase,
  UpdateObjectPropertyUseCase,
  CreateControlPointUseCase,
  DefineSiteCoordinateSystemUseCase,
} from './use-cases';
import { ExportRoomDxfUseCase } from './use-cases/ExportRoomDxfUseCase';
import { WallElevationService } from './elevation/WallElevationService';
import { IFCSerializerAdapter } from '../infrastructure/export/ifc/IFCSerializerAdapter';

export interface AppServices {
  db: IDatabase;
  store: ObjectStore;
  commandStack: CommandStack;
  validationService: ValidationService;
  cdt: CDTAdapter;
  projectStore: ProjectStore;
  /**
   * Proyectos y espacios (portado de LevON). No vive bajo `useCases` porque no
   * es un UseCase BIM: es CRUD de metadatos que no entra en el CommandStack —
   * ver la nota de cabecera de ProjectService.
   */
  projects: ProjectService;
  /** Motor de Elevación de Muros (MEM, portado de LevON). */
  elevations: WallElevationService;
  /**
   * Nivel al que se adscriben los Recintos creados desde la UI. PolyLive
   * todavía no modela varias plantas (ver docs/13-AUDITORIA-UNIFICACION.md §
   * "Niveles"); tener la constante aquí, en vez de repetida como literal
   * `'level-1'` en cada pantalla, deja un único sitio que tocar el día que
   * se modele de verdad.
   */
  defaultLevelId: LevelId;
  useCases: {
    createWall: CreateWallUseCase;
    createDoor: CreateDoorUseCase;
    createWindow: CreateWindowUseCase;
    createColumn: CreateColumnUseCase;
    moveObject: MoveObjectUseCase;
    updateObjectProperty: UpdateObjectPropertyUseCase;
    deleteObject: DeleteObjectUseCase;
    closeRoom: CloseRoomUseCase;
    capturePhoto: CapturePhotoUseCase;
    linkPhotoToObject: LinkPhotoToObjectUseCase;
    captureMeasurement: CaptureMeasurementUseCase;
    exportRoomIfc: ExportRoomIfcUseCase;
    /** Exportación a DXF R2000 (portada de LevON). */
    exportRoomDxf: ExportRoomDxfUseCase;
    saveRoomDraft: SaveRoomDraftUseCase;
    recoverRoomDraft: RecoverRoomDraftUseCase;
    /**
     * Detección automática de recintos (motor portado de LevON).
     * Devuelve SUGERENCIAS: `closeRoom` sigue siendo quien cierra el recinto.
     */
    detectRooms: DetectRoomsUseCase;

    // Topografía (Spike #7) — alcanzables desde SurveyControlScreen.
    createControlPoint: CreateControlPointUseCase;
    defineSiteCoordinateSystem: DefineSiteCoordinateSystemUseCase;
  };
}

/**
 * Construye todos los servicios de aplicación sobre una `IDatabase` ya
 * abierta y migrada. El llamador decide QUÉ implementación de IDatabase usar
 * (`Database` de sqlite3 en Node/tests, `ExpoSQLiteDatabase` en el dispositivo)
 * — este factory es agnóstico a esa elección.
 */
export function createAppServices(db: IDatabase): AppServices {
  const store = new ObjectStore(db);
  const commandStack = new CommandStack(store);
  const validationService = new ValidationService();
  const cdt = new CDTAdapter();
  const ifcSerializer = new IFCSerializerAdapter();
  const projectStore = new ProjectStore(db);
  const defaultLevelId = levelId('level-1');

  return {
    db,
    store,
    commandStack,
    validationService,
    cdt,
    projectStore,
    projects: new ProjectService(projectStore, store, defaultLevelId),
    elevations: new WallElevationService(db, store, commandStack),
    defaultLevelId,
    useCases: {
      createWall: new CreateWallUseCase(store, commandStack, validationService),
      createDoor: new CreateDoorUseCase(store, commandStack, validationService),
      createWindow: new CreateWindowUseCase(store, commandStack, validationService),
      createColumn: new CreateColumnUseCase(store, commandStack, validationService),
      moveObject: new MoveObjectUseCase(store, commandStack),
      updateObjectProperty: new UpdateObjectPropertyUseCase(store, commandStack, validationService),
      deleteObject: new DeleteObjectUseCase(store, commandStack),
      closeRoom: new CloseRoomUseCase(store, commandStack, validationService, cdt),
      capturePhoto: new CapturePhotoUseCase(store, commandStack),
      linkPhotoToObject: new LinkPhotoToObjectUseCase(store, commandStack),
      captureMeasurement: new CaptureMeasurementUseCase(store),
      exportRoomIfc: new ExportRoomIfcUseCase(store, validationService, ifcSerializer),
      exportRoomDxf: new ExportRoomDxfUseCase(store),
      saveRoomDraft: new SaveRoomDraftUseCase(store),
      recoverRoomDraft: new RecoverRoomDraftUseCase(store),
      // Sin dependencias: es una función pura sobre una lista de muros.
      detectRooms: new DetectRoomsUseCase(),
      createControlPoint: new CreateControlPointUseCase(store),
      defineSiteCoordinateSystem: new DefineSiteCoordinateSystemUseCase(store),
    },
  };
}
