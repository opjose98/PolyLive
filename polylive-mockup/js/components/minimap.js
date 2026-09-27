/* =====================================================================
   components/minimap.js — Mini-mapa + selector de lado (alzado)
   ---------------------------------------------------------------------
   Ubicación: esquina superior izquierda, bajo el chip.
   Expandido (por defecto): muestra la planta en miniatura (4 muros
     demo) con el muro activo resaltado y un lado marcado con color.
     Botón A↔B centrado abajo para cambiar de lado.
     Tocar el mini-mapa (no el botón) lo colapsa.
   Colapsado: botón sutil del tamaño del FAB de fase (34px), alineado
     con el selector de fase. Tocarlo lo expande de nuevo.
   Depende de: core.js, config-alzado.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};

  PL.components.minimap = {
    mount: function () {
      var store = PL.store;
      var canvas = document.getElementById('canvas');

      /* --- Botón colapsado (misma posición y tamaño que FAB fase) --- */
      var btnCollapsed = PL.el('button', {
        class: 'minimap-btn', id: 'minimapBtn',
        title: 'Mostrar mini-mapa',
        'aria-label': 'Mostrar mini-mapa',
        hidden: true,
        onclick: function () { store.set('minimapa', true); }
      }, [PL.el('span', { text: '⊞' })]);
      canvas.appendChild(btnCollapsed);

      /* --- Mini-mapa expandido --- */
      var svgContainer = PL.el('div', { class: 'minimap-svg' });
      var mapBox = PL.el('div', {
        class: 'minimap-box', id: 'minimapBox',
        onclick: function () { store.set('minimapa', false); }
      }, [svgContainer]);
      canvas.appendChild(mapBox);

      /* --- Render del SVG de la planta en miniatura --- */
      /* Rectángulo demo de 4 muros. El muro activo (índice 1 = derecho)
         se resalta en ámbar. El lado A se marca con un color en el borde
         correspondiente, el lado B con otro. */
      function renderSVG(s) {
        var lado = s.lado;
        var colA = '#FF8F00';   // ámbar
        var colB = '#42A5F5';   // azul
        var colActivo = lado === 'A' ? colA : colB;
        var colInactivo = lado === 'A' ? colB : colA;

        // Planta miniatura: rectángulo de ~60×40
        var svg = '<svg viewBox="0 0 80 56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">'
          // 4 muros: superior, derecho (activo), inferior, izquierdo
          + '<rect x="10" y="8" width="60" height="2" fill="#999" rx="0.5"/>'    // sup
          + '<rect x="10" y="46" width="60" height="2" fill="#999" rx="0.5"/>'   // inf
          + '<rect x="10" y="8" width="2" height="40" fill="#999" rx="0.5"/>'    // izq
          // Muro activo (derecho) con los 2 lados coloreados
          + '<rect x="68" y="8" width="2" height="40" fill="' + colActivo + '" rx="0.5"/>'
          // Indicador del lado: triángulo/flecha apuntando al lado visible
          + (lado === 'A'
            ? '<polygon points="71,28 78,23 78,33" fill="' + colA + '" opacity="0.8"/>'   // vértice toca el muro, base hacia afuera (lado A)
            : '<polygon points="67,28 60,23 60,33" fill="' + colB + '" opacity="0.8"/>')  // vértice toca el muro, base hacia afuera (lado B)
          // Etiquetas
          + '<text x="78" y="48" font-size="8" fill="' + colA + '" font-weight="bold" text-anchor="end"' + (lado === 'A' ? '' : ' opacity="0.35"') + '>A</text>'
          + '<text x="60" y="48" font-size="8" fill="' + colB + '" font-weight="bold"' + (lado === 'B' ? '' : ' opacity="0.35"') + '>B</text>'
          + '</svg>';
        svgContainer.innerHTML = svg;
        
      }

      function renderVisibility(s) {
        mapBox.hidden = !s.minimapa;
        btnCollapsed.hidden = s.minimapa;
      }

      store.subscribe(['lado', 'minimapa'], function (s) { renderSVG(s); renderVisibility(s); });
      renderSVG(store.get());
      renderVisibility(store.get());
    }
  };
})(window.PL);
