/* =====================================================================
   components/canvas.js — Lienzo
   ---------------------------------------------------------------------
   Responsabilidades:
   - Aplicar TEMA (data-tema) y CUADRÍCULA (clases grid-lineas/puntos)
     leídos del store. Solo cambia el lienzo, no la UI.
   - ZOOM: escala la capa .world (PL.actions.zoomIn/zoomOut/zoomFit/zoomSel).
   - Visibilidad por FILTROS/CAPAS (muros ocultos si filtro "Muros" o
     capa "Arquitectónico" están apagados).
   - GROSOR de cada muro según su espesor (1 cm = 0.4 px) → el arrastre
     de la BPC se ve en vivo sobre el dibujo.
   - SELECCIÓN demo: tocar un muro → selecciona ESE muro;
     tocar el fondo → deselecciona, sale de la herramienta activa y
     cierra cualquier panel abierto.
   Depende de: core.js, config.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};
  PL.actions = PL.actions || {};

  const ZOOM_MIN = 25, ZOOM_MAX = 400, ZOOM_FACTOR = 1.25;
  const PX_POR_CM = 0.4;   // escala visual del grosor de muro

  PL.components.canvas = {
    mount: function () {
      const store = PL.store;
      const canvas = document.getElementById('canvas');
      const world = document.getElementById('world');
      const walls = world.querySelectorAll('.wall');

      /* Acciones de zoom (sin estado propio: escriben store.zoom) ----- */
      function setZoom(z) { store.set('zoom', Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)))); }
      PL.actions.zoomIn = function () { setZoom(store.get('zoom') * ZOOM_FACTOR); };
      PL.actions.zoomOut = function () { setZoom(store.get('zoom') / ZOOM_FACTOR); };
      PL.actions.zoomFit = function () { setZoom(100); PL.toast('Encuadre: 100%'); };
      PL.actions.zoomSel = function () {
        if (!store.get('seleccion')) { PL.toast('No hay selección para encuadrar'); return; }
        setZoom(150); PL.toast('Zoom a selección');
      };

      /* Render de apariencia ---------------------------------------- */
      function render(s) {
        canvas.dataset.tema = s.tema;
        canvas.classList.toggle('grid-lineas', s.cuadricula.lineas);
        canvas.classList.toggle('grid-puntos', s.cuadricula.puntos);
        world.style.transform = 'scale(' + (s.zoom / 100) + ')';
        const murosVisibles = s.filtros.muros && s.capas.arquitectonico;
        walls.forEach(function (w, i) {
          const t = Math.max(2, Math.round(s.muros[i].props.espesor * PX_POR_CM)) + 'px';
          if (w.dataset.orient === 'h') w.style.height = t; else w.style.width = t;
          w.hidden = !murosVisibles;
          w.classList.toggle('is-selected', !!(s.seleccion && s.seleccion.tipo === 'Muro' && s.seleccion.ref === i));
        });
      }
      store.subscribe(['tema', 'cuadricula', 'zoom', 'filtros', 'capas', 'seleccion', 'muros'], render);
      render(store.get());

      /* Selección demo ---------------------------------------------- */
      walls.forEach(function (w, i) {
        w.addEventListener('click', function (e) {
          e.stopPropagation();
          store.set('herramienta', null);
          store.set('seleccion', { tipo: 'Muro', ref: i });
        });
        /* Double-tap en un muro → entrar al alzado */
        w.addEventListener('dblclick', function (e) {
          e.stopPropagation();
          var url = window.location.href.replace('planta', 'alzado');
          if (url !== window.location.href) {
            window.location.href = url;
          } else {
            var base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
            var alzUrl = base + 'polylive-alzado.html';
            window.location.href = alzUrl;
          }
        });
      });
      canvas.addEventListener('click', function (e) {
        // Solo cuenta el toque sobre el fondo (no sobre la UI flotante)
        if (e.target !== canvas && e.target !== world) return;
        PL.ui.closeAll();
        store.set('herramienta', null);
        store.set('seleccion', null);
      });
    }
  };
})(window.PL);
