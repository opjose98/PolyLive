// =============================================================================
// index.ts — Exportaciones de todos los objetos BIM del dominio
// =============================================================================

// Base y tipos compartidos
export { RevitObjectBase, RevitObjectId, RoomId, WallId, AuditPhotoId, MeasurementId, ObjectProperties, IObjectStore, revitObjectId, roomId, levelId, wallId, auditPhotoId, measurementId, generateId } from './base';

// Objetos BIM concretos
export { Wall } from './wall';
export { Door } from './door';
export { Window } from './window';
export { Column } from './column';
export { Floor } from './floor';
export { Room } from './room';

// Entidades auxiliares
export { Measurement } from './measurement';
export { AuditPhoto } from './audit-photo';

