// =============================================================================
// index.ts — Barrel exports para application/use-cases
// =============================================================================

export { CreateWallUseCase } from './CreateWallUseCase';
export { CreateColumnUseCase } from './CreateColumnUseCase';
export { CreateDoorUseCase } from './CreateDoorUseCase';
export { CreateWindowUseCase } from './CreateWindowUseCase';
export { UpdateObjectPropertyUseCase } from './UpdateObjectPropertyUseCase';
export { MoveObjectUseCase } from './MoveObjectUseCase';
export { DeleteObjectUseCase } from './DeleteObjectUseCase';
// Detección automática de recintos (motor portado de LevON). El editor la usa
// en cada recarga para mantener la geometría del Recinto (syncRoomGeometry).
export { DetectRoomsUseCase } from './DetectRoomsUseCase';
export { CaptureMeasurementUseCase } from './CaptureMeasurementUseCase';
export { CapturePhotoUseCase } from './CapturePhotoUseCase';
export { LinkPhotoToObjectUseCase } from './LinkPhotoToObjectUseCase';
export { ExportRoomIfcUseCase } from './ExportRoomIfcUseCase';

