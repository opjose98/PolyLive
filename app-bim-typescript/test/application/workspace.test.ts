// Lógica del espacio de trabajo portada de polylive-mockup (equivalente a
// los smoke tests del mockup, sin DOM).

import * as path from 'path';
import {
  CATEGORIES_ELEVATION,
  CATEGORIES_PLAN,
  CORNER_TOOLS,
  PROPS,
  CANVAS_THEMES,
  CATEGORIES_PROGRESS,
  CATEGORIES_REVIEW,
  CATEGORIES_TOPOGRAPHY,
  WORK_MODES,
  categoriesFor,
  filtersFor,
  modeBlock,
  isToolEnabled,
  toolIconOf,
} from '../../src/application/workspace/catalog';
import { FAB_CLOSED, fabMainIcon, pickFabCategory, pressFabMain } from '../../src/application/workspace/fabMachine';
import { valueFromDrag, nudgeProp } from '../../src/application/workspace/propDrag';
import {
  createRangeState,
  indexFromTrackFraction,
  itemAt,
  moveThumb,
  trackFractionOf,
  withItems,
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
      ...[...CATEGORIES_PLAN, ...CATEGORIES_ELEVATION, ...CATEGORIES_TOPOGRAPHY, ...CATEGORIES_PROGRESS, ...CATEGORIES_REVIEW].flatMap(
        (c) => [c.icon, ...c.tools.map((t) => t.icon)],
      ),
      ...[...WORK_MODES, ...CANVAS_THEMES].map((v) => v.icon!),
      ...CORNER_TOOLS.flatMap((r) => [r.icon, ...r.items.map((i) => ('icon' in i ? i.icon : 'ruler'))]),
    ];
    expect(icons.filter((i) => !(i in glyphs))).toEqual([]);
  });

  it('todas las herramientas de planta y alzado están habilitadas (F6b completo)', () => {
    const disabled = [...CATEGORIES_PLAN, ...CATEGORIES_ELEVATION].flatMap((c) => c.tools).filter((t) => !isToolEnabled(t));
    expect(disabled.map((t) => t.id)).toEqual([]);
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

  it('los modos van en el orden acordado', () => {
    expect(WORK_MODES.map((m) => m.id)).toEqual(['levantamiento', 'topografia', 'avance', 'revision']);
  });

  it('Topografía solo en planta; Avance solo con objetos', () => {
    expect(modeBlock('topografia', { view: 'elevation', hasObjects: true })).toBe('planOnly');
    expect(modeBlock('avance', { view: 'plan', hasObjects: false })).toBe('needsObjects');
    expect(modeBlock('avance', { view: 'elevation', hasObjects: true })).toBeNull();
    expect(modeBlock('revision', { view: 'plan', hasObjects: false })).toBeNull();
  });

  it('el catálogo del FAB y los filtros dependen del modo', () => {
    expect(categoriesFor('levantamiento', 'plan')).toBe(CATEGORIES_PLAN);
    expect(categoriesFor('levantamiento', 'elevation')).toBe(CATEGORIES_ELEVATION);
    expect(categoriesFor('avance', 'elevation')).toBe(CATEGORIES_PROGRESS);
    expect(filtersFor('topografia', 'plan').map((f) => f.id)).toContain('mojones');
    // M2/M2b: Topografía completa; M3: Avance; M4: Revisión.
    const enabled = [...CATEGORIES_TOPOGRAPHY, ...CATEGORIES_PROGRESS, ...CATEGORIES_REVIEW]
      .flatMap((c) => c.tools)
      .filter(isToolEnabled)
      .map((t) => t.id);
    expect(enabled).toEqual(['mojon', 'punto-gps', 'coordenada', 'inverso', 'area', 'replanteo', 'pincel', 'borrador', 'relleno', 'rectangulo-avance', 'foto-avance', 'trazo', 'flecha', 'rectangulo-rev', 'texto-rev', 'nube']);
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

  it('cerrado con una herramienta activa muestra su ícono hasta soltarla', () => {
    const icon = toolIconOf(CATEGORIES_PLAN, { categoryId: 'arquitectonico', toolId: 'muro' });
    expect(icon).toBe('wall');
    expect(fabMainIcon(FAB_CLOSED, icon)).toBe('wall');
    expect(fabMainIcon(FAB_CLOSED, null)).toBe('plus');
    // Abierto vuelve a ser navegación.
    expect(fabMainIcon(pressFabMain(FAB_CLOSED), icon)).toBe('minus');
    expect(toolIconOf(CATEGORIES_PLAN, null)).toBeNull();
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

  // Los elementos llegan siempre de MarkerStore (que valida cotas únicas y
  // protege la base); el selector solo los ordena y conserva la selección.
  const fromDb = (...values: number[]) =>
    withItems(
      createRangeState('N0'),
      values.map((v) => ({ id: v === 0 ? 'base' : `L${v}`, name: `N${v}`, value: v, base: v === 0 })),
    );

  it('inferior < nivel < superior y el central nunca toca ±∞', () => {
    let s = fromDb(0, 1, 2); // −∞,0,1,2,+∞
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

  it('una cota editada en la base de datos reordena y conserva lo que cada deslizador tenía', () => {
    let s = moveThumb(fromDb(0, 1, 2), 'nivel', 3); // nivel = L2
    s = withItems(s, [
      { id: 'L2', name: 'N2', value: -3, base: false },
      { id: 'base', name: 'N0', value: 0, base: true },
      { id: 'L1', name: 'N1', value: 1, base: false },
    ]);
    expect(itemAt(s, 'nivel').id).toBe('L2');
    expect(s.items.map((i) => i.value)).toEqual([-Infinity, -3, 0, 1, Infinity]);
    expect(s.pos.inferior).toBeLessThan(s.pos.nivel);
    expect(s.pos.superior).toBeGreaterThan(s.pos.nivel);
  });

  it('si se borra el nivel seleccionado, el central vuelve a la base', () => {
    let s = moveThumb(fromDb(0, 1), 'nivel', 2);
    expect(itemAt(s, 'nivel').id).toBe('L1');
    s = withItems(s, [{ id: 'base', name: 'N0', value: 0, base: true }]);
    expect(itemAt(s, 'nivel').id).toBe('base');
  });

  it('withItems carga los elementos persistidos y conserva la selección por id', () => {
    let s = createRangeState('Nivel 0');
    s = withItems(s, [
      { id: 'p:level:base', name: 'Planta baja', value: 0, base: true },
      { id: 'L1', name: 'Piso 1', value: 3.2, base: false },
    ]);
    expect(itemAt(s, 'nivel').id).toBe('p:level:base'); // la base demo pasa a la real
    s = moveThumb(s, 'nivel', 2);
    s = withItems(s, [
      { id: 'L-1', name: 'Sótano', value: -3, base: false },
      { id: 'p:level:base', name: 'Planta baja', value: 0, base: true },
      { id: 'L1', name: 'Piso 1', value: 3.2, base: false },
    ]);
    expect(itemAt(s, 'nivel').id).toBe('L1');
    expect(s.pos.inferior).toBeLessThan(s.pos.nivel);
    expect(s.pos.superior).toBeGreaterThan(s.pos.nivel);
  });

  it('valores altos arriba en el riel', () => {
    const s = fromDb(0, 1);
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

  it('una herramienta con formas de creación abre el nivel 3 y la forma elegida queda activa', () => {
    const st = createWorkspaceStore();
    st.getState().pressFabMain();
    st.getState().pickFabCategory('arquitectonico');
    const r = st.getState().pickFabTool('arquitectonico', 'muro');
    expect(r).toEqual({ ok: true, pending: 'methods' });
    expect(st.getState().fab).toEqual({ level: 'methods', categoryId: 'arquitectonico', toolId: 'muro' });
    expect(st.getState().activeTool).toBeNull();

    st.getState().pressFabMain(); // ← vuelve a las herramientas
    expect(st.getState().fab).toEqual({ level: 'tools', categoryId: 'arquitectonico' });

    st.getState().pickFabTool('arquitectonico', 'muro');
    st.getState().activateTool('arquitectonico', 'muro', 'points');
    expect(st.getState().activeTool).toMatchObject({ toolId: 'muro', methodId: 'points', methodLabel: 'Punto a punto' });
    expect(st.getState().fab.level).toBe('closed');
  });

  it('una herramienta sin formas se activa directo desde el FAB', () => {
    const st = createWorkspaceStore();
    st.getState().pressFabMain();
    st.getState().pickFabCategory('arquitectonico');
    const r = st.getState().pickFabTool('arquitectonico', 'puerta');
    expect(r.ok).toBe(true);
    expect(st.getState().activeTool?.toolId).toBe('puerta');
    expect(st.getState().activeTool?.methodId).toBeUndefined();
  });

  it('una herramienta inexistente no se activa', () => {
    const st = createWorkspaceStore();
    expect(st.getState().activateTool('acotado', 'no-existe').ok).toBe(false);
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
    st.getState().setRangeItems('levels', [
      { id: 'n0', name: 'Nivel 0', value: 0, base: true },
      { id: 'n1', name: 'Nivel 1', value: 3, base: false },
    ]);
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

describe('modos en el store', () => {
  it('arranca en Levantamiento; cambiar de modo suelta la herramienta', () => {
    const st = createWorkspaceStore();
    expect(st.getState().workMode).toBe('levantamiento');
    st.getState().activateTool('arquitectonico', 'muro');
    expect(st.getState().activeTool).not.toBeNull();
    st.getState().setWorkMode('revision');
    expect(st.getState().activeTool).toBeNull();
    // En Revisión el FAB + ofrece las marcas (M4).
    expect(st.getState().activateTool('marcas', 'trazo')).toMatchObject({ ok: true, tool: { toolId: 'trazo' } });
  });

  it('pasar a alzado desde Topografía vuelve a Levantamiento', () => {
    const st = createWorkspaceStore();
    st.getState().setWorkMode('topografia');
    st.getState().setMode('elevation');
    expect(st.getState().workMode).toBe('levantamiento');
  });
});
