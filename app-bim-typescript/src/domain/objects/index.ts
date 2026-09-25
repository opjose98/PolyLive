// =============================================================================
// index.ts — Exportaciones de todos los objetos BIM del dominio
// =============================================================================

// Base y tipos compartidos
export {
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  LevelId,
  WallId,
  AuditPhotoId,
  MeasurementId,
  RevitObjectType,
  ObjectProperties,
  IObjectStore,
  revitObjectId,
  roomId,
  levelId,
  wallId,
  auditPhotoId,
  measurementId,
  generateId,
} from './base';

// Objetos BIM concretos
export { Wall } from './wall';
export { Door } from './door';
export { Window } from './window';
export { Column, ColumnSectionShape } from './column';
export { Floor } from './floor';
export { Room } from './room';

// Entidades auxiliares
export { Measurement, CaptureMethod } from './measurement';
export { AuditPhoto, PhotoMetadata } from './audit-photo';

// Topografía (Spike #7) — SurveyControlPoint y SiteCoordinateSystem
// pertenecen a una Sede (Site), no a un Recinto (Room)
export {
  SurveyControlPoint,
  SiteCoordinateSystem,
  GpsCoordinates,
  SiteId,
  SurveyControlPointId,
  OperatorId,
  siteId,
  surveyControlPointId,
  operatorId,
} from './survey';
