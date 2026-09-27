/* =====================================================================
   tests/smoke.test.js — Pruebas de humo de todos los flujos del mockup
   Ejecuta el build (dist/polylive-planta.html) en jsdom y simula toques.
   Uso:  npm i jsdom && node tests/smoke.test.js
   ===================================================================== */
const fs = require('fs'), path = require('path');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'polylive-planta.html'), 'utf8');

const errores = [];
const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true });
const w = dom.window, d = w.document;
w.addEventListener('error', e => errores.push(e.message));

let ok = 0, fail = 0;
function t(nombre, cond) { if (cond) ok++; else { fail++; console.log('✗', nombre); } }
const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, detail: 1 }));
const ev = (el, type) => el.dispatchEvent(new w.Event(type, { bubbles: true }));
const S = p => w.PL.store.get(p);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await sleep(50);
  t('sin errores al cargar', errores.length === 0);
  t('inicio: un solo muro seleccionado', $$('.wall.is-selected').length === 1);

  /* Status bar */
  t('título', $('#sbTitle').textContent === 'SUMB · Recinto 03');
  t('BLE encendido al inicio', $('#btnBle').classList.contains('is-on'));
  ev($('#btnBle'), 'pointerdown'); ev($('#btnBle'), 'pointerup');
  t('BLE toque → apagado', !S('ble.on') && !$('#btnBle').classList.contains('is-on'));
  ev($('#btnBle'), 'pointerdown'); ev($('#btnBle'), 'pointerup');
  t('BLE toque → encendido', S('ble.on'));
  ev($('#btnBle'), 'pointerdown'); await sleep(600); ev($('#btnBle'), 'pointerup');
  t('BLE mantener → ventana abierta', !$('#fw-ble').hidden);
  t('BLE mantener no cambia estado', S('ble.on'));
  t('BLE gris con ventana abierta', !$('#btnBle').classList.contains('is-on'));
  click($('#fw-ble .fw-close'));
  t('BLE ámbar al cerrar ventana', $('#btnBle').classList.contains('is-on'));

  /* Drawer */
  click($('#btnConfig'));
  t('drawer abierto', !$('#cdOverlay').hidden);
  t('⋮ → ✕ ámbar', $('#btnConfig').textContent === '✕' && $('#btnConfig').classList.contains('is-on'));
  t('10 secciones', $$('.cd-section').length === 10);
  t('sin ✕ dentro del drawer', !$('.cd-drawer .fw-close'));
  const inpSede = $$('.cd-section')[1].querySelector('input');
  inpSede.value = 'BRIS'; ev(inpSede, 'change');
  t('editar sede → título', $('#sbTitle').textContent.startsWith('BRIS'));
  click($('#btnConfig'));
  t('drawer cerrado y ⋮', $('#cdOverlay').hidden && $('#btnConfig').textContent === '⋮');

  /* FAB de creación */
  click($('#fcMain'));
  t('fc nivel1 = −', $('#fcMain').textContent === '−' && $$('#fcMinis .fc-mini').length === 5);
  click($('#fcMinis [data-id="arquitectonico"]'));
  t('fc nivel2 = ←', $('#fcMain').textContent === '←' && $$('#fcMinis .fc-mini').length === 3);
  click($('#fcMain'));
  t('← retrocede un nivel', $('#fcMain').textContent === '−' && $$('#fcMinis .fc-mini').length === 5);
  click($('#fcMinis [data-id="arquitectonico"]'));
  click($('#fcMinis [data-id="muro"]'));
  t('herramienta Muro activa', S('herramienta').id === 'muro' && $('#fcMain').textContent === '＋');
  t('BPC contextual herramienta', /Herramienta: Muro/.test($('#bpc').textContent) && /Espesor/.test($('#bpc').textContent));
  t('catálogo no mutado', w.PL.config.CATEGORIAS[2].hijos[0].props.espesor === 15);

  /* Exclusividad global */
  click($('#fcMain')); click($('#ctMain'));
  t('abrir ct cierra fc', $('#fcMain').textContent === '＋' && w.PL.ui.isOpen('ct'));
  click($('#fvMain'));
  t('abrir fv cierra ct', !w.PL.ui.isOpen('ct') && w.PL.ui.isOpen('fv'));
  t('filtros/capas ocultos con fv abierto', $('.fv-extra').hidden);
  click($('.fv-mini[data-id="topografia"]'));
  t('vista radio', S('vista') === 'topografia' && $$('.fv-mini .btn.is-on').length === 1);
  click($('#fvMain'));
  t('filtros/capas visibles al cerrar fv', !$('.fv-extra').hidden);

  /* Filtros */
  click($$('.fv-extra button')[0]);
  t('ventana filtros abierta', !$('#fw-filtros').hidden);
  click($('#fw-filtros .fw-row'));
  t('filtro muros off → muros ocultos', !S('filtros.muros') && $('.wall').hidden);
  click($('#fw-filtros .fw-row'));
  click($$('.fv-extra button')[1]);
  t('capas abre y cierra filtros', !$('#fw-capas').hidden && $('#fw-filtros').hidden);

  /* Herramientas de esquina */
  click($('#ctMain'));
  t('ct abierto con −', $('#ctMain').textContent === '−' && !$('.ct-rows').hidden);
  const fila = id => $(`.ct-row[data-id="${id}"]`);
  click(fila('snap').querySelector('.ct-fab'));
  t('menú snap visible', !fila('snap').querySelector('.ct-menu').hidden);
  click(fila('tema').querySelector('.ct-fab'));
  t('solo un menú de fila', fila('snap').querySelector('.ct-menu').hidden && !fila('tema').querySelector('.ct-menu').hidden);
  click(fila('tema').querySelectorAll('.opt')[1]);
  t('tema oscuro en lienzo', $('#canvas').dataset.tema === 'oscuro');
  click(fila('tema').querySelectorAll('.opt')[0]);
  click(fila('cuadricula').querySelector('.ct-fab'));
  click(fila('cuadricula').querySelectorAll('.opt')[1]);
  t('rejilla de puntos', $('#canvas').classList.contains('grid-puntos'));
  click(fila('zoom').querySelector('.ct-fab'));
  click(fila('zoom').querySelectorAll('.opt')[1]);
  t('zoom + = 125%', S('zoom') === 125);
  t('zoom sin estado encendido', !fila('zoom').querySelector('.opt.is-on'));
  click(fila('snap').querySelector('.ct-fab'));
  click(fila('snap').querySelectorAll('.opt')[0]);   // apaga 'nodo' (único activo)
  t('snap sin activos → icono gris', !fila('snap').querySelector('.ct-fab').classList.contains('is-on'));
  click(fila('snap').querySelectorAll('.opt')[0]);
  t('snap con activo → icono ámbar', fila('snap').querySelector('.ct-fab').classList.contains('is-on'));
  const inpEsc = fila('escala').querySelector('input');
  inpEsc.value = '1:100'; ev(inpEsc, 'change');
  t('escala personalizada', S('escala.valor') === '100');
  click($('#ctMain'));
  t('ct cerrado con 🛠', $('#ctMain').textContent === '🛠');

  /* Selector de nivel */
  const niv = w.PL.selectors.niveles, fas = w.PL.selectors.fases;
  click($('#rsFab-niveles'));
  t('panel nivel abierto, grupo oculto', !$('#rsPanel-niveles').hidden && $('#rsGroup').hidden);
  t('N activo por defecto', S('niveles.activos.nivel') && !S('niveles.activos.superior'));
  t('chip Nivel 0', $('#levelChip').textContent === 'Nivel:Nivel 0');
  click($('#rsPanel-niveles .rs-act'));        // ⚙
  t('cfg abierta sin cerrar panel', !$('#fw-nivelescfg').hidden && !$('#rsPanel-niveles').hidden);
  t('cfg por defecto solo base', $$('#fw-nivelescfg .rs-cfg-row').length === 1);
  click($('#fw-nivelescfg .rs-cfg-add'));
  click($('#fw-nivelescfg .rs-cfg-add'));
  t('agregar niveles (0,1,2)', S('niveles.items').filter(i => isFinite(i.valor)).map(i => i.valor).join() === '0,1,2');
  t('lista ordenada mayor arriba', $$('#fw-nivelescfg .rs-cfg-row input[type=number]').map(i => i.value).join() === '2,1,0');
  const n2 = S('niveles.items').find(i => i.valor === 2);
  niv.setValor(n2.id, '1');
  t('valor repetido rechazado', n2.valor === 2 && /Ya existe/.test($('.toast').textContent));
  niv.setValor(n2.id, '-3');
  t('reordena al cambiar valor', S('niveles.items').filter(i => isFinite(i.valor)).map(i => i.valor).join() === '-3,0,1');
  t('base intacta', S('niveles.items').find(i => i.base).valor === 0);
  t('drawer sincronizado', $$('.cd-section')[8].querySelectorAll('.rs-cfg-row').length === 3);
  const P = () => S('niveles.pos');
  niv.tryMove('nivel', 99);
  t('central no llega a +∞', P().nivel < S('niveles.items').length - 1 && P().nivel < P().superior);
  niv.tryMove('inferior', 99);
  t('inferior siempre debajo', P().inferior < P().nivel);
  niv.tryMove('superior', 0);
  t('superior siempre encima', P().superior > P().nivel);
  t('chip sigue al central', $('#levelChip').textContent.endsWith(S('niveles.items')[P().nivel].name));
  const tip = $('#rsPanel-niveles [data-slot="nivel"] .tip').textContent;
  t('tooltip nombre + cota', /\(\+1 m\)/.test(tip));
  click($('#rsPanel-niveles .rs-btn'));   // S
  t('toggle S independiente', S('niveles.activos.superior') && S('niveles.activos.nivel'));
  click($('#rsPanel-niveles .rs-act.is-primary'));   // ←
  t('← cierra panel y cfg, muestra grupo', $('#rsPanel-niveles').hidden && $('#fw-nivelescfg').hidden && !$('#rsGroup').hidden);

  /* Selector de fase (independiente) */
  click($('#rsFab-fases'));
  t('panel fase abierto', !$('#rsPanel-fases').hidden && $('#rsGroup').hidden);
  fas.add();
  t('fases independientes de niveles', S('fases.items').length === 4 && S('niveles.items').length === 5);
  t('tooltip de fase sin unidad', /Fase 0 \(0\)/.test($('#rsPanel-fases [data-slot="nivel"] .tip').textContent));
  click($('#fcMain'));
  t('abrir fc cierra panel fase y muestra grupo', $('#rsPanel-fases').hidden && !$('#rsGroup').hidden);
  click($('#fcMain'));

  /* Lienzo: deseleccionar */
  click($('#canvas'));
  t('tocar fondo → BPC Lienzo', S('herramienta') === null && S('seleccion') === null && /Lienzo/.test($('#bpc').textContent));
  t('BPC muestra escala 1:100', /1:100/.test($('#bpc').textContent));
  click($('.wall'));
  t('tocar muro → seleccionado', /Muro seleccionado/.test($('#bpc').textContent) && $('.wall').classList.contains('is-selected'));
  t('solo ese muro resaltado', $$('.wall.is-selected').length === 1);
  const pill = $('.bpc-drag');
  pill.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, clientX: 100 }));
  pill.dispatchEvent(new w.MouseEvent('pointermove', { bubbles: true, clientX: 160 }));
  t('arrastre espesor en vivo', S('muros.0.props.espesor') === 25 && $('.wall').style.height === '10px');
  pill.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 160 }));
  t('BPC refleja 25 cm', /25 cm/.test($('#bpc').textContent));
  t('otros muros sin cambio', S('muros.1.props.espesor') === 15);

  t('sin errores al final', errores.length === 0);
  console.log(`\n${ok} OK · ${fail} fallos` + (errores.length ? ' · errores: ' + errores.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})();
