/* =====================================================================
   main.js — Arranque
   ---------------------------------------------------------------------
   1. Inicializa el store con el estado inicial (config.js).
   2. Monta los componentes en orden de dependencia:
        canvas (define PL.actions) → statusbar → bpc → selectores de
        rango → FAB vista → herramientas → FAB creación → drawer
        (el drawer va al final: se engancha a los selectores).
   Se carga al final del <body>, cuando todo el HTML ya existe.
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.store.init(PL.config.initialState());
  ['canvas', 'statusbar', 'bpc', 'rangeSelectors', 'fabView', 'cornerTools', 'fabCreate', 'configDrawer']
    .forEach(function (name) { PL.components[name].mount(); });
})(window.PL);
