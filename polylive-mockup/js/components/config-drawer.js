/* =====================================================================
   components/config-drawer.js — Drawer de configuración (botón ⋮)
   ---------------------------------------------------------------------
   Panel lateral derecho (85% del ancho) con secciones en acordeón.
   Es el ESPEJO editable de todo el estado del lienzo: cada control
   lee y escribe el mismo store que usan los FABs, así que ambos
   lugares siempre muestran lo mismo.
     Datos del archivo · Información del proyecto · Vista y capas ·
     Zoom · Snap · Tema · Cuadrícula · Escala · Selector de nivel ·
     Selector de fase
   El botón ⋮ de la status bar se convierte en ✕ (círculo ámbar)
   mientras el drawer está abierto; no hay otra ✕ dentro del panel.
   El overlay empieza bajo la status bar: el ✕ sigue visible.
   Las opciones BLE NO están aquí (ventana propia en la status bar).
   Panel registrado en PL.ui con la clave 'cd'.
   Depende de: core.js, config.js, range-selector.js, canvas.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};

  PL.components.configDrawer = {
    mount: function () {
      const store = PL.store, C = PL.config;
      const phone = document.getElementById('phone');
      const btn = document.getElementById('btnConfig');
      const body = PL.el('div', { class: 'cd-body' });
      const overlay = PL.el('div', { class: 'cd-overlay', id: 'cdOverlay', hidden: true }, [
        PL.el('aside', { class: 'cd-drawer', 'aria-label': 'Configuración' }, [
          PL.el('div', { class: 'cd-header', text: 'Configuración' }), body
        ])
      ]);
      phone.appendChild(overlay);
      const renderers = [];

      /* ---------- Constructores de controles ---------------------- */
      function seccion(titulo, hijos, abierta) {
        const sec = PL.el('section', { class: 'cd-section' + (abierta ? ' is-open' : '') });
        const head = PL.el('button', { class: 'cd-head', 'aria-expanded': String(!!abierta),
          onclick: function () { const o = sec.classList.toggle('is-open'); head.setAttribute('aria-expanded', String(o)); } },
          [PL.el('span', { text: titulo }), PL.el('span', { class: 'chev', text: '›' })]);
        sec.append(head, PL.el('div', { class: 'cd-content' }, hijos));
        body.appendChild(sec);
        return sec;
      }
      function fila(label, control) { return PL.el('div', { class: 'cd-row' }, [PL.el('span', { text: label }), control]); }
      function texto(v) { return PL.el('span', { text: String(v) }); }
      function tags(lista) { return PL.el('div', { class: 'cd-tags' }, lista); }
      function tagToggle(label, path) {
        const t = PL.el('button', { class: 'tag', text: label, onclick: function () { store.toggle(path); } });
        renderers.push(function () { t.classList.toggle('is-on', !!store.get(path)); });
        return t;
      }
      function tagRadio(label, path, value) {
        const t = PL.el('button', { class: 'tag', text: label, onclick: function () { store.set(path, value); } });
        renderers.push(function () { t.classList.toggle('is-on', store.get(path) === value); });
        return t;
      }
      function tagAccion(label, accion) { return PL.el('button', { class: 'tag', text: label, onclick: function () { PL.actions[accion](); } }); }
      function inputTexto(path, prefijo) {
        const inp = PL.el('input', { type: 'text', onchange: function () { store.set(path, inp.value.replace(prefijo || '', '').trim()); } });
        renderers.push(function () { if (document.activeElement !== inp) inp.value = (prefijo || '') + (store.get(path) || ''); });
        return inp;
      }
      function valorVivo(fn) { const s = PL.el('b'); renderers.push(function (st) { s.textContent = fn(st); }); return s; }

      /* ---------- Secciones --------------------------------------- */
      const A = C.ARCHIVO;
      seccion('Datos del archivo', [
        fila('Proyecto', texto(A.proyecto)), fila('Archivo', texto(A.archivo)), fila('Versión', texto(A.version)),
        fila('Tamaño', texto(A.tamano)), fila('Última edición', texto(A.editado)), fila('Objetos totales', texto(A.objetos))
      ]);
      seccion('Información del proyecto', [
        fila('Sede', inputTexto('proyecto.sede')),
        fila('Recinto', inputTexto('proyecto.recinto')),
        fila('Responsable', inputTexto('proyecto.responsable'))
      ], true);
      seccion('Vista y capas', [
        fila('Vista', tags(C.VISTAS.map(function (v) { return tagRadio(v.label, 'vista', v.id); }))),
        fila('Filtros', tags(C.FILTROS.map(function (f) { return tagToggle(f.label, 'filtros.' + f.id); }))),
        fila('Capas', tags(C.CAPAS.map(function (c) { return tagToggle(c.label, 'capas.' + c.id); })))
      ]);
      seccion('Zoom', [
        fila('Nivel de zoom', valorVivo(function (s) { return s.zoom + '%'; })),
        fila('Acciones', tags([tagAccion('Encuadre', 'zoomFit'), tagAccion('−', 'zoomOut'), tagAccion('+', 'zoomIn')]))
      ]);
      seccion('Snap', [tags([
        tagToggle('Nodo', 'snap.nodo'), tagToggle('Vértice', 'snap.vertice'),
        tagToggle('Punto medio', 'snap.medio'), tagToggle('Ángulo', 'snap.angulo')])]);
      seccion('Tema del lienzo', [tags(C.TEMAS.map(function (t) { return tagRadio(t.label, 'tema', t.id); }))]);
      seccion('Cuadrícula', [tags([
        tagToggle('Líneas', 'cuadricula.lineas'), tagToggle('Puntos', 'cuadricula.puntos'), tagToggle('Rotación', 'cuadricula.rotacion')])]);
      seccion('Escala', [
        fila('Tipo', tags([tagToggle('Acotado', 'escala.acotado'), tagToggle('Anotativa', 'escala.anotativa')])),
        fila('Escala', inputTexto('escala.valor', '1:'))
      ]);
      const boxNiv = PL.el('div', { class: 'fw-body', style: 'padding:0' });
      const boxFas = PL.el('div', { class: 'fw-body', style: 'padding:0' });
      if (PL.selectors.niveles) { seccion('Selector de nivel', [boxNiv]); PL.selectors.niveles.attachCfg(boxNiv); }
      if (PL.selectors.fases) { seccion('Selector de fase', [boxFas]); PL.selectors.fases.attachCfg(boxFas); }

      function renderAll(s) { renderers.forEach(function (r) { r(s); }); }
      store.subscribe('*', renderAll);
      renderAll(store.get());

      /* ---------- Apertura / cierre ------------------------------- */
      const api = {
        isOpen: function () { return !overlay.hidden; },
        open: function () { PL.ui.closeAll('cd'); overlay.hidden = false; paintBtn(); },
        close: function () { overlay.hidden = true; paintBtn(); }
      };
      function paintBtn() {
        const o = api.isOpen();
        btn.textContent = o ? '✕' : '⋮';
        btn.classList.toggle('is-on', o);
        btn.setAttribute('aria-expanded', String(o));
        btn.setAttribute('aria-label', o ? 'Cerrar configuración' : 'Configuración');
      }
      PL.ui.register('cd', api);
      btn.addEventListener('click', function () { api.isOpen() ? api.close() : api.open(); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) api.close(); }); // tocar fuera cierra
      paintBtn();
    }
  };
})(window.PL);
