// =============================================================================
// AppError.test.ts — Tipo de error centralizado
// Cierra Gap #2 de docs/07-BUGS-GAPS-COMPLETE.md
// =============================================================================

import { AppError, AppErrorCode, notFoundError, persistenceError, useCaseRollbackError } from '../../src/shared/errors/AppError';

describe('AppError', () => {
  it('expone code, userMessage y technicalDetail por separado', () => {
    const err = new AppError({
      code: AppErrorCode.VALIDATION_FAILED,
      userMessage: 'El muro es demasiado delgado.',
      technicalDetail: 'thickness=0.02 < MIN_THICKNESS=0.1',
    });

    expect(err.code).toBe(AppErrorCode.VALIDATION_FAILED);
    expect(err.userMessage).toBe('El muro es demasiado delgado.');
    expect(err.technicalDetail).toContain('thickness=0.02');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('wrap() preserva el error original como cause y su mensaje como technicalDetail', () => {
    const original = new Error('SQLITE_CORRUPT: database disk image is malformed');
    const wrapped = AppError.wrap(original, AppErrorCode.PERSISTENCE_ERROR, 'No se pudo guardar.');

    expect(wrapped.cause).toBe(original);
    expect(wrapped.technicalDetail).toBe(original.message);
    expect(wrapped.userMessage).toBe('No se pudo guardar.');
  });

  it('wrap() sobre un AppError existente no lo envuelve dos veces — mezcla contexto', () => {
    const inner = new AppError({
      code: AppErrorCode.NOT_FOUND,
      userMessage: 'No encontrado',
      context: { id: 'wall-1' },
    });
    const rewrapped = AppError.wrap(inner, AppErrorCode.UNKNOWN, 'mensaje ignorado', { extra: true });

    expect(rewrapped.code).toBe(AppErrorCode.NOT_FOUND); // conserva el código original
    expect(rewrapped.userMessage).toBe('No encontrado');
    expect(rewrapped.context).toMatchObject({ id: 'wall-1', extra: true });
  });

  it('wrap() sobre un valor no-Error usa String(error) como technicalDetail', () => {
    const wrapped = AppError.wrap('boom', AppErrorCode.UNKNOWN, 'Algo falló');
    expect(wrapped.technicalDetail).toBe('boom');
  });

  it('toLogObject() produce un objeto serializable con todos los campos relevantes', () => {
    const err = new AppError({
      code: AppErrorCode.EXPORT_FAILED,
      userMessage: 'La exportación falló.',
      technicalDetail: 'IFC generation threw mid-stream',
      context: { roomId: 'room-1' },
    });
    const log = err.toLogObject();

    expect(log.code).toBe(AppErrorCode.EXPORT_FAILED);
    expect(log.userMessage).toBe('La exportación falló.');
    expect(log.technicalDetail).toBe('IFC generation threw mid-stream');
    expect(log.context).toEqual({ roomId: 'room-1' });
    expect(typeof log.occurredAt).toBe('string');
  });

  it('notFoundError() produce un AppError con código NOT_FOUND y contexto útil', () => {
    const err = notFoundError('Wall', 'wall-42');
    expect(err.code).toBe(AppErrorCode.NOT_FOUND);
    expect(err.context).toEqual({ entity: 'Wall', id: 'wall-42' });
    expect(err.userMessage).toContain('wall-42');
  });

  it('persistenceError() envuelve la causa con código PERSISTENCE_ERROR', () => {
    const cause = new Error('disk full');
    const err = persistenceError('CreateWallUseCase', cause);
    expect(err.code).toBe(AppErrorCode.PERSISTENCE_ERROR);
    expect(err.cause).toBe(cause);
    expect(err.context).toEqual({ operation: 'CreateWallUseCase' });
  });

  it('useCaseRollbackError() produce código USE_CASE_ROLLBACK con contexto del UseCase', () => {
    const cause = new Error('rollback transaction failed');
    const err = useCaseRollbackError('CloseRoomUseCase', cause, { roomId: 'room-1' });
    expect(err.code).toBe(AppErrorCode.USE_CASE_ROLLBACK);
    expect(err.context).toMatchObject({ useCase: 'CloseRoomUseCase', roomId: 'room-1' });
  });
});
