# PolyLive · Mockup SurveyScreen · Planta

Mockup navegable (HTML + CSS + JS sin dependencias) de la pantalla de levantamiento en vista de planta.

## Abrir

- Desarrollo: abre `index.html` en el navegador (no necesita servidor).
- Un solo archivo: `dist/polylive-planta.html` (lo genera `build.py`).

## Comandos

```bash
python3 build.py          # regenera dist/polylive-planta.html
npm install && npm test   # build + 71 pruebas de humo (jsdom)
```

## Estructura

```
index.html                 estructura estática mínima (status bar, lienzo, contenedores)
css/styles.css             tokens, temas del lienzo y todos los componentes
js/core.js                 PL.el · PL.store · PL.ui · PL.FloatWindow · PL.toast · PL.gestures
js/config.js               catálogos (menús, vistas, snaps, props…) y estado inicial
js/components/*.js         un archivo por componente (ver docs/DOCUMENTACION.md)
js/main.js                 arranque y orden de montaje
tests/smoke.test.js        pruebas de todos los flujos
build.py                   empaquetador a un solo HTML
docs/DOCUMENTACION.md      documentación funcional y técnica
```

Para agregar una opción a un menú (categoría, herramienta, vista, snap, filtro…) edita solo `js/config.js`.
