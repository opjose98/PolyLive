# 14 — Modos de trabajo, orientación y navegación

> Estado: **M1 y M2 implementados** (ramas `feat/ui-m1-modos`, `feat/ui-m2-topografia`). M2b–M4 y F6 planificados (ver §7).
> Topografía en detalle: [15-TOPOGRAFIA.md](15-TOPOGRAFIA.md).
> Código: `app-bim-typescript/src/application/workspace/catalog.ts`, `src/state/workspaceStore.ts`,
> `src/ui/workspace/FabView.tsx`, `src/ui/workspace/AxisGizmo.tsx`, `src/ui/canvas/PlanCanvas.tsx`,
> `src/domain/geometry/handedness.ts`.

## 1. Qué es un modo

El **modo de trabajo** decide *qué se hace* sobre el mismo modelo del espacio. Se elige en el **FAB de vista**
(esquina superior derecha). El botón muestra siempre el modo activo con su ícono y su color.

| Orden | Modo | Color | Para qué | Planta | Alzado | Edita el modelo |
|---|---|---|---|---|---|---|
| 1 | **Levantamiento** | ámbar `#FF8F00` | Levantar muros, vanos, columnas (lo trabajado en F0–F5) | ✔ | ✔ | ✔ |
| 2 | **Topografía** | verde `#2E7D32` | Coordenadas reales, mojones, mapa, norte | ✔ | — | ✘ (solo mojones/puntos) |
| 3 | **Avance** | azul `#1E88E5` | Pintar avance de obra y cuantificar | ✔ (suelos) | ✔ (caras de muro) | ✘ (su propia capa) |
| 4 | **Revisión** | morado `#8E24AA` | Marcas y comentarios para enviar | ✔ | ✔ | ✘ (su propia capa) |

Reglas:

- **Siempre arranca en Levantamiento** (el modo no se guarda: menos memoria y menos sorpresas).
- **Topografía solo en planta**: si se abre un alzado estando en Topografía, se vuelve a Levantamiento.
- **Avance solo si hay objetos**: sin objetos el modo aparece atenuado y avisa por qué.
- Cambiar de modo **suelta la herramienta** activa y cierra paneles: el cromo cambia completo.
- Las antiguas *vistas* Estructural y Coordinación pasaron a ser **capas** (FAB de vista → Capas).

## 2. Todo el cromo es contextual al modo

Se reutilizan los mismos componentes (FAB +, FAB de vista, BPC, drawer ⋮); cambia su contenido:

| Pieza | Levantamiento | Topografía | Avance | Revisión |
|---|---|---|---|---|
| FAB + | Acotado, Dibujo, Arquitectónico, Estructural, Auditoría | Puntos (Mojón, Punto GPS, Coordenada), Medir (Inverso, Área, Replanteo) | Pincel, Borrador, Relleno, Rectángulo | Trazo libre, Flecha, Rectángulo, Texto, Nube |
| Filtros | Muros, Columnas, Cotas, Fotos | Muros, Columnas, Vértices, Mojones, Rótulos de coordenadas, Cuadrícula de coordenadas, Mapa, Norte | Actividades del corte, Cortes anteriores, Cotas | Comentarios abiertos, Resueltos, Cotas |
| Drawer ⋮ | Datos, modo y capas, zoom, snap, tema, cuadrícula, escala | + Configuración topográfica | + Actividades y cortes | + Comentarios |

Las herramientas aún sin fase (Medir de Topografía, Avance, Revisión) aparecen **deshabilitadas** ("próximamente").
En Topografía ya funcionan Mojón, Punto GPS y Coordenada (M2).
Fuente de verdad: `categoriesFor(mode, view)` y `filtersFor(mode, view)` en `catalog.ts`.

## 3. Menús

- **☰ (izquierda)** — herramientas y configuración de la **app**: galería, exportar, operador, ajustes y respaldos…
- **⋮ (derecha)** — configuración **contextual del proyecto** según el modo activo. En Topografía muestra
  sistema, amarre, ajuste y segundos del GPS (`TopographyPanel`). La antigua pantalla Topografía del ☰
  (`SurveyControlScreen`) se eliminó en M2: se fusionó en el modo.

## 4. Orientación: ejes, giro y norte

### 4.1 Coordenadas locales y la Y

El modelo guarda la planta con **Y hacia abajo** (como la pantalla). Las coordenadas **locales** del proyecto —las
que muestran los ejes y sobre las que se calcula la topografía— usan **Y hacia arriba**:

```
X_local = x_modelo      Y_local = −y_modelo      Z_local = cota
```

La conversión vive en `domain/geometry/handedness.ts` (`toLocal`, `wallForExport`, `columnForExport`,
`roomForExport`) y se aplica **en el borde**: al exportar IFC y DXF y al calcular coordenadas reales. Los datos
guardados no cambian.

> **Bug corregido en M1:** IFC y DXF escribían la Y tal cual, así que todo llegaba a Revit y AutoCAD
> **espejado norte-sur** respecto de lo que se veía en el teléfono.

### 4.2 Ejes XYZ

Esquina inferior izquierda, en planta y en alzado (`AxisGizmo`):

- **Planta**: X roja, Y verde, Z azul (⊙, hacia el observador). Gira con la vista. **Tocarlo endereza la vista** (0°).
- **Alzado**: X a lo largo del muro (a la izquierda en el lado B, que es espejo) y Z hacia arriba.

### 4.3 Giro del lienzo

- **Dos dedos girando** (a la vez que el pellizco de zoom). El punto bajo los dedos no se mueve.
- **Enganches** (con háptica): 0°, 90°, 180°, 270° y los ángulos notables que pase la pantalla
  (`rotationSnaps`, p. ej. el norte en M2), a menos de 5°.
- **Solo visual**: `CanvasTransform.rotation` (rad) nunca modifica el modelo. `worldToScreen`/`screenToWorld`,
  el encuadre, la selección y la rejilla (shader) ya lo tienen en cuenta.

### 4.4 Norte

Con el proyecto amarrado (M2), la aguja **N** apunta al norte de cuadrícula real (`northFromLocalY`) en Topografía y
en Levantamiento (filtro "Norte"), y el giro de dos dedos engancha en "norte arriba" (`northUpViewRotation`). Sin
amarre no se dibuja aguja.

## 5. Navegación (resumen)

```
Operador → Proyectos → Espacios → Levantamiento (planta)
                                     ├─ FAB de vista → modo (Levantamiento / Topografía / Avance / Revisión)
                                     ├─ doble toque en un muro → Alzado (no en Topografía)
                                     ├─ ☰ → pantallas de la app (se deslizan encima)
                                     └─ ⋮ → configuración del proyecto según el modo
Atrás (Android): pantalla del ☰ → alzado → panel/herramienta → espacios
```

## 6. Decisiones de diseño (entrevista de 30 preguntas, 2026-09-29)

Resumen: modos con catálogo propio reutilizando los componentes; Topografía con MAGNA-SIRGAS (Oeste-Oeste 3114,
Oeste 3115, Bogotá 3116, Este 3117, Este-Este 3118), Origen Nacional CTM12 (9377) y geográficas (4686); amarre por
origen+azimut, GPS o ≥2 mojones; el modelo siempre en locales; mojones por toque, digitados o GPS promediado (30 s
configurables) con biblioteca común; mapa gratuito descargable; Avance con pincel sobre suelos y caras de muro,
catálogo de actividades, cortes por fecha y reporte PDF/CSV; Revisión con marcas y comentarios exportables.
Detalle completo en el plan del proyecto.

## 7. Fases siguientes

| Fase | Contenido |
|---|---|
| M2 ✔ | Topografía (núcleo): georreferencia por proyecto (proj4), asistente de primera apertura, mojones, coordenadas en rótulos/tabla/toque |
| M2b | Mapa de fondo con descarga, cuadrícula de coordenadas, inverso/área/replanteo, CSV/KML, IFC georreferenciado (IfcMapConversion) |
| F6a | Herramienta Suelo (base de Avance en planta) |
| M3 | Avance |
| M4 | Revisión |
| F6b | Cota, Texto, Etiqueta, Coordenada, Línea, Polígono, Vano, Viga, Cercha, Correa |

**Abierto:** licencia de mapas offline — los gratuitos (OSM, Esri) prohíben la descarga masiva; evaluar servicios
abiertos del IGAC o un proveedor con plan gratuito que la permita (antes de M2b).
