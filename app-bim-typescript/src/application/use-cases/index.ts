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
// Detección automática de recintos (motor portado de LevON). El editor la usa
// en cada recarga para mantener la geometría del Recinto (syncRoomGeometry).
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

// Tipos compartidos
export { ValidationError, IValidationService, IBLEManager, IIFCSerializer, ICDT, ValidationResult } from './types';
