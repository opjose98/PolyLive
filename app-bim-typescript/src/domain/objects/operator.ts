// =============================================================================
// operator.ts — Operator: perfil de la persona que realiza el levantamiento
// =============================================================================
//
// GAP CERRADO: `OperatorId` (branded type) existía desde Spike #7 — se usa
// como `SiteCoordinateSystem.definedBy` — pero ninguna entidad `Operator`
// real, tabla, ni forma de crear/listar operadores existía en src/. Los
// wireframes planeados (docs/10-NEXT-PHASE-ROADMAP.md §3.2) especifican
// `OperatorSelector` y `OperatorProfileManager`, que necesitan ambas cosas.
//
// ALCANCE DELIBERADAMENTE MÍNIMO (decisión de producto tomada sin poder
// confirmarla con el usuario — documentada explícitamente en vez de oculta):
// - Solo `name` como campo editable. Sin autenticación, sin contraseña, sin
//   email — igual que 09-PRODUCTION-READINESS.md §5.1 afirma explícitamente
//   ("No PII... si se añaden perfiles de operador con nombre/email, cifrar
//   la base con SQLCipher"). Se mantiene la misma postura: nombre solamente.
// - Sin roles ni permisos — cualquier operador puede hacer cualquier cosa.
// - "Seleccionar operador" es solo trazabilidad (queda como `definedBy` en
//   futuras operaciones que lo requieran), NO es una barrera de seguridad.
// =============================================================================

import { OperatorId } from './survey';

export class Operator {
  readonly id: OperatorId;
  name: string;
  readonly created_at: Date;
  updated_at: Date;
  is_deleted: boolean;

  constructor(params: {
    id: OperatorId;
    name: string;
    created_at?: Date;
    updated_at?: Date;
    is_deleted?: boolean;
  }) {
    if (!params.name || params.name.trim().length === 0) {
      throw new Error('Operator.name no puede estar vacío');
    }
    this.id = params.id;
    this.name = params.name.trim();
    this.created_at = params.created_at ?? new Date();
    this.updated_at = params.updated_at ?? new Date();
    this.is_deleted = params.is_deleted ?? false;
  }
}
