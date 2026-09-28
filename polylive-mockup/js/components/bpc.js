/* =====================================================================
   components/bpc.js — BPC · Barra de Propiedades Contextual
   ---------------------------------------------------------------------
   Barra flotante fija (arriba del lienzo, esquinas redondeadas).
   Su contenido depende del CONTEXTO, con esta prioridad:
     1. Herramienta activa  → "Herramienta: Muro · Arquitectónico · ↔ Espesor"
     2. Objeto seleccionado → "Muro seleccionado · Tipo: Ladrillo · ↔ Espesor"
     3. Nada               → "Lienzo · Vista · Escala · Zoom"
   Propiedades numéricas: se editan manteniendo el dedo sobre la
   píldora ↔ y deslizando a izquierda/derecha (sin abrir paneles).
   Pendiente: definir contexto de cada herramienta de nivel 3.
   Depende de: core.js, config.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};
  const PX_POR_PASO = 6;
  let arrastrando = false;   // mientras es true, la BPC no se repinta (conserva el gesto)

  PL.components.bpc = {
    mount: function () {
      const store = PL.store;
      const bar = document.getElementById('bpc');

      /* Píldora arrastrable para una propiedad numérica.
         basePath: ruta del objeto props en el store. */
      function dragProp(basePath, key, valor) {
        const def = PL.config.PROPS[key];
        const val = PL.el('b', { class: 'v', text: valor + ' ' + def.unidad });
        const pill = PL.el('div', { class: 'bpc-drag', role: 'slider', 'aria-label': def.label,
          'aria-valuenow': valor, 'aria-valuemin': def.min, 'aria-valuemax': def.max, tabindex: 0 },
          [PL.el('span', { class: 'h', text: '↔' }), def.label + ' ', val]);
        let x0 = 0, v0 = 0;
        PL.gestures.drag(pill, {
          onStart: function (e) { x0 = e.clientX || 0; v0 = store.get(basePath + '.' + key); arrastrando = true; pill.classList.add('is-dragging'); },
          onMove: function (e) {
            const pasos = Math.round(((e.clientX || 0) - x0) / PX_POR_PASO);
            const nuevo = Math.max(def.min, Math.min(def.max, v0 + pasos * def.paso));
            if (nuevo !== store.get(basePath + '.' + key)) {
              store.set(basePath + '.' + key, nuevo);     // notifica: el lienzo se actualiza en vivo
              val.textContent = nuevo + ' ' + def.unidad; // la píldora se repinta localmente
              pill.setAttribute('aria-valuenow', nuevo);
            }
          },
          onEnd: function () { arrastrando = false; pill.classList.remove('is-dragging'); store.emit(basePath); }
        });
        // Accesibilidad: flechas del teclado
        pill.addEventListener('keydown', function (e) {
          const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          const cur = store.get(basePath + '.' + key);
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
          const h = s.herramienta;
          bar.append(PL.el('span', {}, ['Herramienta: ', PL.el('b', { text: h.label })]),
                     PL.el('span', { text: h.categoria }));
          const pills = propsPills('herramienta.props', h.props);
          if (pills.length) pills.forEach(function (p) { bar.append(p); });
          else bar.append(PL.el('span', { text: 'Opciones pendientes' }));
        } else if (s.seleccion) {
          const o = s.seleccion, obj = s.muros[o.ref];   // hoy solo hay muros demo
          bar.append(PL.el('span', { text: o.tipo + ' seleccionado' }),
                     PL.el('span', {}, ['Tipo: ', PL.el('b', { text: obj.material })]));
          propsPills('muros.' + o.ref + '.props', obj.props).forEach(function (p) { bar.append(p); });
        } else {
          const vista = PL.config.VISTAS.filter(function (v) { return v.id === s.vista; })[0];
          bar.append(PL.el('b', { text: 'Lienzo' }),
                     PL.el('span', { text: vista.label }),
                     PL.el('span', {}, ['Escala ', PL.el('b', { text: '1:' + (s.escala.valor || '—') })]),
                     PL.el('span', {}, ['Zoom ', PL.el('b', { text: s.zoom + '%' })]));
        }
      }
      store.subscribe(['herramienta', 'seleccion', 'muros', 'vista', 'escala', 'zoom'], render);
      render(store.get());
    }
  };
})(window.PL);
