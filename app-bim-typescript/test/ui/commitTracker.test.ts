// =============================================================================
// commitTracker.test.ts — Qué texto confirma CommitTextInput
// Regresión H-65 (docs/25 § 6): en los TextField en modo `blur` (nombre y notas del recinto,
// comentario de la observación, nombre del muro, corte, actividad…) el borrador vuelve como
// `value` en cada tecla y se tomaba como "valor de fuera": lo tecleado nunca se guardaba.
// =============================================================================

import { commitTracker } from '../../src/ui/primitives/CommitTextInput';

describe('commitTracker', () => {
  it('lo tecleado se confirma aunque el borrador vuelva como value (eco de TextField)', () => {
    const t = commitTracker('Recinto 1');
    for (const s of ['A', 'Au', 'Aul', 'Aula']) {
      t.typed(s);
      t.external(s); // el TextField re-renderiza con su borrador
    }
    expect(t.take()).toBe('Aula');
    expect(t.take()).toBeNull(); // una sola vez
  });

  it('un valor que llega de fuera (deshacer, otro objeto) es el nuevo punto de partida', () => {
    const t = commitTracker('Muro');
    t.typed('Muro norte');
    t.external('Muro sur'); // se seleccionó otro objeto
    expect(t.take()).toBeNull();
    t.typed('Muro sur 2');
    expect(t.take()).toBe('Muro sur 2');
  });

  it('sin cambios no confirma nada', () => {
    const t = commitTracker('3.00');
    expect(t.take()).toBeNull();
  });
});
