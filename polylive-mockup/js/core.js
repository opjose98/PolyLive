/* =====================================================================
   core.js — Núcleo del mockup
   ---------------------------------------------------------------------
   Expone en window.PL:
     PL.el(tag, attrs, hijos)   Crea nodos DOM de forma declarativa.
     PL.store                   Estado central único + suscripciones por ruta.
     PL.ui                      Gestor de paneles: garantiza "solo un panel abierto".
     PL.FloatWindow(opts)       Fábrica de ventanas flotantes (registradas en PL.ui).
     PL.toast(msg)              Aviso breve no bloqueante.
     PL.gestures                longPress (tap vs mantener) y drag (arrastre).
   No depende de ningún otro archivo. Se carga primero.
   ===================================================================== */
window.PL = window.PL || {};

(function (PL) {
  'use strict';

  /* ------------------------------------------------------------------
     PL.el — creador de elementos
     attrs admite: class, text, html, style{}, dataset{}, on<evento>, y
     cualquier atributo HTML. Valores null/false se ignoran.
     ------------------------------------------------------------------ */
  PL.el = function (tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        const v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'html') n.innerHTML = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(n.style, v);
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
      });
    }
    [].concat(children == null ? [] : children).forEach(function (c) {
      if (c == null || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  };

  /* ------------------------------------------------------------------
     PL.store — estado central
     - Una sola fuente de verdad (ver config.js → initialState).
     - Rutas con puntos: 'snap.nodo', 'niveles.items', 'tema'.
     - subscribe(prefijos, fn): fn(state, ruta) se ejecuta cuando cambia
       una ruta igual, hija o padre de algún prefijo. '*' = todo.
     ------------------------------------------------------------------ */
  PL.store = (function () {
    let state = null;
    const subs = [];

    function getPath(obj, path) {
      return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj);
    }
    function setPath(obj, path, val) {
      const keys = path.split('.');
      const last = keys.pop();
      keys.reduce(function (o, k) { return o[k]; }, obj)[last] = val;
    }
    function matches(prefix, path) {
      return prefix === '*' || path === prefix ||
             path.indexOf(prefix + '.') === 0 || prefix.indexOf(path + '.') === 0;
    }

    return {
      init: function (initial) { state = initial; },
      get: function (path) { return path ? getPath(state, path) : state; },
      /** Asigna un valor y notifica. */
      set: function (path, val) { setPath(state, path, val); this.emit(path); },
      /** Invierte un booleano. */
      toggle: function (path) { this.set(path, !this.get(path)); },
      /** Modifica un objeto/arreglo en sitio y notifica una sola vez. */
      mutate: function (path, fn) { fn(this.get(path)); this.emit(path); },
      subscribe: function (prefixes, fn) { subs.push({ prefixes: [].concat(prefixes), fn: fn }); },
      emit: function (path) {
        subs.forEach(function (s) {
          if (s.prefixes.some(function (p) { return matches(p, path); })) s.fn(state, path);
        });
      }
    };
  })();

  /* ------------------------------------------------------------------
     PL.ui — gestor de paneles
     Cada panel desplegable se registra con { isOpen(), close() }.
     Regla global: al abrir un panel se cierran todos los demás.
     closeAll(excepciones) acepta una clave o un arreglo de claves que
     deben permanecer abiertas (p. ej. el selector de nivel mientras su
     ventana de configuración está abierta).
     Claves usadas: 'fc' 'fv' 'ct' 'rs:niveles' 'rs:fases' 'cd' 'fw:<id>'
     ------------------------------------------------------------------ */
  PL.ui = (function () {
    const panels = {};
    return {
      register: function (key, api) { panels[key] = api; },
      closeAll: function (except) {
        const keep = [].concat(except || []);
        Object.keys(panels).forEach(function (k) {
          if (keep.indexOf(k) === -1 && panels[k].isOpen()) panels[k].close();
        });
      },
      isOpen: function (key) { return !!(panels[key] && panels[key].isOpen()); },
      keys: function () { return Object.keys(panels); }
    };
  })();

  /* ------------------------------------------------------------------
     PL.FloatWindow — ventana flotante con cabecera y botón ✕
     opts: { id, title, parent, style, keep[], onOpen(), onClose() }
     keep: paneles que NO se cierran al abrir esta ventana.
     Devuelve { root, body, open, close, toggle, isOpen }.
     ------------------------------------------------------------------ */
  PL.FloatWindow = function (opts) {
    const key = 'fw:' + opts.id;
    const body = PL.el('div', { class: 'fw-body' });
    const root = PL.el('div', { class: 'fw', id: 'fw-' + opts.id, hidden: true, style: opts.style, role: 'dialog', 'aria-label': opts.title }, [
      PL.el('div', { class: 'fw-header' }, [
        PL.el('span', { text: opts.title }),
        PL.el('button', { class: 'fw-close', 'aria-label': 'Cerrar', text: '✕', onclick: function () { api.close(); } })
      ]),
      body
    ]);
    (opts.parent || document.body).appendChild(root);

    const api = {
      root: root, body: body,
      isOpen: function () { return !root.hidden; },
      open: function () {
        PL.ui.closeAll([key].concat(opts.keep || []));
        root.hidden = false;
        if (opts.onOpen) opts.onOpen();
      },
      close: function () {
        if (root.hidden) return;
        root.hidden = true;
        if (opts.onClose) opts.onClose();
      },
      toggle: function () { api.isOpen() ? api.close() : api.open(); }
    };
    PL.ui.register(key, api);
    return api;
  };

  /* ------------------------------------------------------------------
     PL.toast — aviso breve (1.8 s). Se monta en el teléfono.
     ------------------------------------------------------------------ */
  let toastEl = null, toastTimer = null;
  PL.toast = function (msg) {
    if (!toastEl) {
      toastEl = PL.el('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
      document.getElementById('phone').appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('is-visible'); }, 1800);
  };

  /* ------------------------------------------------------------------
     PL.gestures
     longPress(el, {ms, onTap, onLong}): distingue toque corto de
       mantener presionado. Si se dispara onLong, el toque no cuenta.
     drag(el, {onStart(e)→bool, onMove(e), onEnd(e)}): arrastre con
       captura de puntero. onStart puede devolver false para cancelar.
     ------------------------------------------------------------------ */
  PL.gestures = {
    longPress: function (el, o) {
      let timer = null, fired = false;
      const ms = o.ms || 500;
      el.addEventListener('pointerdown', function () {
        fired = false;
        timer = setTimeout(function () { fired = true; timer = null; o.onLong(); }, ms);
      });
      el.addEventListener('pointerup', function () {
        if (timer) { clearTimeout(timer); timer = null; if (!fired) o.onTap(); }
      });
      ['pointerleave', 'pointercancel'].forEach(function (ev) {
        el.addEventListener(ev, function () { clearTimeout(timer); timer = null; });
      });
      // Activación por teclado (Enter/Espacio): equivale a toque corto.
      el.addEventListener('click', function (e) { if (e.detail === 0) o.onTap(); });
    },
    drag: function (el, o) {
      let active = false;
      el.addEventListener('pointerdown', function (e) {
        if (o.onStart && o.onStart(e) === false) return;
        active = true;
        if (el.setPointerCapture && e.pointerId != null) el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', function (e) { if (active && o.onMove) o.onMove(e); });
      ['pointerup', 'pointercancel'].forEach(function (ev) {
        el.addEventListener(ev, function (e) { if (active) { active = false; if (o.onEnd) o.onEnd(e); } });
      });
    }
  };
})(window.PL);
