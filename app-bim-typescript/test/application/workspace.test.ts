// Lógica del espacio de trabajo portada de polylive-mockup (equivalente a
// los smoke tests del mockup, sin DOM).

import * as path from 'path';
import {
  CATEGORIES_ELEVATION,
  CATEGORIES_PLAN,
  CORNER_TOOLS,
  PROPS,
  VIEWS_ELEVATION,
  VIEWS_PLAN,
  CANVAS_THEMES,
  isToolEnabled,
} from '../../src/application/workspace/catalog';
import { FAB_CLOSED, fabMainIcon, pickFabCategory, pressFabMain } from '../../src/application/workspace/fabMachine';
import { valueFromDrag, nudgeProp } from '../../src/application/workspace/propDrag';
import {
  addItem,
  createRangeState,
  editableItems,
  indexFromTrackFraction,
  itemAt,
  moveThumb,
  removeItem,
  renameItem,
  setItemValue,
  trackFractionOf,
} from '../../src/application/workspace/rangeModel';
import { resolveBpcContext } from '../../src/application/workspace/bpcContext';
import { createWorkspaceStore } from '../../src/state/workspaceStore';

describe('catálogo', () => {
  const glyphs: Record<string, number> = require(path.resolve(
    __dirname,
    '../../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json',
  ));

  it('todos los íconos existen en MaterialCommunityIcons', () => {
    const icons = [
      ...[...CATEGORIES_PLAN, ...CATEGORIES_ELEVATION].flatMap((c) => [c.icon, ...c.tools.map((t) => t.icon)]),
      ...[...VIEWS_PLAN, ...VIEWS_ELEVATION, ...CANVAS_THEMES].map((v) => v.icon!),
      ...CORNER_TOOLS.flatMap((r) => [r.icon, ...r.items.map((i) => ('icon' in i ? i.icon : 'ruler'))]),
    ];
    expect(icons.filter((i) => !(i in glyphs))).toEqual([]);
  });

  it('las herramientas que el motor ya crea están habilitadas; el resto no', () => {
    const enabled = CATEGORIES_PLAN.flatMap((c) => c.tools).filter(isToolEnabled).map((t) => t.id);
    expect(enabled).toEqual(expect.arrayContaining(['muro', 'columna', 'puerta', 'ventana', 'foto', 'medicion']));
    const cota = CATEGORIES_PLAN[0].tools.find((t) => t.id === 'cota')!;
    expect(isToolEnabled(cota)).toBe(false);
  });

  it('los valores por defecto de cada herramienta están dentro de su rango', () => {
    for (const tool of [...CATEGORIES_PLAN, ...CATEGORIES_ELEVATION].flatMap((c) => c.tools)) {
      for (const [k, v] of Object.entries(tool.props ?? {})) {
        const def = PROPS[k as keyof typeof PROPS];
        expect(v).toBeGreaterThanOrEqual(def.min);
        expect(v).toBeLessThanOrEqual(def.max);
      }
    }
  });

  it('alzado no ofrece la vista de topografía', () => {
    expect(VIEWS_ELEVATION.map((v) => v.id)).not.toContain('topografia');
  });
});

describe('FAB de creación', () => {
  it('recorre cerrado → categorías → herramientas → categorías → cerrado', () => {
    let s = FAB_CLOSED;
    expect(fabMainIcon(s)).toBe('plus');
    s = pressFabMain(s);
    expect(s.level).toBe('categories');
    expect(fabMainIcon(s)).toBe('minus');
    s = pickFabCategory(s, 'arquitectonico');
    expect(s).toEqual({ level: 'tools', categoryId: 'arquitectonico' });
    expect(fabMainIcon(s)).toBe('arrow-left');
    s = pressFabMain(s);
    expect(s.level).toBe('categories');
    s = pressFabMain(s);
    expect(s.level).toBe('closed');
  });

  it('elegir categoría con el FAB cerrado no hace nada', () => {
    expect(pickFabCategory(FAB_CLOSED, 'dibujo')).toBe(FAB_CLOSED);
  });
});

describe('píldora arrastrable', () => {
  const def = PROPS.thickness;

  it('un paso por cada 10 px, calculado desde el origen', () => {
    expect(valueFromDrag(def, 15, 0)).toBe(15);
    expect(valueFromDrag(def, 15, 30)).toBe(18);
    expect(valueFromDrag(def, 15, -20)).toBe(13);
  });

  it('respeta mínimo y máximo', () => {
    expect(valueFromDrag(def, 15, -10_000)).toBe(def.min);
    expect(valueFromDrag(def, 15, 10_000)).toBe(def.max);
    expect(nudgeProp(def, def.max, 1)).toBe(def.max);
  });

  it('usa el paso de la propiedad', () => {
    expect(valueFromDrag(PROPS.side, 30, 20)).toBe(40);
  });
});

describe('selector de rango', () => {
  it('estado inicial: −∞, base, +∞ con el central en la base', () => {
    const s = createRangeState('Nivel 0');
    expect(s.items.map((i) => i.id)).toEqual(['inf-', 'base', 'inf+']);
    expect(itemAt(s, 'nivel').name).toBe('Nivel 0');
    expect(itemAt(s, 'superior').id).toBe('inf+');
    expect(itemAt(s, 'inferior').id).toBe('inf-');
  });

  it('agregar crea un valor único (máximo + 1) y conserva la selección', () => {
    let s = createRangeState('Nivel 0');
    s = addItem(s, 'Nivel', 'levels');
    s = addItem(s, 'Nivel', 'levels');
    expect(editableItems(s).map((i) => i.value)).toEqual([2, 1, 0]);
    expect(editableItems(s)[0].name).toBe('Nivel 2');
    expect(itemAt(s, 'nivel').id).toBe('base');
    expect(itemAt(s, 'superior').id).toBe('inf+');
  });

  it('inferior < nivel < superior y el central nunca toca ±∞', () => {
    let s = addItem(addItem(createRangeState('N0'), 'N', 'l'), 'N', 'l'); // −∞,0,1,2,+∞
    s = moveThumb(s, 'nivel', 99);
    expect(s.pos.nivel).toBe(s.pos.superior - 1);
    expect(Number.isFinite(itemAt(s, 'nivel').value)).toBe(true);
    s = moveThumb(s, 'inferior', 99);
    expect(s.pos.inferior).toBe(s.pos.nivel - 1);
    s = moveThumb(s, 'superior', 0);
    expect(s.pos.superior).toBe(s.pos.nivel + 1);
    s = moveThumb(s, 'nivel', -5);
    expect(s.pos.nivel).toBe(s.pos.inferior + 1);
  });

  it('editar un valor reordena y conserva lo que cada deslizador tenía', () => {
    let s = addItem(addItem(createRangeState('N0'), 'N', 'l'), 'N', 'l');
    s = moveThumb(s, 'nivel', 3); // nivel = valor 2
    const id = itemAt(s, 'nivel').id;
    const r = setItemValue(s, id, -3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(itemAt(r.state, 'nivel').id).toBe(id);
    expect(r.state.items.map((i) => i.value)).toEqual([-Infinity, -3, 0, 1, Infinity]);
    expect(r.state.pos.inferior).toBeLessThan(r.state.pos.nivel);
    expect(r.state.pos.superior).toBeGreaterThan(r.state.pos.nivel);
  });

  it('rechaza valores duplicados y no deja cambiar la base', () => {
    const s = addItem(createRangeState('N0'), 'N', 'l');
    const other = editableItems(s)[0];
    expect(setItemValue(s, other.id, 0)).toEqual({ ok: false, reason: 'duplicate' });
    expect(setItemValue(s, 'base', 5)).toEqual({ ok: false, reason: 'base' });
    expect(setItemValue(s, other.id, NaN)).toEqual({ ok: false, reason: 'invalid' });
  });

  it('la base y los extremos no se borran; la base sí se renombra', () => {
    let s = createRangeState('N0');
    expect(removeItem(s, 'base')).toBe(s);
    expect(removeItem(s, 'inf+')).toBe(s);
    s = renameItem(s, 'base', '  Planta baja ');
    expect(itemAt(s, 'nivel').name).toBe('Planta baja');
    expect(renameItem(s, 'base', '   ')).toBe(s);
  });

  it('borrar el elemento seleccionado devuelve el central a la base', () => {
    let s = addItem(createRangeState('N0'), 'N', 'l');
    s = moveThumb(s, 'nivel', 2);
    const id = itemAt(s, 'nivel').id;
    s = removeItem(s, id);
    expect(itemAt(s, 'nivel').id).toBe('base');
  });

  it('valores altos arriba en el riel', () => {
    const s = addItem(createRangeState('N0'), 'N', 'l');
    expect(indexFromTrackFraction(s, 0)).toBe(s.items.length - 1);
    expect(indexFromTrackFraction(s, 1)).toBe(0);
    expect(trackFractionOf(s, s.items.length - 1)).toBe(0);
  });
});

describe('BPC', () => {
  const base = { tool: null, selection: null, viewLabel: 'Arquitectura', scaleDenominator: '50', zoomPercent: 99.6 };

  it('prioridad herramienta > selección > lienzo', () => {
    const tool = { categoryId: 'a', toolId: 'muro', label: 'Muro', categoryLabel: 'Arq', props: {} };
    const selection = { typeLabel: 'Muro', props: {} };
    expect(resolveBpcContext({ ...base, tool, selection }).kind).toBe('tool');
    expect(resolveBpcContext({ ...base, selection }).kind).toBe('selection');
    expect(resolveBpcContext(base)).toEqual({ kind: 'canvas', viewLabel: 'Arquitectura', scaleLabel: '1:50', zoomLabel: '100%' });
    expect(resolveBpcContext({ ...base, scaleDenominator: ' ' })).toMatchObject({ scaleLabel: '1:—' });
  });
});

describe('workspaceStore', () => {
  it('solo un panel abierto a la vez', () => {
    const st = createWorkspaceStore();
    st.getState().openPanel('cornerTools');
    st.getState().pressFabMain();
    expect(st.getState().currentPanel).toBe('fabCreate');
    st.getState().openPanel('range:levels');
    expect(st.getState().currentPanel).toBe('range:levels');
    expect(st.getState().fab.level).toBe('closed');
  });

  it('la ventana de configuración convive con su panel dueño y se cierra con otro', () => {
    const st = createWorkspaceStore();
    st.getState().openPanel('range:levels');
    st.getState().openWindow({ id: 'levelsCfg', owner: 'range:levels' });
    expect(st.getState().currentPanel).toBe('range:levels');
    expect(st.getState().currentWindow?.id).toBe('levelsCfg');
    st.getState().openPanel('fabView');
    expect(st.getState().currentWindow).toBeNull();
  });

  it('una ventana sin dueño cierra el panel abierto', () => {
    const st = createWorkspaceStore();
    st.getState().openPanel('fabView');
    st.getState().toggleWindow({ id: 'filters' });
    expect(st.getState().currentPanel).toBeNull();
    st.getState().toggleWindow({ id: 'filters' });
    expect(st.getState().currentWindow).toBeNull();
  });

  it('activar una herramienta cierra el FAB y copia sus props', () => {
    const st = createWorkspaceStore();
    st.getState().pressFabMain();
    st.getState().pickFabCategory('arquitectonico');
    const r = st.getState().activateTool('arquitectonico', 'muro');
    expect(r.ok).toBe(true);
    expect(st.getState().fab.level).toBe('closed');
    expect(st.getState().currentPanel).toBeNull();
    st.getState().setToolProp('thickness', 20);
    expect(st.getState().activeTool?.props.thickness).toBe(20);
    expect(CATEGORIES_PLAN[2].tools[0].props?.thickness).toBe(15);
  });

  it('una herramienta deshabilitada no se activa', () => {
    const st = createWorkspaceStore();
    expect(st.getState().activateTool('acotado', 'cota')).toEqual({ ok: false, reason: 'disabled' });
    expect(st.getState().activeTool).toBeNull();
  });

  it('en alzado se usan las herramientas de alzado', () => {
    const st = createWorkspaceStore();
    st.getState().setMode('elevation');
    expect(st.getState().activateTool('arquitectonico', 'vano').ok).toBe(true);
    expect(st.getState().activateTool('arquitectonico', 'muro').ok).toBe(false);
  });

  it('tocar el lienzo cierra todo y suelta la herramienta', () => {
    const st = createWorkspaceStore();
    st.getState().activateTool('arquitectonico', 'muro');
    st.getState().openPanel('cornerTools');
    st.getState().resetToCanvas();
    expect(st.getState().activeTool).toBeNull();
    expect(st.getState().currentPanel).toBeNull();
  });

  it('un deslizador bloqueado (S/N/I apagado) no se mueve', () => {
    const st = createWorkspaceStore();
    st.getState().addRangeItem('levels');
    st.getState().moveRangeThumb('levels', 'superior', 2);
    expect(st.getState().levels.pos.superior).toBe(3);
    st.getState().toggleRangeSlot('levels', 'superior');
    st.getState().moveRangeThumb('levels', 'superior', 2);
    expect(st.getState().levels.pos.superior).toBe(2);
  });

  it('la escala solo acepta dígitos', () => {
    const st = createWorkspaceStore();
    st.getState().setScaleDenominator('1:1a00');
    expect(st.getState().scale.denominator).toBe('1100');
  });
});
