/* =====================================================================
   config.js — Catálogos declarativos y estado inicial
   ---------------------------------------------------------------------
   Todo lo que se muestra en un menú vive aquí como DATOS. Los
   componentes solo leen estos catálogos y los pintan: para agregar una
   categoría, vista, snap o propiedad no hace falta tocar componentes.
   Depende de: core.js (namespace PL).
   ===================================================================== */
(function (PL) {
  'use strict';

  /* Propiedades editables por arrastre en la BPC.
     paso: incremento por cada ~6 px de desplazamiento horizontal. */
  const PROPS = {
    espesor: { label: 'Espesor', unidad: 'cm', min: 5,  max: 60,  paso: 1 },
    lado:    { label: 'Lado',    unidad: 'cm', min: 15, max: 100, paso: 5 },
    peralte: { label: 'Peralte', unidad: 'cm', min: 20, max: 120, paso: 5 },
    tamano:  { label: 'Tamaño',  unidad: 'pt', min: 6,  max: 48,  paso: 1 }
  };

  /* FAB de creación: nivel 1 = categorías, nivel 2 = herramientas.
     props: valores por defecto que la herramienta expone en la BPC.
     Nivel 3 (formas de creación por herramienta): PENDIENTE de definir. */
  const CATEGORIAS = [
    { id: 'acotado', label: 'Acotado', icon: '📏', hijos: [
      { id: 'cota', label: 'Cota', icon: '📐' },
      { id: 'texto', label: 'Texto', icon: '🔤', props: { tamano: 12 } },
      { id: 'etiqueta', label: 'Etiqueta', icon: '🏷' }
    ]},
    { id: 'dibujo', label: 'Dibujo', icon: '✏️', hijos: [
      { id: 'coordenada', label: 'Coordenada', icon: '📍' },
      { id: 'linea', label: 'Línea', icon: '／' },
      { id: 'poligono', label: 'Polígono', icon: '⬠' }
    ]},
    { id: 'arquitectonico', label: 'Arquitectónico', icon: '🏛', hijos: [
      { id: 'muro', label: 'Muro', icon: '▭', props: { espesor: 15 } },
      { id: 'columna', label: 'Columna', icon: '▮', props: { lado: 30 } },
      { id: 'suelo', label: 'Suelo', icon: '▦', props: { espesor: 10 } }
    ]},
    { id: 'estructural', label: 'Estructural', icon: '🔩', hijos: [
      { id: 'columna-e', label: 'Columna', icon: '▮', props: { lado: 30 } },
      { id: 'viga', label: 'Viga', icon: '▬', props: { peralte: 40 } }
    ]},
    { id: 'auditoria', label: 'Auditoría', icon: '📋', hijos: [
      { id: 'foto', label: 'Foto', icon: '📷' }
    ]}
  ];

  /* FAB de vista (radio: una sola activa). */
  const VISTAS = [
    { id: 'estructural', label: 'Estructural', icon: '🔩' },
    { id: 'arquitectura', label: 'Arquitectura', icon: '🏗' },
    { id: 'topografia', label: 'Topografía', icon: '⛰' },
    { id: 'coordinacion', label: 'Coordinación', icon: '🧭' }
  ];

  /* Ventanas Filtros y Capas (casillas independientes). */
  const FILTROS = [
    { id: 'muros', label: 'Muros' }, { id: 'columnas', label: 'Columnas' },
    { id: 'cotas', label: 'Cotas' }, { id: 'fotos', label: 'Fotos' }
  ];
  const CAPAS = [
    { id: 'arquitectonico', label: 'Arquitectónico' }, { id: 'estructural', label: 'Estructural' },
    { id: 'topografia', label: 'Topografía' }, { id: 'coordinacion', label: 'Coordinación' }
  ];

  /* Herramientas de lienzo (FAB inferior izquierdo).
     Orden del arreglo = de ABAJO hacia ARRIBA en pantalla.
     Tipos de opción:
       toggle → invierte un booleano del store (path)
       radio  → asigna value a path (una activa por grupo)
       action → ejecuta PL.actions[action]() (sin estado)
       input  → edita un texto del store (path)
     indicator(state) → true pinta el icono de la fila en ámbar. */
  const CORNER_TOOLS = [
    { id: 'escala', icon: '📐', label: 'Escala', items: [
      { type: 'toggle', path: 'escala.acotado', txt: 'Ac', title: 'Acotado' },
      { type: 'toggle', path: 'escala.anotativa', txt: 'An', title: 'Anotativa' },
      { type: 'input', path: 'escala.valor', placeholder: '1:__', title: 'Escala personalizada' }
    ]},
    { id: 'cuadricula', icon: '▦', label: 'Cuadrícula', items: [
      { type: 'toggle', path: 'cuadricula.lineas', txt: '▦', title: 'Cuadrícula de líneas' },
      { type: 'toggle', path: 'cuadricula.puntos', txt: '⋮⋮', title: 'Rejilla de puntos' },
      { type: 'toggle', path: 'cuadricula.rotacion', txt: '↻', title: 'Rotación del lienzo' }
    ]},
    { id: 'tema', icon: '◐', label: 'Tema', items: [
      { type: 'radio', path: 'tema', value: 'claro', txt: '☀', title: 'Claro' },
      { type: 'radio', path: 'tema', value: 'oscuro', txt: '☾', title: 'Oscuro' },
      { type: 'radio', path: 'tema', value: 'contraste', txt: '◧', title: 'Alto contraste' }
    ]},
    { id: 'snap', icon: '⟂', label: 'Snap',
      indicator: function (s) { return Object.keys(s.snap).some(function (k) { return s.snap[k]; }); },
      items: [
        { type: 'toggle', path: 'snap.nodo', txt: '•', title: 'Nodo' },
        { type: 'toggle', path: 'snap.vertice', txt: '◆', title: 'Vértice' },
        { type: 'toggle', path: 'snap.medio', txt: '½', title: 'Punto medio' },
        { type: 'toggle', path: 'snap.angulo', txt: '∠', title: 'Ángulo' }
      ]},
    { id: 'zoom', icon: '🔍', label: 'Zoom', items: [
      { type: 'action', action: 'zoomFit', txt: '⛶', title: 'Encuadre' },
      { type: 'action', action: 'zoomIn', txt: '＋', title: 'Acercar' },
      { type: 'action', action: 'zoomOut', txt: '－', title: 'Alejar' },
      { type: 'action', action: 'zoomSel', txt: '☐', title: 'Zoom a selección' }
    ]}
  ];

  const TEMAS = [
    { id: 'claro', label: 'Claro' }, { id: 'oscuro', label: 'Oscuro' }, { id: 'contraste', label: 'Alto contraste' }
  ];

  /* Datos del archivo (solo lectura en el drawer). */
  const ARCHIVO = {
    proyecto: 'NARG29 · Sede SUMB', archivo: 'SUMB_Recinto03.plv', version: 'v1.3',
    tamano: '4.2 MB', editado: 'Hoy, 10:42 a.m.', objetos: 128
  };

  /* Estado inicial de un selector de rango (Nivel o Fase).
     - items: SIEMPRE ordenados por valor ascendente.
     - Extremos ±∞ fijos (no editables ni borrables).
     - base: valor 0, no se borra ni cambia de valor (sí de nombre).
     - pos: ÍNDICES dentro de items para cada deslizador.
     - activos: qué deslizadores se pueden arrastrar (toggles S/N/I). */
  function rangeState(baseName) {
    return {
      items: [
        { id: 'inf-', name: '−∞', valor: -Infinity, fijo: true },
        { id: 'base', name: baseName, valor: 0, base: true },
        { id: 'inf+', name: '+∞', valor: Infinity, fijo: true }
      ],
      pos: { superior: 2, nivel: 1, inferior: 0 },
      activos: { superior: false, nivel: true, inferior: false },
      seq: 0
    };
  }

  function initialState() {
    return {
      proyecto: { sede: 'SUMB', recinto: 'Recinto 03', responsable: 'Jose' },
      /* Objetos demo del lienzo: 4 muros (índice = orden en index.html). */
      muros: [0, 1, 2, 3].map(function () { return { material: 'Ladrillo', props: { espesor: 15 } }; }),
      seleccion: { tipo: 'Muro', ref: 1 },   // objeto seleccionado ({tipo, ref}) o null
      herramienta: null,        // herramienta activa del FAB de creación o null
      vista: 'arquitectura',
      filtros: { muros: true, columnas: true, cotas: false, fotos: true },
      capas: { arquitectonico: true, estructural: true, topografia: false, coordinacion: false },
      zoom: 100,
      snap: { nodo: true, vertice: false, medio: false, angulo: false },
      tema: 'claro',
      cuadricula: { lineas: true, puntos: false, rotacion: false },
      escala: { acotado: false, anotativa: false, valor: '50' },
      ble: { on: true, dispositivo: 'Leica DISTO', bateria: 82 },
      niveles: rangeState('Nivel 0'),
      fases: rangeState('Fase 0')
    };
  }

  PL.config = {
    PROPS: PROPS, CATEGORIAS: CATEGORIAS, VISTAS: VISTAS, FILTROS: FILTROS, CAPAS: CAPAS,
    CORNER_TOOLS: CORNER_TOOLS, TEMAS: TEMAS, ARCHIVO: ARCHIVO, initialState: initialState
  };
})(window.PL);
