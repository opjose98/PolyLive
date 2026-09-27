/* =====================================================================
   components/fab-view.js — FAB de vista + Filtros / Capas
   ---------------------------------------------------------------------
   FAB de vista (superior derecha, botón ▦ anclado):
     toque → despliega hacia abajo Estructural · Arquitectura ·
     Topografía · Coordinación. Selección tipo RADIO (store.vista).
   Botones Filtros (▼) y Capas (▤): debajo del FAB; se OCULTAN mientras
     el FAB de vista está desplegado. Cada uno abre su ventana flotante
     con casillas independientes (store.filtros.* / store.capas.*).
   Panel registrado en PL.ui con la clave 'fv'; ventanas 'fw:filtros'
   y 'fw:capas'.
   Depende de: core.js, config.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};

  PL.components.fabView = {
    mount: function () {
      const store = PL.store;
      const canvas = document.getElementById('canvas');

      /* FAB de vista ------------------------------------------------ */
      const minis = PL.el('div', { class: 'fv-minis', hidden: true });
      const main = PL.el('button', { class: 'fv-main', id: 'fvMain', 'aria-label': 'Tipo de vista', text: '▦' });
      canvas.appendChild(PL.el('div', { class: 'fv-wrap' }, [main, minis]));

      const botones = {};
      PL.config.VISTAS.forEach(function (v) {
        botones[v.id] = PL.el('span', { class: 'btn', text: v.icon });
        minis.appendChild(PL.el('button', { class: 'fv-mini', dataset: { id: v.id },
          onclick: function () { store.set('vista', v.id); } },
          [PL.el('span', { class: 'tip', text: v.label }), botones[v.id]]));
      });
      function renderVista(s) {
        Object.keys(botones).forEach(function (id) { botones[id].classList.toggle('is-on', s.vista === id); });
      }
      store.subscribe('vista', renderVista);
      renderVista(store.get());

      /* Botones Filtros / Capas + ventanas -------------------------- */
      const extra = PL.el('div', { class: 'fv-extra' });
      canvas.appendChild(extra);

      function ventanaChecks(id, titulo, icono, catalogo, ruta) {
        const win = PL.FloatWindow({ id: id, title: titulo, parent: canvas,
          style: 'top:64px;right:64px;', onOpen: renderBtn, onClose: renderBtn });
        const btn = PL.el('button', { title: titulo, 'aria-label': titulo, text: icono, onclick: win.toggle });
        extra.appendChild(btn);
        function renderBtn() { btn.classList.toggle('is-on', win.isOpen()); }
        function renderBody(s) {
          win.body.innerHTML = '';
          catalogo.forEach(function (it) {
            win.body.appendChild(PL.el('button', { class: 'fw-row', role: 'checkbox',
              'aria-checked': String(s[ruta][it.id]), onclick: function () { store.toggle(ruta + '.' + it.id); } },
              [PL.el('span', { text: it.label }), PL.el('span', { class: 'check' + (s[ruta][it.id] ? ' is-on' : '') })]));
          });
        }
        store.subscribe(ruta, renderBody);
        renderBody(store.get());
      }
      ventanaChecks('filtros', 'Filtros', '▼', PL.config.FILTROS, 'filtros');
      ventanaChecks('capas', 'Capas', '▤', PL.config.CAPAS, 'capas');

      /* Apertura/cierre del FAB de vista ---------------------------- */
      const api = {
        isOpen: function () { return !minis.hidden; },
        close: function () { minis.hidden = true; extra.hidden = false; main.setAttribute('aria-expanded', 'false'); }
      };
      PL.ui.register('fv', api);
      main.addEventListener('click', function () {
        if (api.isOpen()) { api.close(); return; }
        PL.ui.closeAll('fv');
        minis.hidden = false; extra.hidden = true; main.setAttribute('aria-expanded', 'true');
      });
    }
  };
})(window.PL);
