/* =====================================================================
   components/range-selector.js — Selectores de rango: NIVEL y FASE
   ---------------------------------------------------------------------
   Una sola FÁBRICA (PL.RangeSelector) genera ambos selectores; solo
   cambian los datos (clave del store, textos, unidad, icono).
     • Nivel → espacial (cota en metros).  Clave store: 'niveles'
     • Fase  → temporal (orden, sin unidad). Clave store: 'fases'

   Anatomía
     FAB (34px) dentro del grupo lateral izquierdo #rsGroup (centrado).
     Al abrir cualquiera, el GRUPO COMPLETO se oculta y aparece el panel:
       [S][N][I]   toggles independientes: habilitan el arrastre de su
                   deslizador (varios a la vez). N activo por defecto.
         ∞         extremo superior (+∞)
         │ ● S     deslizador superior (gris) — siempre por ENCIMA de N
         │ ● N     deslizador central (siempre ámbar)
         │ ● I     deslizador inferior (gris) — siempre por DEBAJO de N
         ∞         extremo inferior (−∞)
       [⚙]         abre la ventana de configuración (el panel sigue visible)
       [←]         (ámbar) cierra el panel y vuelve a mostrar los FABs
     Orientación: valores altos ARRIBA, negativos ABAJO.
     Tooltip de cada deslizador: "Nombre (+valor unidad)".

   Configuración (ventana flotante + sección del drawer, sincronizadas)
     • Siempre existen −∞, base (valor 0) y +∞. Por defecto solo base.
     • Agregar → valor único (máximo + 1); se reordena de mayor a menor.
     • Editar valor → se reordena; si el valor ya existe, se avisa y
       no se aplica. La base no cambia de valor ni se elimina.

   Paneles registrados en PL.ui: 'rs:niveles', 'rs:fases',
   ventanas 'fw:nivelescfg', 'fw:fasescfg'.
   Depende de: core.js, config.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};
  PL.selectors = PL.selectors || {};

  const SLOTS = ['superior', 'nivel', 'inferior'];
  const LETRA = { superior: 'S', nivel: 'N', inferior: 'I' };

  /* opts: { key, titulo, item, unidad, valorLabel, icon(svg), chipId? } */
  PL.RangeSelector = function (opts) {
    const store = PL.store;
    const K = opts.key;
    const canvas = document.getElementById('canvas');
    const group = document.getElementById('rsGroup');
    const cfgContainers = [];

    const st = function () { return store.get(K); };
    const esFinito = function (it) { return isFinite(it.valor); };
    const fmt = function (v) { return (v > 0 ? '+' : '') + v + opts.unidad; };

    /* ---------- FAB ---------------------------------------------- */
    const fab = PL.el('button', { class: 'rs-fab', id: 'rsFab-' + K, title: opts.titulo, 'aria-label': opts.titulo, html: opts.icon });
    group.appendChild(fab);

    /* ---------- Panel -------------------------------------------- */
    const btns = {}, thumbs = {}, tips = {};
    const track = PL.el('div', { class: 'rs-track' });
    SLOTS.forEach(function (slot) {
      btns[slot] = PL.el('button', { class: 'rs-btn', text: LETRA[slot], title: 'Mover ' + slot,
        onclick: function () { store.toggle(K + '.activos.' + slot); } });
      tips[slot] = PL.el('span', { class: 'tip' });
      thumbs[slot] = PL.el('div', { class: 'rs-thumb', dataset: { slot: slot }, role: 'slider', 'aria-label': slot }, [tips[slot]]);
      track.appendChild(thumbs[slot]);
    });
    const btnCfg = PL.el('button', { class: 'rs-act', title: 'Configurar', 'aria-label': 'Configurar ' + opts.titulo, text: '⚙' });
    const btnBack = PL.el('button', { class: 'rs-act is-primary', title: 'Volver', 'aria-label': 'Cerrar selector', text: '←' });
    const panel = PL.el('div', { class: 'rs-panel', id: 'rsPanel-' + K, hidden: true }, [
      PL.el('div', { class: 'rs-btns' }, SLOTS.map(function (s) { return btns[s]; })),
      PL.el('div', { class: 'rs-track-wrap' }, [PL.el('span', { class: 'rs-inf', text: '∞' }), track, PL.el('span', { class: 'rs-inf', text: '∞' })]),
      PL.el('div', { class: 'rs-actions' }, [btnCfg, btnBack])
    ]);
    canvas.appendChild(panel);

    /* ---------- Ventana de configuración -------------------------- */
    // A la derecha, sobre el FAB de creación: nunca tapa la barra ni los tooltips.
    const win = PL.FloatWindow({ id: K + 'cfg', title: opts.titulo, parent: canvas,
      style: 'right:16px;bottom:96px;width:220px;', keep: ['rs:' + K] });
    cfgContainers.push(win.body);

    /* ---------- Apertura / cierre --------------------------------- */
    const api = {
      isOpen: function () { return !panel.hidden; },
      open: function () { PL.ui.closeAll('rs:' + K); panel.hidden = false; group.hidden = true; },
      close: function () {
        if (panel.hidden) return;
        panel.hidden = true; group.hidden = false; win.close();
      }
    };
    PL.ui.register('rs:' + K, api);
    fab.addEventListener('click', api.open);
    btnBack.addEventListener('click', api.close);
    btnCfg.addEventListener('click', win.toggle);

    /* ---------- Deslizadores -------------------------------------- */
    function renderThumbs() {
      const s = st(), n = s.items.length;
      SLOTS.forEach(function (slot) {
        const idx = s.pos[slot], it = s.items[idx];
        thumbs[slot].style.top = ((1 - idx / (n - 1)) * 100) + '%';  // valor alto → arriba
        tips[slot].textContent = esFinito(it) ? it.name + ' (' + fmt(it.valor) + ')' : it.name;
        thumbs[slot].classList.toggle('is-active', s.activos[slot]);
        thumbs[slot].classList.toggle('is-dim', !s.activos[slot] && slot !== 'nivel');
        thumbs[slot].setAttribute('aria-valuetext', it.name);
        btns[slot].classList.toggle('is-on', s.activos[slot]);
        btns[slot].setAttribute('aria-pressed', String(s.activos[slot]));
      });
    }

    function pointerToIdx(clientY) {
      const r = track.getBoundingClientRect(), n = st().items.length;
      const pct = r.height ? Math.max(0, Math.min(1, (clientY - r.top) / r.height)) : 0;
      return Math.round((1 - pct) * (n - 1));
    }

    /* Restricciones: inferior < nivel < superior (nunca se superponen).
       El central tampoco puede ocupar los extremos ±∞. */
    function tryMove(slot, idx) {
      const s = st(), p = s.pos, last = s.items.length - 1;
      idx = Math.max(0, Math.min(last, idx));
      if (slot === 'superior') idx = Math.max(idx, p.nivel + 1);
      else if (slot === 'inferior') idx = Math.min(idx, p.nivel - 1);
      else idx = Math.max(p.inferior + 1, Math.min(p.superior - 1, idx));
      if (idx !== p[slot]) store.set(K + '.pos.' + slot, idx);
    }

    SLOTS.forEach(function (slot) {
      PL.gestures.drag(thumbs[slot], {
        onStart: function () { return st().activos[slot]; },    // solo si su botón está activo
        onMove: function (e) { tryMove(slot, pointerToIdx(e.clientY)); }
      });
    });

    /* ---------- Modelo de configuración --------------------------- */
    // Recalcula posiciones tras reordenar, conservando los elementos
    // que cada deslizador tenía seleccionados cuando siguen siendo válidos.
    function reordenar(prev) {
      store.mutate(K, function (s) {
        s.items.sort(function (a, b) { return a.valor - b.valor; });
        const idxDe = function (id) { return s.items.findIndex(function (it) { return it.id === id; }); };
        const last = s.items.length - 1;
        let niv = idxDe(prev.nivel); if (niv < 0) niv = idxDe('base');
        let sup = idxDe(prev.superior); if (sup <= niv) sup = last;
        let inf = idxDe(prev.inferior); if (inf < 0 || inf >= niv) inf = 0;
        s.pos = { superior: sup, nivel: niv, inferior: inf };
      });
    }
    function snapshot() {
      const s = st();
      return { superior: s.items[s.pos.superior].id, nivel: s.items[s.pos.nivel].id, inferior: s.items[s.pos.inferior].id };
    }
    function buscar(id) { return st().items.filter(function (it) { return it.id === id; })[0]; }

    const model = {
      add: function () {
        const prev = snapshot();
        const finitos = st().items.filter(esFinito).map(function (it) { return it.valor; });
        const v = Math.max.apply(null, finitos) + 1;
        store.get(K).seq += 1;
        st().items.push({ id: K + '-' + st().seq, name: opts.item + ' ' + v, valor: v });
        reordenar(prev);
      },
      remove: function (id) {
        const it = buscar(id);
        if (!it || it.base || it.fijo) return;
        const prev = snapshot();
        st().items.splice(st().items.indexOf(it), 1);
        reordenar(prev);
      },
      rename: function (id, name) {
        const it = buscar(id);
        if (!it || !name.trim()) { renderCfg(); return; }
        it.name = name.trim(); store.emit(K + '.items');
      },
      setValor: function (id, raw) {
        const it = buscar(id), v = parseFloat(raw);
        if (!it || it.base || isNaN(v)) { renderCfg(); return; }
        const repetido = st().items.some(function (o) { return o !== it && o.valor === v; });
        if (repetido) { PL.toast('Ya existe un elemento con ' + opts.valorLabel.toLowerCase() + ' ' + v); renderCfg(); return; }
        const prev = snapshot();
        it.valor = v;
        reordenar(prev);
      }
    };

    /* ---------- Vista de configuración (lista editable) ----------- */
    function renderCfg() {
      cfgContainers.forEach(function (box) {
        box.innerHTML = '';
        box.appendChild(PL.el('div', { class: 'fw-row', style: 'color:var(--texto-sec);font-size:11px' },
          [PL.el('span', { text: 'Nombre' }), PL.el('span', { text: opts.valorLabel })]));
        st().items.filter(esFinito).slice().sort(function (a, b) { return b.valor - a.valor; }) // mayor arriba
          .forEach(function (it) {
            box.appendChild(PL.el('div', { class: 'rs-cfg-row', dataset: { id: it.id } }, [
              PL.el('input', { type: 'text', value: it.name, 'aria-label': 'Nombre',
                onchange: function (e) { model.rename(it.id, e.target.value); } }),
              PL.el('input', { type: 'number', value: it.valor, step: 'any', disabled: !!it.base, 'aria-label': opts.valorLabel,
                title: it.base ? 'La base siempre vale 0' : opts.valorLabel,
                onchange: function (e) { model.setValor(it.id, e.target.value); } }),
              it.base ? PL.el('span', { class: 'rs-cfg-del' })
                      : PL.el('button', { class: 'rs-cfg-del', text: '✕', 'aria-label': 'Eliminar ' + it.name,
                          onclick: function () { model.remove(it.id); } })
            ]));
          });
        box.appendChild(PL.el('button', { class: 'fw-row rs-cfg-add', text: '+ Agregar ' + opts.item.toLowerCase(), onclick: model.add }));
      });
    }

    /* ---------- Chip (opcional) ----------------------------------- */
    const chip = opts.chipId ? document.getElementById(opts.chipId) : null;
    function renderChip() {
      if (!chip) return;
      const s = st();
      chip.innerHTML = '';
      chip.append(PL.el('span', { text: opts.item + ':' }), PL.el('b', { text: s.items[s.pos.nivel].name }));
    }

    store.subscribe(K, function (state, path) {
      renderThumbs(); renderChip();
      if (path === K || path.indexOf(K + '.items') === 0) renderCfg();
    });
    renderThumbs(); renderChip(); renderCfg();

    const pub = {
      key: K, open: api.open, close: api.close, isOpen: api.isOpen, win: win,
      tryMove: tryMove, add: model.add, remove: model.remove, rename: model.rename, setValor: model.setValor,
      /** Permite que otro componente (drawer) muestre la misma lista editable. */
      attachCfg: function (box) { cfgContainers.push(box); renderCfg(); }
    };
    PL.selectors[K] = pub;
    return pub;
  };

  /* Montaje de los dos selectores */
  PL.components.rangeSelectors = {
    mount: function () {
      PL.RangeSelector({
        key: 'niveles', titulo: 'Niveles', item: 'Nivel', unidad: ' m', valorLabel: 'Cota', chipId: 'levelChip',
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="9" width="20" height="6" rx="3"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="7" y1="9" x2="7" y2="15"/><line x1="17" y1="9" x2="17" y2="15"/></svg>'
      });
      PL.RangeSelector({
        key: 'fases', titulo: 'Fases', item: 'Fase', unidad: '', valorLabel: 'Orden',
        icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>'
      });
    }
  };
})(window.PL);
