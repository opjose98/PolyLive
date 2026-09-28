/* =====================================================================
   components/corner-tools.js — Herramientas de lienzo (inferior izq.)
   ---------------------------------------------------------------------
   Botón madre 🛠 (anclado, 48px) → despliega hacia ARRIBA 5 filas:
     Zoom · Snap · Tema · Cuadrícula · Escala   (catálogo CORNER_TOOLS)
   Todos los iconos comparten el eje vertical del botón madre.
   Al abrir, el madre muestra "−".
   Cada fila, al tocarla, abre su menú HORIZONTAL hacia la derecha,
   sin textos; solo un menú de fila abierto a la vez.
   Tipos de opción (ver config.js): toggle · radio · action · input.
   Panel registrado en PL.ui con la clave 'ct'.
   Depende de: core.js, config.js, canvas.js (PL.actions)
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};

  PL.components.cornerTools = {
    mount: function () {
      const store = PL.store;
      const canvas = document.getElementById('canvas');
      const rows = PL.el('div', { class: 'ct-rows', hidden: true });
      const main = PL.el('button', { class: 'ct-main', id: 'ctMain', 'aria-label': 'Herramientas de lienzo', text: '🛠' });
      canvas.appendChild(PL.el('div', { class: 'ct-wrap' }, [rows, main]));

      let filaAbierta = null;          // id de la fila con menú visible
      const menus = {}, fabs = {}, renderers = [];

      /* Crea el control de una opción según su tipo */
      function opcion(it) {
        if (it.type === 'input') {
          const inp = PL.el('input', { type: 'text', placeholder: it.placeholder, title: it.title, 'aria-label': it.title,
            onchange: function () { store.set(it.path, inp.value.replace(/^1:/, '').trim()); } });
          renderers.push(function (s) { if (document.activeElement !== inp) inp.value = store.get(it.path) ? '1:' + store.get(it.path) : ''; });
          return inp;
        }
        const b = PL.el('button', { class: 'opt', text: it.txt, title: it.title, 'aria-label': it.title });
        if (it.type === 'toggle') {
          b.addEventListener('click', function () { store.toggle(it.path); });
          renderers.push(function () { b.classList.toggle('is-on', !!store.get(it.path)); b.setAttribute('aria-pressed', String(!!store.get(it.path))); });
        } else if (it.type === 'radio') {
          b.addEventListener('click', function () { store.set(it.path, it.value); });
          renderers.push(function () { b.classList.toggle('is-on', store.get(it.path) === it.value); });
        } else if (it.type === 'action') {
          b.addEventListener('click', function () { PL.actions[it.action](); }); // sin estado encendido
        }
        return b;
      }

      PL.config.CORNER_TOOLS.forEach(function (tool) {
        const menu = PL.el('div', { class: 'ct-menu', hidden: true }, tool.items.map(opcion));
        const fab = PL.el('button', { class: 'ct-fab', title: tool.label, 'aria-label': tool.label, text: tool.icon,
          onclick: function () { filaAbierta = (filaAbierta === tool.id) ? null : tool.id; renderFilas(); } });
        menus[tool.id] = menu; fabs[tool.id] = fab;
        if (tool.indicator) renderers.push(function (s) { fab.classList.toggle('is-on', tool.indicator(s)); });
        rows.appendChild(PL.el('div', { class: 'ct-row', dataset: { id: tool.id } }, [fab, menu]));
      });

      function renderFilas() {
        Object.keys(menus).forEach(function (id) { menus[id].hidden = (id !== filaAbierta); });
      }
      function renderOpciones(s) { renderers.forEach(function (r) { r(s); }); }
      store.subscribe(['escala', 'cuadricula', 'tema', 'snap'], renderOpciones);
      renderOpciones(store.get());

      const api = {
        isOpen: function () { return !rows.hidden; },
        close: function () { rows.hidden = true; filaAbierta = null; renderFilas(); main.textContent = '🛠'; main.setAttribute('aria-expanded', 'false'); }
      };
      PL.ui.register('ct', api);
      main.addEventListener('click', function () {
        if (api.isOpen()) { api.close(); return; }
        PL.ui.closeAll('ct');
        rows.hidden = false; main.textContent = '−'; main.setAttribute('aria-expanded', 'true');
      });
    }
  };
})(window.PL);
