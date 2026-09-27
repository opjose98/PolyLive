/* =====================================================================
   components/canvas-alzado.js — Lienzo de alzado (vista frontal)
   ---------------------------------------------------------------------
   Muestra el muro activo como un rectángulo grande (ancho × alto).
   Dibuja los niveles de referencia como líneas horizontales punteadas
   con nombre arriba y cota abajo, alineados a la izquierda.
   Reutiliza temas, cuadrícula y zoom del canvas.js base.
   Depende de: core.js, config.js, config-alzado.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};
  PL.actions = PL.actions || {};

  const ZOOM_MIN = 25, ZOOM_MAX = 400, ZOOM_FACTOR = 1.25;
  const PX_POR_M = 80;   // escala demo: 1 m = 80 px

  PL.components.canvas = {
    mount: function () {
      const store = PL.store;
      const canvas = document.getElementById('canvas');
      const world = document.getElementById('world');

      /* Acciones de zoom */
      function setZoom(z) { store.set('zoom', Math.round(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z)))); }
      PL.actions.zoomIn = function () { setZoom(store.get('zoom') * ZOOM_FACTOR); };
      PL.actions.zoomOut = function () { setZoom(store.get('zoom') / ZOOM_FACTOR); };
      PL.actions.zoomFit = function () { setZoom(100); PL.toast('Encuadre: 100%'); };
      PL.actions.zoomSel = function () { PL.toast('Zoom a selección (demo)'); };

      /* Construir el muro y las líneas de nivel */
      var labelEls = [];   // referencias a las etiquetas para reposicionar en render()
      var lineData = [];   // datos de las líneas para recalcular posición

      function buildWorld() {
        world.innerHTML = '';
        labelEls.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
        labelEls = []; lineData = [];
        var m = store.get('muroActivo');

        /* Muro como rectángulo centrado */
        var mW = m.ancho, mH = m.alto;
        var muroEl = PL.el('div', { class: 'alzado-muro', style: {
          width: mW + 'px', height: mH + 'px',
          position: 'absolute',
          left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)'
        }});
        world.appendChild(muroEl);

        /* Líneas de nivel: las líneas van en world (escalan con zoom).
           Las etiquetas van DIRECTAMENTE en el canvas (no escalan nunca,
           siempre fijas a la izquierda). Su posición Y se recalcula en render(). */
        var niveles = store.get('nivelesRef') || [];
        niveles.forEach(function (n) {
          lineData.push({ cota: n.cota, name: n.name });
          // Línea dentro de world (escala con zoom)
          var line = PL.el('div', { class: 'alzado-nivel-line', dataset: { cota: n.cota } });
          world.appendChild(line);
          // Etiqueta fuera de world (fija en canvas)
          var labelBox = PL.el('div', { class: 'alzado-nivel-label' }, [
            PL.el('span', { class: 'alzado-nivel-name', text: n.name }),
            PL.el('span', { class: 'alzado-nivel-cota', text: (n.cota >= 0 ? '+' : '') + n.cota.toFixed(2) + ' m' })
          ]);
          canvas.appendChild(labelBox);
          labelEls.push({ el: labelBox, cota: n.cota });
        });
      }

      function render(s) {
        canvas.dataset.tema = s.tema;
        canvas.classList.toggle('grid-lineas', s.cuadricula.lineas);
        canvas.classList.toggle('grid-puntos', s.cuadricula.puntos);
        var z = s.zoom / 100;
        world.style.transform = 'scale(' + z + ')';

        /* Posicionar las líneas dentro de world (coordenadas sin zoom, world escala).
           El muro se centra en 50%/50% de world, así que cota 0 = centro + alto/2. */
        var m = s.muroActivo;
        var worldH = canvas.offsetHeight;
        var basePx = worldH / 2 + m.alto / 2;  // cota 0 en coordenadas de world
        world.querySelectorAll('.alzado-nivel-line').forEach(function (line) {
          var cota = parseFloat(line.dataset.cota);
          var yWorld = basePx - (cota * PX_POR_M);
          line.style.cssText = 'position:absolute;left:-9999px;right:-9999px;top:' + yWorld + 'px';
        });

        /* Posicionar las etiquetas en el canvas (coordenadas de pantalla).
           Convertimos la posición de world a pantalla multiplicando por el zoom. */
        var canvasRect = canvas.getBoundingClientRect();
        var worldCenterY = canvasRect.height / 2;
        labelEls.forEach(function (item) {
          var yWorld = basePx - (item.cota * PX_POR_M);
          // En pantalla: el centro de world está en 50% del canvas, y yWorld
          // se mide desde el top de world. La distancia desde el centro = yWorld - worldH/2.
          var yScreen = worldCenterY + (yWorld - worldH / 2) * z;
          item.el.style.top = (yScreen - 6) + 'px';  // -6 para centrar verticalmente con la línea
        });
      }

      store.subscribe(['tema', 'cuadricula', 'zoom', 'escala'], render);
      buildWorld();
      render(store.get());
      /* El primer layout puede no tener aún medidas reales (offsetHeight/
         getBoundingClientRect a 0 en el primer frame). Se reposiciona una
         vez más tras el primer paint para que las líneas no queden
         apiladas arriba. */
      requestAnimationFrame(function () { render(store.get()); });

      /* Tocar el fondo → deseleccionar */
      canvas.addEventListener('click', function (e) {
        if (e.target !== canvas && e.target !== world) return;
        PL.ui.closeAll();
        store.set('herramienta', null);
        store.set('seleccion', null);
      });
    }
  };
})(window.PL);
