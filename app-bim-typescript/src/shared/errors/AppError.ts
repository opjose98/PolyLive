// =============================================================================
// AppError.ts — Tipo de error centralizado de la aplicación
// Basado en: arquitectura-carpetas-v1.md (shared/errors/AppError.ts)
//
// Gap #2 de docs/07-BUGS-GAPS-COMPLETE.md: hasta ahora cada UseCase lanzaba
// errores ad-hoc (Error genérico o ValidationError local a use-cases/types.ts),
// lo que hacía imposible que la UI mostrara mensajes consistentes o que un
// logger centralizado clasificara fallos por severidad/código.
// =============================================================================
//
// INVARIANTES:
// - `code` es siempre uno de AppErrorCode — nunca un string libre.
// - `userMessage` está en español, listo para mostrarse tal cual en la UI.
// - `technicalDetail` NUNCA se muestra al usuario final — solo para logs.
// - `cause`, cuando existe, es el error original que disparó este AppError
//   (permite inspeccionar la causa raíz sin perder el stack).
// =============================================================================

/**
 * Códigos de error estables — se usan para lógica condicional en la UI
 * (ej. mostrar un botón "Reintentar" solo para ciertos códigos) y para
 * agregación en logs/telemetría futura.
 */
export enum AppErrorCode {
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  NOT_FOUND = 'NOT_FOUND',
  PERSISTENCE_ERROR = 'PERSISTENCE_ERROR',
  USE_CASE_ROLLBACK = 'USE_CASE_ROLLBACK',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  EXPORT_FAILED = 'EXPORT_FAILED',
  BACKUP_FAILED = 'BACKUP_FAILED',
  RESTORE_FAILED = 'RESTORE_FAILED',
  /** No se pudo obtener una posición GPS utilizable (sin fix, o precisión inaceptable). */
  GPS_UNAVAILABLE = 'GPS_UNAVAILABLE',
  UNKNOWN = 'UNKNOWN',
}

/** Contexto adicional serializable — nunca debe contener datos sensibles. */
type AppErrorContext = Record<string, unknown>;

interface AppErrorParams {
  code: AppErrorCode;
  /** Mensaje en español, seguro para mostrar directamente en la UI. */
  userMessage: string;
  /** Detalle técnico para logs — nunca se muestra al usuario. */
  technicalDetail?: string;
  /** Contexto estructurado (ids, nombres de UseCase, etc.) para diagnóstico. */
  context?: AppErrorContext;
  /** Error original que causó este AppError, si lo hay. */
  cause?: unknown;
}

/**
 * Error centralizado de la aplicación.
 *
 * Todas las capas Application/Infrastructure/Native deberían lanzar
 * AppError (o dejar que `AppError.wrap()` adapte un error de terceros)
 * en vez de `throw new Error(...)` ad-hoc, para que:
 * - La UI pueda hacer switch(error.code) de forma segura.
 * - Los logs tengan siempre userMessage/technicalDetail/context separados.
 * - El error original (cause) no se pierda al re-lanzar.
 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly technicalDetail?: string;
  readonly context?: AppErrorContext;
  readonly cause?: unknown;
  readonly occurredAt: Date;

  constructor(params: AppErrorParams) {
    super(params.technicalDetail ?? params.userMessage);
    this.name = 'AppError';
    this.code = params.code;
    this.userMessage = params.userMessage;
    this.technicalDetail = params.technicalDetail;
    this.context = params.context;
    this.cause = params.cause;
    this.occurredAt = new Date();

    // Mantener el prototype chain correcto al extender Error en TS/Babel.
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Envuelve un error desconocido (de una librería externa, sqlite3, etc.)
   * en un AppError con código y mensaje de usuario conocidos, preservando
   * el error original en `cause` y su mensaje en `technicalDetail`.
   */
  static wrap(
    error: unknown,
    code: AppErrorCode,
    userMessage: string,
    context?: AppErrorContext,
  ): AppError {
    if (error instanceof AppError) {
      // Ya es un AppError — no lo envolvemos dos veces, mezclamos contexto.
      return new AppError({
        code: error.code,
        userMessage: error.userMessage,
        technicalDetail: error.technicalDetail,
        context: { ...error.context, ...context },
        cause: error.cause ?? error,
      });
    }

    const technicalDetail = error instanceof Error ? error.message : String(error);

    return new AppError({
      code,
      userMessage,
      technicalDetail,
      context,
      cause: error,
    });
  }

  /**
   * Representación segura para logging estructurado — NUNCA incluir
   * en una respuesta expuesta al exterior sin filtrar `technicalDetail`.
   */
  toLogObject(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      userMessage: this.userMessage,
      technicalDetail: this.technicalDetail,
      context: this.context,
      occurredAt: this.occurredAt.toISOString(),
      stack: this.stack,
    };
  }
}

// ---------------------------------------------------------------------------
// Fábricas de conveniencia para los casos más comunes
// ---------------------------------------------------------------------------

export function notFoundError(entity: string, id: string): AppError {
  return new AppError({
    code: AppErrorCode.NOT_FOUND,
    userMessage: `No se encontró ${entity} (${id}).`,
    technicalDetail: `${entity} with id=${id} not found`,
    context: { entity, id },
  });
}

export function persistenceError(operation: string, cause: unknown): AppError {
  return AppError.wrap(
    cause,
    AppErrorCode.PERSISTENCE_ERROR,
    'No se pudo guardar la información. Intenta de nuevo.',
    { operation },
  );
}

export function useCaseRollbackError(useCaseName: string, cause: unknown, context?: AppErrorContext): AppError {
  return AppError.wrap(
    cause,
    AppErrorCode.USE_CASE_ROLLBACK,
    'La operación falló y no se pudo revertir por completo. Revisa el estado del levantamiento.',
    { useCase: useCaseName, ...context },
  );
}
