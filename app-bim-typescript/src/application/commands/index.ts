// =============================================================================
// index.ts — Barrel exports para application/commands
// =============================================================================

export { Command, ICommand, CommandId, commandId } from './Command';
export { CreateWallCommand } from './CreateWallCommand';
export { CreateColumnCommand } from './CreateColumnCommand';
export { CreateDoorCommand } from './CreateDoorCommand';
export { CreateWindowCommand } from './CreateWindowCommand';
export { MoveObjectCommand, MoveSnapshot } from './MoveObjectCommand';
export { UpdateObjectPropertyCommand } from './UpdateObjectPropertyCommand';
export { DeleteObjectCommand } from './DeleteObjectCommand';
export { CloseRoomCommand } from './CloseRoomCommand';
export { CapturePhotoCommand } from './CapturePhotoCommand';
export { LinkPhotoCommand } from './LinkPhotoCommand';

// Topografía (Spike #7) — variante SimpleCommand (ver SimpleCommand.ts)
export { SimpleCommand } from './SimpleCommand';
export { CreateControlPointCommand } from './CreateControlPointCommand';
export { DefineSiteCoordinateSystemCommand } from './DefineSiteCoordinateSystemCommand';
