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

import { TopographyService } from './geo/TopographyService';
import { GeoStore } from '../infrastructure/sqlite/GeoStore';
import { MarkerStore } from '../infrastructure/sqlite/MarkerStore';
import { ZoneStore } from '../infrastructure/sqlite/ZoneStore';
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
  DetectRoomsUseCase,
  UpdateObjectPropertyUseCase,
} from './use-cases';
import { ExportRoomDxfUseCase } from './use-cases/ExportRoomDxfUseCase';
import { ReshapeWallsUseCase } from './use-cases/ReshapeWallsUseCase';
import { CreateFloorUseCase } from './use-cases/CreateFloorUseCase';
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
  /** Niveles y fases de cada proyecto. */
  markers: MarkerStore;
  /** Recintos con identidad (T0): nombre, uso y contorno de cada espacio cerrado. */
  zones: ZoneStore;
  /** Topografía: georreferencia del proyecto y mojones. */
  geo: GeoStore;
  /** Amarres, mojones y coordenadas reales (usa `geo`). */
  topography: TopographyService;
  useCases: {
    createWall: CreateWallUseCase;
    createDoor: CreateDoorUseCase;
    createWindow: CreateWindowUseCase;
    createColumn: CreateColumnUseCase;
    /** Suelo ligado a un recinto (F6a). */
    createFloor: CreateFloorUseCase;
    moveObject: MoveObjectUseCase;
    updateObjectProperty: UpdateObjectPropertyUseCase;
    /** Mover extremos de varios muros unidos en un paso de deshacer (uniones). */
    reshapeWalls: ReshapeWallsUseCase;
    deleteObject: DeleteObjectUseCase;
    closeRoom: CloseRoomUseCase;
    capturePhoto: CapturePhotoUseCase;
    linkPhotoToObject: LinkPhotoToObjectUseCase;
    captureMeasurement: CaptureMeasurementUseCase;
    exportRoomIfc: ExportRoomIfcUseCase;
    /** Exportación a DXF R2000 (portada de LevON). */
    exportRoomDxf: ExportRoomDxfUseCase;
    /**
     * Detección automática de recintos (motor portado de LevON).
     * Devuelve SUGERENCIAS: `closeRoom` sigue siendo quien cierra el recinto.
     */
    detectRooms: DetectRoomsUseCase;
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
  const geoStore = new GeoStore(db);
  const defaultLevelId = levelId('level-1');

  return {
    db,
    store,
    commandStack,
    validationService,
    cdt,
    projectStore,
    projects: new ProjectService(projectStore, store, defaultLevelId),
    elevations: new WallElevationService(db, store),
    defaultLevelId,
    markers: new MarkerStore(db),
    zones: new ZoneStore(db),
    geo: geoStore,
    topography: new TopographyService(geoStore),
    useCases: {
      createWall: new CreateWallUseCase(store, commandStack, validationService),
      createDoor: new CreateDoorUseCase(store, commandStack, validationService),
      createWindow: new CreateWindowUseCase(store, commandStack, validationService),
      createColumn: new CreateColumnUseCase(store, commandStack, validationService),
      createFloor: new CreateFloorUseCase(store, commandStack),
      moveObject: new MoveObjectUseCase(store, commandStack),
      updateObjectProperty: new UpdateObjectPropertyUseCase(store, commandStack, validationService),
      reshapeWalls: new ReshapeWallsUseCase(store, commandStack),
      deleteObject: new DeleteObjectUseCase(store, commandStack),
      closeRoom: new CloseRoomUseCase(store, commandStack, validationService, cdt),
      capturePhoto: new CapturePhotoUseCase(store, commandStack),
      linkPhotoToObject: new LinkPhotoToObjectUseCase(store, commandStack),
      captureMeasurement: new CaptureMeasurementUseCase(store),
      exportRoomIfc: new ExportRoomIfcUseCase(store, validationService, ifcSerializer),
      exportRoomDxf: new ExportRoomDxfUseCase(store),
      // Sin dependencias: es una función pura sobre una lista de muros.
      detectRooms: new DetectRoomsUseCase(),
    },
  };
}
