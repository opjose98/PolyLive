// =============================================================================
// diagnostics.test.ts — reportFailure: el fallo que ve el usuario queda en el registro
// Regresión H-46 (docs/25, ronda 2): los errores del editor solo mostraban un aviso
// y "Enviar diagnóstico" no traía la causa.
// =============================================================================

import { diagnostics, reportFailure } from '../../src/shared/diagnostics';
import { AppError, AppErrorCode } from '../../src/shared/errors/AppError';

describe('reportFailure', () => {
  beforeEach(() => diagnostics.clear());

  it('un error inesperado devuelve el texto genérico y queda como error con su causa', () => {
    const msg = reportFailure('editor', new Error('SQLITE_BUSY'), 'No se pudo guardar el muro.');
    expect(msg).toBe('No se pudo guardar el muro.');
    const [e] = diagnostics.entries();
    expect(e).toMatchObject({ level: 'error', source: 'editor', message: 'No se pudo guardar el muro.' });
    expect(e.detail).toContain('SQLITE_BUSY');
  });

  it('un AppError devuelve su mensaje para el usuario y queda como aviso', () => {
    const err = new AppError({ code: AppErrorCode.VALIDATION_FAILED, userMessage: 'Espesor inválido.', technicalDetail: 'thickness=-1' });
    expect(reportFailure('editor', err, 'No se pudo guardar.')).toBe('Espesor inválido.');
    expect(diagnostics.entries()[0].level).toBe('warn');
  });
});
