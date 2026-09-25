// =============================================================================
// index.ts — Barrel exports para application/use-cases
// =============================================================================

export { CreateWallUseCase, CreateWallInput, CreateWallOutput } from './CreateWallUseCase';
export { CreateColumnUseCase, CreateColumnInput, CreateColumnOutput } from './CreateColumnUseCase';
export { CreateDoorUseCase, CreateDoorInput, CreateDoorOutput } from './CreateDoorUseCase';
export { CreateWindowUseCase, CreateWindowInput, CreateWindowOutput } from './CreateWindowUseCase';
export { UpdateObjectPropertyUseCase, UpdateObjectPropertyInput, UpdateObjectPropertyOutput } from './UpdateObjectPropertyUseCase';
export { MoveObjectUseCase, MoveObjectInput, MoveObjectOutput } from './MoveObjectUseCase';
export { DeleteObjectUseCase, DeleteObjectInput, DeleteObjectOutput } from './DeleteObjectUseCase';
export { CloseRoomUseCase, CloseRoomInput, CloseRoomOutput } from './CloseRoomUseCase';
// Detección automática de recintos (motor portado de LevON). Produce
// SUGERENCIAS; CloseRoomUseCase sigue siendo quien cierra el recinto de verdad.
export {
  DetectRoomsUseCase,
  DetectRoomsInput,
  DetectRoomsOutput,
  RoomSuggestion,
} from './DetectRoomsUseCase';
export { CaptureMeasurementUseCase, CaptureMeasurementInput, CaptureMeasurementOutput } from './CaptureMeasurementUseCase';
export { CapturePhotoUseCase, CapturePhotoInput, CapturePhotoOutput } from './CapturePhotoUseCase';
export { LinkPhotoToObjectUseCase, LinkPhotoToObjectInput, LinkPhotoToObjectOutput } from './LinkPhotoToObjectUseCase';
export { ExportRoomIfcUseCase, ExportRoomIfcInput, ExportRoomIfcOutput } from './ExportRoomIfcUseCase';
export { ExportRoomDxfUseCase, ExportRoomDxfInput, ExportRoomDxfOutput } from './ExportRoomDxfUseCase';

// Topografía (Spike #7)
export { CreateControlPointUseCase, CreateControlPointInput, CreateControlPointOutput } from './CreateControlPointUseCase';
export {
  DefineSiteCoordinateSystemUseCase,
  DefineSiteCoordinateSystemInput,
  DefineSiteCoordinateSystemOutput,
} from './DefineSiteCoordinateSystemUseCase';

// Recuperación y continuidad operativa (docs/07-BUGS-GAPS-COMPLETE.md Gaps #1 y #3)
export { SaveRoomDraftUseCase, SaveRoomDraftInput, SaveRoomDraftOutput, IDraftStore as ISaveDraftStore } from './SaveRoomDraftUseCase';
export {
  RecoverRoomDraftUseCase,
  RecoverRoomDraftInput,
  RecoverRoomDraftOutput,
  IDraftStore as IRecoverDraftStore,
} from './RecoverRoomDraftUseCase';
// BackupDatabaseUseCase / RestoreDatabaseUseCase NO se re-exportan aquí a
// propósito: ambos importan `fs`/`path` de Node (I/O de archivos en
// escritorio), y este barril lo importa AppServices.ts, que a su vez
// alcanza App.tsx — el punto de entrada de la app móvil. Un barril se
// evalúa COMPLETO al importarse (Metro ejecuta todas sus sentencias
// `export ... from`, use o no el importador esos nombres), así que
// re-exportar estas dos clases aquí rompía el empaquetado de Metro para
// Android/iOS con "Unable to resolve module 'fs'" — 'fs'/'path' no existen
// en Hermes/React Native (mismo problema de raíz que `Buffer`, ver
// shared/encoding/base64.ts). La variante correcta para dispositivo,
// ExpoBackupDatabaseUseCase (native/backup/), no tiene este problema porque
// usa expo-file-system en vez de `fs`. Quien necesite las clases Node-only
// las importa por su ruta de archivo directa — así ya lo hace
// test/application/BackupRestoreUseCases.test.ts.

// Tipos compartidos
export { ValidationError, IValidationService, IBLEManager, IIFCSerializer, ICDT, ValidationResult } from './types';
