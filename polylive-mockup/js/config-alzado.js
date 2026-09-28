/* =====================================================================
   config-alzado.js — Catálogos específicos de la vista de Alzado
   ---------------------------------------------------------------------
   Sobreescribe CATEGORIAS y ajusta initialState para el modo alzado.
   Reutiliza VISTAS, FILTROS, CAPAS, CORNER_TOOLS, TEMAS, ARCHIVO,
   PROPS del config.js base.
   Depende de: config.js (ya cargado).
   ===================================================================== */
(function (PL) {
  'use strict';

  /* Categorías del FAB de creación en alzado */
  PL.config.CATEGORIAS_ALZADO = [
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
      { id: 'vano', label: 'Vano', icon: '▯', props: { lado: 80 } },
      { id: 'puerta', label: 'Puerta', icon: '🚪', props: { lado: 90 } }
    ]},
    { id: 'estructural', label: 'Estructural', icon: '🔩', hijos: [
      { id: 'viga', label: 'Viga', icon: '▬', props: { peralte: 40 } },
      { id: 'cercha', label: 'Cercha', icon: '△', props: { peralte: 60 } },
      { id: 'correa', label: 'Correa', icon: '▭', props: { peralte: 20 } }
    ]},
    { id: 'auditoria', label: 'Auditoría', icon: '📋', hijos: [
      { id: 'foto', label: 'Foto', icon: '📷' }
    ]}
  ];

  /* Estado inicial para alzado: sin selector de nivel (los niveles se
     dibujan como líneas de referencia), con selector de fase, y el muro
     que se está detallando. */
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

  PL.config.VISTAS_ALZADO = [
    { id: 'estructural', label: 'Estructural', icon: '🔩' },
    { id: 'arquitectura', label: 'Arquitectura', icon: '🏗' },
    { id: 'coordinacion', label: 'Coordinación', icon: '🧭' }
  ];

  PL.config.initialStateAlzado = function () {
    return {
      proyecto: { sede: 'SUMB', recinto: 'Recinto 03', responsable: 'Jose' },
      /* Muro que se está detallando (viene de la planta, demo). */
      muroActivo: { id: 'M-03', nombre: 'Muro 03', ancho: 450, alto: 320, material: 'Ladrillo', props: { espesor: 15 } },
      lado: 'A',   /* 'A' o 'B': lado del muro que se está viendo */
      minimapa: true,  /* true=expandido, false=colapsado a botón */
      seleccion: null,
      herramienta: null,
      vista: 'arquitectura',
      filtros: { vanos: true, puertas: true, vigas: true, cotas: false, fotos: true },
      capas: { arquitectonico: true, estructural: true, topografia: false, coordinacion: false },
      zoom: 100,
      snap: { nodo: true, vertice: false, medio: false, angulo: false },
      tema: 'claro',
      cuadricula: { lineas: true, puntos: false, rotacion: false },
      escala: { acotado: false, anotativa: false, valor: '50' },
      ble: { on: true, dispositivo: 'Leica DISTO', bateria: 82 },
      /* Niveles como referencia visual (no selector interactivo). */
      nivelesRef: [
        { name: 'Cimentación', cota: -0.6 },
        { name: 'Nivel 0', cota: 0 },
        { name: 'Piso 1', cota: 3.2 }
      ],
      fases: rangeState('Fase 0')
    };
  };

  /* Filtros y capas ajustados para alzado */
  PL.config.FILTROS_ALZADO = [
    { id: 'vanos', label: 'Vanos' }, { id: 'puertas', label: 'Puertas' },
    { id: 'vigas', label: 'Vigas' }, { id: 'cotas', label: 'Cotas' },
    { id: 'fotos', label: 'Fotos' }
  ];
})(window.PL);
