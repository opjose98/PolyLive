/* =====================================================================
   components/bpc-alzado.js — BPC para la vista de alzado
   ---------------------------------------------------------------------
   Misma barra flotante, pero el contexto vacío muestra info del muro
   activo en vez de "Lienzo". La herramienta y la selección funcionan
   igual que en planta.
   Depende de: core.js, config.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};
  var PX_POR_PASO = 6;

  PL.components.bpc = {
    mount: function () {
      var store = PL.store, bar = document.getElementById('bpc');
      var arrastrando = false;

      function dragProp(basePath, key, valor) {
        var def = PL.config.PROPS[key];
        var val = PL.el('b', { class: 'v', text: valor + ' ' + def.unidad });
        var pill = PL.el('div', { class: 'bpc-drag', role: 'slider', 'aria-label': def.label,
          'aria-valuenow': valor, 'aria-valuemin': def.min, 'aria-valuemax': def.max, tabindex: 0 },
          [PL.el('span', { class: 'h', text: '↔' }), def.label + ' ', val]);
        var x0 = 0, v0 = 0;
        PL.gestures.drag(pill, {
          onStart: function (e) { x0 = e.clientX || 0; v0 = store.get(basePath + '.' + key); arrastrando = true; pill.classList.add('is-dragging'); },
          onMove: function (e) {
            var pasos = Math.round(((e.clientX || 0) - x0) / PX_POR_PASO);
            var nuevo = Math.max(def.min, Math.min(def.max, v0 + pasos * def.paso));
            if (nuevo !== store.get(basePath + '.' + key)) {
              store.set(basePath + '.' + key, nuevo);
              val.textContent = nuevo + ' ' + def.unidad;
              pill.setAttribute('aria-valuenow', nuevo);
            }
          },
          onEnd: function () { arrastrando = false; pill.classList.remove('is-dragging'); store.emit(basePath); }
        });
        pill.addEventListener('keydown', function (e) {
          var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          var cur = store.get(basePath + '.' + key);
          store.set(basePath + '.' + key, Math.max(def.min, Math.min(def.max, cur + d * def.paso)));
        });
        return pill;
      }

      function propsPills(basePath, props) {
        return Object.keys(props || {}).map(function (k) { return dragProp(basePath, k, props[k]); });
      }

      function render(s) {
        if (arrastrando) return;
        bar.innerHTML = '';
        if (s.herramienta) {
          var h = s.herramienta;
          bar.append(PL.el('span', {}, ['Herramienta: ', PL.el('b', { text: h.label })]),
                     PL.el('span', { text: h.categoria }));
          var pills = propsPills('herramienta.props', h.props);
          if (pills.length) pills.forEach(function (p) { bar.append(p); });
          else bar.append(PL.el('span', { text: 'Opciones pendientes' }));
        } else if (s.seleccion) {
          bar.append(PL.el('span', { text: s.seleccion.tipo + ' seleccionado' }));
          if (s.seleccion.props) propsPills('seleccion.props', s.seleccion.props).forEach(function (p) { bar.append(p); });
        } else {
          /* Contexto vacío: info del muro activo */
          var m = s.muroActivo;
          bar.append(PL.el('b', { text: 'Alzado' }),
                     PL.el('span', {}, ['Muro: ', PL.el('b', { text: m.nombre })]),
                     PL.el('span', { text: m.material + ' · Lado ' + s.lado }),
                     PL.el('span', {}, ['Escala ', PL.el('b', { text: '1:' + (s.escala.valor || '—') })]));
        }
      }
      store.subscribe(['herramienta', 'seleccion', 'muroActivo', 'escala', 'lado'], render);
      render(store.get());
    }
  };
})(window.PL);
