// =============================================================================
// gestureState.test.ts — El estado de un gesto no vive en variables `let`
// Regresión H-25 (docs/25, ronda 2): los callbacks de Gesture.* se convierten en
// worklets y cada uno recibe su PROPIA copia de las variables del cierre. En el
// alzado, `onStart` marcaba `drawing = true` pero `onChange` seguía viendo
// `false`: el trazo de la cercha se volvía paneo y la vista quedaba vacía.
// El estado compartido va en un objeto (useRef), como en PlanCanvas.
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';

const UI = path.join(__dirname, '../../src/ui');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? sources(p) : /\.tsx?$/.test(d.name) ? [p] : [];
  });
}

/** Variables `let` del archivo que algún callback de gesto reasigna. */
function letsMutatedInGestureCallbacks(src: string): string[] {
  const lets = [...src.matchAll(/\blet\s+(\w+)\s*=/g)].map((m) => m[1]);
  const bodies = [...src.matchAll(/\.on(?:Begin|Start|Change|Update|End|Finalize|Touches\w+)\(\s*\(?[^)]*\)?\s*=>\s*\{([\s\S]*?)\n\s*\}\)/g)].map((m) => m[1]);
  return lets.filter((v) => bodies.some((b) => new RegExp(`(?<![\\w.])${v}\\s*(=[^=]|\\+\\+|--|\\+=|-=)`).test(b)));
}

describe('estado de los gestos', () => {
  it('ningún callback de Gesture reasigna una variable `let` (cada worklet tendría su copia)', () => {
    const offenders = sources(UI)
      .filter((f) => /Gesture\.(Pan|Pinch|Tap|LongPress|Rotation)/.test(fs.readFileSync(f, 'utf8')))
      .map((f) => ({ file: path.relative(UI, f), vars: letsMutatedInGestureCallbacks(fs.readFileSync(f, 'utf8')) }))
      .filter((o) => o.vars.length);
    expect(offenders).toEqual([]);
  });

  it('el detector encuentra el patrón de H-25', () => {
    const before = `let drawing = false;
      const pan = Gesture.Pan()
        .onStart(() => {
          drawing = true;
        })`;
    expect(letsMutatedInGestureCallbacks(before)).toEqual(['drawing']);
  });
});
