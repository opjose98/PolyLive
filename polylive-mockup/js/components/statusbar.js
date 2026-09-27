/* =====================================================================
   components/statusbar.js — Status bar (2 filas)
   ---------------------------------------------------------------------
   Fila 1: "Sede · Recinto" centrado (lee store.proyecto → se actualiza
           en vivo si se edita desde el drawer).
   Fila 2: ☰ menú principal (izq.) | ↺ ↻ · BLE · ⋮ (der.)
   BLE:  toque corto  → enciende/apaga (círculo ámbar = encendido)
         mantener 0.5s → abre ventana "Bluetooth (BLE)"; mientras está
                         abierta el círculo se muestra gris.
   ⋮ :  lo gestiona config-drawer.js (se convierte en ✕ al abrir).
   Depende de: core.js, config.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};

  PL.components.statusbar = {
    mount: function () {
      const store = PL.store;
      const title = document.getElementById('sbTitle');
      const btnBle = document.getElementById('btnBle');
      const phone = document.getElementById('phone');

      /* Título ---------------------------------------------------- */
      function renderTitle(s) {
        title.innerHTML = '';
        title.append(PL.el('b', { text: s.proyecto.sede }), ' · ' + s.proyecto.recinto);
      }
      store.subscribe('proyecto', renderTitle);
      renderTitle(store.get());

      /* Ventana BLE (posicionada bajo la status bar, a la derecha) - */
      const tagEstado = PL.el('span', { class: 'tag' });
      const win = PL.FloatWindow({
        id: 'ble', title: 'Bluetooth (BLE)', parent: phone,
        style: 'top:104px;right:56px;',
        onOpen: renderBle, onClose: renderBle
      });
      win.body.append(
        PL.el('div', { class: 'fw-row' }, [PL.el('span', { text: 'Estado' }), tagEstado]),
        PL.el('div', { class: 'fw-row' }, [PL.el('span', { text: 'Dispositivo' }), PL.el('span', { text: store.get('ble.dispositivo') })]),
        PL.el('div', { class: 'fw-row' }, [PL.el('span', { text: 'Batería' }), PL.el('span', { text: store.get('ble.bateria') + '%' })]),
        PL.el('button', { class: 'fw-row fw-link', text: 'Buscar dispositivos', onclick: function () { PL.toast('Buscando dispositivos BLE…'); } })
      );

      /* Botón BLE: ámbar solo si está encendido Y su ventana cerrada */
      function renderBle() {
        const on = store.get('ble.on');
        btnBle.classList.toggle('is-on', on && !win.isOpen());
        btnBle.setAttribute('aria-pressed', String(on));
        tagEstado.textContent = on ? 'Conectado' : 'Desactivado';
        tagEstado.classList.toggle('is-on', on);
      }
      store.subscribe('ble', renderBle);
      PL.gestures.longPress(btnBle, {
        ms: 500,
        onTap: function () { store.toggle('ble.on'); },
        onLong: function () { win.open(); }
      });
      renderBle();

      /* Deshacer / rehacer: solo demostrativo */
      document.getElementById('btnUndo').addEventListener('click', function () { PL.toast('Deshacer (demo)'); });
      document.getElementById('btnMenu').addEventListener('click', function () { PL.toast('Menú principal: pendiente de diseño'); });
    }
  };
})(window.PL);
