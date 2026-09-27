/* =====================================================================
   main-alzado.js — Arranque de la vista de alzado
   ---------------------------------------------------------------------
   Igual que main.js pero usa:
   - initialStateAlzado() en vez de initialState()
   - CATEGORIAS_ALZADO en vez de CATEGORIAS
   - FILTROS_ALZADO en vez de FILTROS
   - canvas-alzado y bpc-alzado en vez de canvas y bpc
   - Sin selector de nivel (solo fase)
   - Chip muestra el muro activo en vez del nivel
   ===================================================================== */
(function (PL) {
  'use strict';

  /* Sustituir catálogos para que los componentes reutilizados lean los correctos */
  PL.config.CATEGORIAS = PL.config.CATEGORIAS_ALZADO;
  PL.config.VISTAS = PL.config.VISTAS_ALZADO;
  PL.config.FILTROS = PL.config.FILTROS_ALZADO;

  PL.store.init(PL.config.initialStateAlzado());

  /* canvas-alzado.js ya define PL.components.canvas (sobreescribe). */
  /* bpc-alzado.js ya define PL.components.bpc (sobreescribe). */

  /* Chip: muestra el muro activo en vez del nivel */
  var chip = document.getElementById('levelChip');
  function renderChip(s) {
    chip.innerHTML = '';
    chip.append(PL.el('span', { text: 'Muro:' }), PL.el('b', { text: s.muroActivo.nombre }));
  }
  PL.store.subscribe('muroActivo', renderChip);
  renderChip(PL.store.get());



  /* Montar componentes reutilizados (sin rangeSelectors de nivel) */
  PL.components.canvas.mount();
  PL.components.minimap.mount();
  PL.components.statusbar.mount();

  /* Sobreescribir el título de la status bar para incluir el muro.
     Se suscribe DESPUÉS de montar statusbar, así gana sobre renderTitle. */
  PL.store.subscribe(['proyecto', 'muroActivo'], function (s) {
    var t = document.getElementById('sbTitle');
    t.innerHTML = '';
    t.append(PL.el('b', { text: s.proyecto.sede }), ' · ' + s.proyecto.recinto + ' · ' + s.muroActivo.nombre);
  });
  PL.store.emit('proyecto');
  PL.components.bpc.mount();

  /* Solo selector de fase (sin nivel) */
  PL.RangeSelector({
    key: 'fases', titulo: 'Fases', item: 'Fase', unidad: '', valorLabel: 'Orden',
    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>'
  });

  PL.components.fabView.mount();
  PL.components.cornerTools.mount();
  PL.components.fabCreate.mount();
  PL.components.alzadoActions.mount();
  PL.components.configDrawer.mount();
})(window.PL);
