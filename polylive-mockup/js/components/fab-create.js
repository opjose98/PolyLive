/* =====================================================================
   components/fab-create.js — FAB de creación (inferior derecha)
   ---------------------------------------------------------------------
   Máquina de estados de navegación (drill-down):
     cerrado  [＋] --toque--> nivel1 [−]  (5 categorías)
     nivel1   [−]  --toque--> cerrado
     nivel1   --categoría--> nivel2 [←]  (herramientas de la categoría)
     nivel2   [←]  --toque--> nivel1     (retrocede UN nivel)
     nivel2   --herramienta--> activa la herramienta (BPC la muestra)
                               y el FAB se cierra.
   El botón principal está anclado (position:absolute) y NO se mueve;
   los mini-botones se apilan hacia arriba sin desplazarlo.
   Nivel 3 (formas de creación por herramienta): PENDIENTE.
   Panel registrado en PL.ui con la clave 'fc'.
   Depende de: core.js, config.js
   ===================================================================== */
(function (PL) {
  'use strict';
  PL.components = PL.components || {};

  PL.components.fabCreate = {
    mount: function () {
      const canvas = document.getElementById('canvas');
      const minis = PL.el('div', { class: 'fc-minis', id: 'fcMinis' });
      const main = PL.el('button', { class: 'fc-main', id: 'fcMain', 'aria-label': 'Crear' });
      canvas.appendChild(PL.el('div', { class: 'fc-wrap' }, [minis, main]));

      let estado = 'cerrado';   // 'cerrado' | 'nivel1' | 'nivel2'
      let categoria = null;     // categoría activa en nivel2

      function mini(item, onClick) {
        return PL.el('button', { class: 'fc-mini', dataset: { id: item.id }, onclick: onClick }, [
          PL.el('span', { class: 'tip', text: item.label }),
          PL.el('span', { class: 'btn', text: item.icon })
        ]);
      }

      function render() {
        minis.innerHTML = '';
        main.textContent = { cerrado: '＋', nivel1: '−', nivel2: '←' }[estado];
        main.setAttribute('aria-expanded', String(estado !== 'cerrado'));
        if (estado === 'nivel1') {
          PL.config.CATEGORIAS.forEach(function (cat) {
            minis.appendChild(mini(cat, function () { categoria = cat; estado = 'nivel2'; render(); }));
          });
        } else if (estado === 'nivel2') {
          categoria.hijos.forEach(function (h) {
            minis.appendChild(mini(h, function () { activarHerramienta(categoria, h); }));
          });
        }
      }

      function activarHerramienta(cat, h) {
        PL.store.set('seleccion', null);
        PL.store.set('herramienta', {
          id: h.id, label: h.label, categoria: cat.label,
          props: JSON.parse(JSON.stringify(h.props || {}))   // copia: no mutar el catálogo
        });
        api.close();
        PL.toast(h.label + ' activo · formas de creación pendientes');
      }

      const api = {
        isOpen: function () { return estado !== 'cerrado'; },
        close: function () { estado = 'cerrado'; categoria = null; render(); }
      };
      PL.ui.register('fc', api);

      main.addEventListener('click', function () {
        if (estado === 'cerrado') { PL.ui.closeAll('fc'); estado = 'nivel1'; }
        else if (estado === 'nivel1') { estado = 'cerrado'; }
        else { estado = 'nivel1'; categoria = null; }
        render();
      });
      render();
    }
  };
})(window.PL);
