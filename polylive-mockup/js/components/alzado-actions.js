/* =====================================================================
   components/alzado-actions.js — Botones de acción del alzado
   ---------------------------------------------------------------------
   Botón "Cambiar lado" (A↔B): ARRIBA del FAB de creación.
   Botón "Volver a planta": a la IZQUIERDA del FAB de creación.
   Ambos son círculos del estilo de la app. Solo existen en alzado.
   Depende de: core.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};

  PL.components.alzadoActions = {
    mount: function () {
      var store = PL.store;
      var canvas = document.getElementById('canvas');

      /* Botón cambiar de lado (arriba del FAB +) */
      var lblSide = document.createTextNode('A');
      var btnSide = PL.el('button', { class: 'fc-action-top', title: 'Cambiar lado del muro',
        'aria-label': 'Cambiar lado del muro',
        onclick: function () { store.set('lado', store.get('lado') === 'A' ? 'B' : 'A'); }
      }, [lblSide]);
      canvas.appendChild(btnSide);

      function renderSide(s) {
        lblSide.textContent = s.lado;
        btnSide.style.borderColor = s.lado === 'A' ? 'var(--ambar)' : '#42A5F5';
        btnSide.style.color = s.lado === 'A' ? 'var(--ambar-d)' : '#1565C0';
      }
      store.subscribe('lado', renderSide);
      renderSide(store.get());

      /* Botón volver a planimetría (izquierda del FAB +) */
      var btnBack = PL.el('button', { class: 'fc-action-left', title: 'Volver a planimetría',
        'aria-label': 'Volver a vista de planta',
        onclick: function () {
          /* Intentar navegar al archivo de planta (reemplaza 'alzado' por 'planta' en la URL).
             Si no cambia (artifact o nombre distinto), intenta con la ruta relativa. */
          var url = window.location.href;
          var newUrl = url.replace('alzado', 'planta');
          if (newUrl !== url) {
            window.location.href = newUrl;
          } else {
            /* Fallback: buscar el link de planta si existe, o avisar */
            var base = url.substring(0, url.lastIndexOf('/') + 1);
            var planta = base + 'polylive-planta.html';
            window.location.href = planta;
          }
        }
      }, [PL.el('span', { text: '↩' })]);
      canvas.appendChild(btnBack);
    }
  };
})(window.PL);
