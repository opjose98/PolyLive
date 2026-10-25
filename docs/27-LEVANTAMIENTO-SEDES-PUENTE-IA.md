# 27 — Levantamiento de las sedes NARG29 por el puente (creación directa con IA) · informe

Fecha: 2026-10-25 · rama `audit/estable-campo` · tableta Android con el dev client `.qa`.

**Pedido del dueño:** actualizar la documentación y el resumen de herramientas, informar sobre el MCP (la creación
directa con una IA tipo Claude), levantar las sedes que faltaban con un corte longitudinal y otro transversal en todas,
revisar la altimetría de cada muro y columna por el MCP y en la app, repetir pruebas y auditoría, y cerrar con un
informe de qué está bien, qué está mal y qué se puede mejorar. Durante el trabajo: «el Decio tiene varios bloques,
deja cada bloque en un espacio separado».

## 1. Resultado en una línea

Las **15 sedes** con planos de arquitectura en `NARG29/FASE01` están levantadas en la app: 15 proyectos y
**22 espacios** (DECI en 7). Todas las sedes tienen un corte longitudinal y otro transversal guardados. De esos
espacios con muros, los 21 exportan IFC y la revisión con ifcopenshell da **0 alertas de altimetría**. El de exteriores
de DECI (solo suelos) exporta ahora sus losas sin IfcSpace (H-86, decidido por el dueño). Las pruebas pasan: 1041 tests, typecheck, lint
sin errores, knip y la validación de IFC/DXF.

> En la carpeta hay planos de arquitectura de 15 sedes. Las 4 primeras ya estaban, así que faltaban **11 y no 13**:
> ANDA, CEDR, SDGO, SALT, VERD, PALA, BUEN, DECI, COPA, LIMO y BOCA.

## 2. Creación directa con IA: el puente y el MCP

### Cómo funciona

```
Claude (Claude Code) ──MCP stdio──► polylive-bridge.mjs ◄──HTTP long-poll── app (dev client, __DEV__)
        └──── o HTTP POST /call (scripts) ──┘   127.0.0.1:8765    adb reverse tcp:8765
```

- **`scripts/bridge/polylive-bridge.mjs`** (sin dependencias) recibe comandos y los encola.
  - Por HTTP en 127.0.0.1:8765, con la cabecera `x-polylive-bridge: 1`, para que una página web no pueda mandarle comandos.
  - Con `--mcp`, también como servidor MCP: está registrado en `.mcp.json` y Claude lo ve como una herramienta más.
- **La app** (solo en desarrollo) pide el siguiente comando por long-poll y lo ejecuta con **sus propios casos de
  uso**: `application/bridge/bridgeCommands.ts`.
  - Lo creado por el puente pasa por la misma validación y el mismo deshacer que lo dibujado a mano.
  - Nace en el nivel y la fase activos, igual que con el dedo.
- **Comandos** (`help` los lista con sus argumentos):
  - Proyectos: `projects`, `createProject`, `createSpace` (nuevo), `open`.
  - Niveles: `levels`, `setLevels`.
  - Contenido: `objects`, `ops`.
  - Historial: `undo`, `redo`.
  - Exportar y vistas: `exportIfc`, `section`, `columnView`.
  - Pantalla: `ui` (fit, select, elevation, column, section, close, tool y `level`, nuevo).
- **`ops`** lleva una lista de operaciones: wall (con niveles por nombre, extremos `a`/`b` y estaciones), door, window,
  opening, column, floor (de recinto o libre, con huecos), void, vertical, station, sill, props, delete, split, merge,
  section y zone (nombre y uso del recinto).

### Cómo se levantó cada sede

1. **Leer el PDF** (pymupdf):
   - Las plantas de Revit vienen rasterizadas; solo las anotaciones son vectores.
   - Los ejes se leen de las burbujas: un círculo vectorial con su letra o número. La herramienta ahora detecta si
     las letras rotulan las líneas verticales o las horizontales (SALT las tiene al revés).
   - La escala se calibra con las cadenas de cotas: el raster sale a ~1:55 en lugar de 1:50, y DECI está a 1:75.
   - Los niveles, el cuadro de carpintería, los antepechos y las alturas salen de los cortes y las fachadas.
1. **Escribir la especificación** de la sede: muros por ejes con niveles de base y tope, culatas con su estación en la
   cumbrera, vanos con antepecho, columnas, recintos con nombre y uso, suelos libres y los dos cortes.
2. **Construir por el puente**: un script de 150 líneas manda los comandos y la app dibuja.
3. **Revisar**:
   - `objects` para las alturas de cada muro (con sus estaciones) y los recintos con su área.
   - Captura de la tableta (planta y cortes).
   - `exportIfc` y ifcopenshell para la altimetría. Se marcan:
     - muros de menos de 1,8 m;
     - dinteles por encima de su muro;
     - columnas fuera de rango.

Las herramientas de trabajo quedaron en el borrador de la sesión, no en el repo. Si se quieren conservar, conviene
llevarlas a `scripts/bridge/`.

### Qué tal funciona

- **Bien:**
  - Una sede de 15 a 25 muros, con vanos, columnas, suelos y cortes, se construye en menos de un minuto una vez
    escrita su especificación. Lo lento es leer el plano.
  - El resultado es idéntico al dibujado a mano: los mismos casos de uso, el mismo IFC y deshacer funciona.
  - La revisión por datos (`objects`, IFC) encuentra cosas que a ojo se escapan: H-85 apareció así, con culatas
    que salían planas en las puntas.
- **Hallazgos que salieron de usarlo** (en docs/25):
  - **H-84**: `setLevels` no creaba un nivel con el nombre viejo de la base.
  - **H-85**: en un muro, `a`/`b` no mandaban sobre `v`. SDGO y CEDR tenían mal las puntas de sus culatas; se
    reajustaron.
  - Faltaban dos cosas, que ya están:
    - `createSpace`, para las sedes con varios bloques;
    - `ui level`, porque los recintos se detectan en el nivel activo.
- **Límites:**
  - `ops` **no es atómico**: si falla la operación n, las anteriores quedan hechas. Cada paso se puede deshacer.
  - El puente solo existe en el dev client. El APK de campo no lo trae, a propósito.
  - **El plano rasterizado sigue siendo el cuello de botella.** Hay que leer a mano:
    - qué es muro y qué es mobiliario;
    - los vanos sin rótulo;
    - las filas sin texto en LIMO.
- **Riesgo:** el puente solo escucha en 127.0.0.1 y exige su cabecera. Aun así, ejecuta lo que le llegue por el túnel
  de adb. No debe dejarse corriendo con una tableta de campo conectada a otro PC.

### Para usarlo

```bash
node app-bim-typescript/scripts/bridge/polylive-bridge.mjs --mcp
```
```bash
adb reverse tcp:8765 tcp:8765
```

Con la app `.qa` abierta en un espacio, el agente ya puede pedir `help`, `projects` y `objects`. Tras editar el
código de la app, Metro la recarga y el puente sigue funcionando (H-81).

## 3. Resumen de herramientas de la app (estado al cierre)

| Grupo | Herramientas | Notas |
|---|---|---|
| Planta | Muro (por niveles: base y tope en cada extremo), Puerta, Ventana (con antepecho), Vano, Columna (rectangular o circular), Suelo por recinto, polígono, rectángulo o círculo, Vacío en suelo, Corte (guardado), Cota, Texto y dibujo técnico | Los recintos salen solos de los muros (T, cruces en X y grupos sueltos: nota «Topologia-de-recintos» de la bóveda) |
| Editar | Seleccionar y arrastrar, Dividir muro (con enganche a cruce, T y mitad), Partir por distancia, Unir tramos alineados, propiedades en la hoja (nivel, fase, material, estructural) | Partir y unir reparten vanos, mediciones y estaciones; si fallan a mitad, se deshacen solos |
| Alzado | Alzado del muro con estaciones (culatas en un solo muro), arrastre de vértices y del selector de niveles, cortes de lo que atraviesa el muro, alzado desdoblado de columnas | El alzado es un polígono; el área bruta es exacta |
| Niveles y fases | Por espacio: deslizadores Nivel, Superior e Inferior (calco), fase activa y «existente» | Lo nuevo nace en el nivel y la fase activos |
| Entregables | IFC del espacio y del proyecto (muros con perfil de alzado, losas con huecos, columnas, recintos), DXF, plano PDF, cuadro de áreas, registro fotográfico, paquete `.polylive` | Revisados con ifcopenshell y ezdxf |
| Desarrollo | Puente HTTP/MCP (§ 2) | Solo en el dev client |

## 4. Registro de sedes

Alturas en m. «Culatas» son muros con estación en la cumbrera. Las cifras de muros, vanos y losas son del IFC.

| Sede | Espacios | Niveles (base 0) | Muros (culatas) · puertas · ventanas · columnas | Recintos | Suelos libres | Supuestos y notas |
|---|---|---|---|---|---|---|
| BRIS | B1 Primer piso | ronda anterior | 11 (3) · 5 · 9 · 13 | 8 | Corredor, Exterior | Cortes añadidos |
| SUMB | B1 Aula | ronda anterior | 4 (2) · 1 · 6 · 0 | 1 | Andén existente | Cortes añadidos |
| MARA | B1 Primer piso | ronda anterior | 9 (3) · 5 · 11 · 10 | 3 | Placa, circulación, pasillo | Cortes añadidos |
| MACO | B1 Primer piso | ronda anterior | 11 (2) · 5 · 7 · 3 | 5 | Pasillo, circulación | Cortes añadidos |
| ANDA | B1 Primer piso | Muro 2,20 · Viga 2,40 · Cubierta 3,25 | 17 (2) · 7 · 8 · 0 | 7 | Andén, baño | Antepechos 0,85 supuestos (cocina y habitación) |
| CEDR | B1 Primer piso | +0,18 · +0,25 · Columnas 2,58 · Muro 2,64 · Cubierta 3,30 · 3,66 | 20 (2) · 10 · 8 · 3 | 10 | — | V1 1,00 de alto (la etiqueta dice 2,00/1,50); puertas de baños aproximadas; puntas de culata reajustadas (H-85) |
| SDGO | B1 Primer piso | Andén 0,14 · Placa 0,20 · Piso 1 0,34 · Piso 2 0,42 · Muro 2,32 · Cubierta 4,10 | 12 (2) · 6 · 5 · 20 | 6 | Circulación, placa | Puertas de 1,90 desde la base 0; puntas de culata reajustadas (H-85) |
| SALT | B1 Primer piso | Andén −0,20 · Muro 2,35 · Cubierta 2,95 · Cumbrera 3,65 | 16 (2) · 7 · 5 · 12 | 7 | Bodega (abierta), corredor, andén, placa | Cocina y dormitorio docente son un solo recinto (el tabique no cierra en el plano) |
| VERD | B1 Primer piso | Muro 2,17 · Viga 2,40 · Cubierta 3,40 | 18 (2) · 8 · 9 · 8 | 7 | Baños (abiertos), andén existente, placa deportiva, placa | Culatas B y E: 2,40 → 3,30 → 2,76 |
| PALA | B1 Primer piso | Exterior −0,10 · Muro 2,33 · Viga 2,57 · Cubierta 3,80 | 24 (1) · 11 · 5 · 1 | 10 | Pasillo aula, placa, circulación | Muro de la cumbrera a 3,68; cabinas cruzadas en X (H-83) |
| BUEN | B1 Primer piso | Andén 0,18 · Baños 0,20 · Interior 0,54 · Dintel 2,38 · Muro 2,74 · Viga 2,94 · Cubierta 3,94 | 22 (3) · 9 · 11 · 12 | 10 | Andén existente, acceso a baños | Muro norte de la cocina en diagonal; división liviana de la habitación abierta |
| DECI | B1 Primer piso · B1 Segundo piso · B2 Aulas y bodega · B3 Biblioteca y comedor · B4 Bodega · B5 Batería sanitaria · Exteriores | Muro 2,70/2,30 · Viga 2,60 · Losa 3,03 · Muro 2 5,12 · Cubierta 6,34 | 4 + 9 (2) + 6 + 7 + 4 + 9 · 17 puertas · 23 ventanas · 49 columnas | 1 + 4 + 3 + 2 + 1 + 5 | Placa deportiva, pasillo, placa disponible, circulación exterior (en Exteriores) | Un espacio por bloque y piso con **cotas absolutas** (los espacios encajan). Ejes 11 a 14 a escala. Franja de ventanas de B1 supuesta 1,60 × 0,90. Exteriores: losas sin IfcSpace (H-86) |
| COPA | B1 Primer piso | Muro 2,08 · Viga 2,28 · Cubierta 3,10 | 9 (2) · 4 · 7 · 13 | 3 | Andén | Sótano (−2,03) y escaleras no levantados; V3 y V4 sin medida (1,50 supuestas) |
| LIMO | B1 Primer piso | Cubierta baja 2,02 · Muro 2,40 · Cubierta 3,35 | 14 (2) · 4 · 3 · 0 | 4 | Orinal, circulación exterior (con huecos) | Filas sin texto: y medida a escala del plano |
| BOCA | B1 Primer piso | Muro 2,10 · Viga 2,30 · Cubierta 1 2,68 · 2 3,28 · 3 3,55 | 17 (2) · 6 · 5 · 4 | 7 | Circulación exterior, acceso a cocina | Culatas D y G: 2,30 → 3,45 → 2,58 |

Todas las sedes tienen guardados el corte longitudinal y el transversal. En las nuevas siguen las líneas de corte del
plano cuando las hay (A-A, B-B, C-C…). En las cuatro primeras pasan por el centro del recinto mayor.

## 5. Revisión de altimetría

- **Por el puente:** se leyeron las alturas de cada muro con sus estaciones. Ejemplos: VERD 2,40 → 3,30 → 2,76;
  BOCA 2,30 → 3,45 → 2,58; DECI B1 2.º piso 5,12 → 6,24 → 5,12. Se comprobó que las culatas suben a la cumbrera del
  corte del plano, 0,10 bajo la teja.
- **En la tableta:** se miraron la planta de cada sede y un corte por sede nueva (SALT, VERD, BUEN, DECI, BOCA y MARA).
  - Las culatas llegan a la cota del corte.
  - Los dinteles quedan bajo la viga.
  - Los suelos van en su nivel (DECI B1 a +3,03).
- **IFC** de los 21 espacios exportables con ifcopenshell: **0 alertas**. Se buscaban:
  - muros fuera de [1,8; 7] m;
  - dinteles sobre su muro;
  - columnas fuera de rango.
- Los IFC quedaron en el borrador de la sesión (`ifc_final/`). No van al repo: son datos de obra.

## 6. Hallazgos de la ronda (detalle en docs/25)

| H | Qué | Estado |
|---|---|---|
| H-82 | El contorno de un segundo grupo de muros salía como recinto | Corregido (commit anterior) |
| H-83 | Dos muros cruzados en X no cerraban recintos | Corregido, con test |
| H-84 | `setLevels` no creaba un nivel con el nombre viejo de la base | Corregido, con test |
| H-85 | El puente ignoraba `a`/`b` si venía `v` (puntas de culata) | Corregido, con test; SDGO, CEDR y VERD reajustadas |
| H-86 | Espacio sin muros en la base: no cerraba su Recinto. Espacio sin muros: no exportaba | Corregido, con tests: el Recinto toma el nivel más bajo con muros; un espacio solo con suelos exporta sus losas sin IfcSpace (decidido por el dueño) |

## 7. Pruebas y auditoría

- Jest: 1041 pasan y 4 quedan pendientes («todo»), en 86 suites.
- Typecheck en modo estricto: limpio.
- ESLint: 0 errores. Los 98 avisos son los mismos que había antes de esta ronda.
- Knip: limpio.
- Muestras IFC y DXF validadas con ifcopenshell y ezdxf.
- Tests nuevos: cruce en X; `setLevels` con el nombre viejo de la base; extremo `a` sobre `v`; `createSpace`;
  Recinto de un espacio sin muros en la base. Cada uno falla sin su arreglo: se comprobó.
- **Revisión del código de la ronda** (diff completo):
  - El cruce en X se calcula con la geometría original del muro nuevo y solo con aristas rectas.
  - Lo que toca un extremo sigue siendo una T: se excluye a 5 cm de los extremos.
  - El nivel del Recinto solo cambia si la base no tiene muros. La prueba que protegía «trazar en otro nivel no
    reescribe la base» se mantuvo, ahora con muros en la base.
  - Un cast `as never` se cambió por el tipo de id del dominio.
  - El código nuevo no añade avisos de lint.

## 8. Informe final

### Qué está bien

- **El modelo de altura aguanta sedes reales**: niveles por nombre, culatas en un solo muro con estación, suelos a
  su cota y dos pisos con cotas absolutas (DECI B1). El IFC sale coherente: 21 espacios con 0 alertas.
- **La detección de recintos** ya cubre los casos de los 15 planos: T, cruces en X, grupos sueltos y tabiques
  abiertos (estos no cierran, como debe ser).
- **La creación directa con IA** es real y útil: el mismo camino que la mano, deshacible, revisable por datos y
  rápido de construir.
- **La calidad del código se mantiene**: estricto, sin código muerto, cada arreglo con su test.

### Qué está mal o queda abierto

- El IFC de los exteriores de DECI (H-86) está probado con el serializador real, pero **no se exportó desde la tableta**:
  se desconectó del USB antes de la prueba.
- **Las lecturas de plano tienen supuestos**, listados en § 4: alturas de ventanas sin cota, ventanas sin rótulo
  (COPA), filas a escala (LIMO, DECI 11–14) y la franja de B1 en DECI. **Hay que confirmarlos en obra**: el
  levantamiento sirve de base, no de medición.
- No se levantaron el sótano de COPA, las escaleras ni los andenes que no estaban acotados.
- `ops` del puente no es atómico. Un lote que falla a medias deja hecho lo anterior: se deshace con `undo`.
- El APK release sigue sin compilar en este PC: Gradle choca con el antivirus o el indexador (docs/26, nota del build).

### Qué se puede mejorar

1. **`ops` atómico**: el lote dentro de un solo paso de deshacer, o una opción `{ atomic: true }`.
2. **Llevar al repo** las herramientas de lectura (`axes.py`, `build_site.py`, `check_all.py`) como
   `scripts/bridge/`, con una especificación de sede documentada. La próxima sede se haría sin rehacerlas.
3. **Leer los vanos del plano de carpintería** de forma automática: el cuadro es texto y daría ancho, alto y antepecho
   de cada V o P.
4. **Un cuadro de alertas de altimetría en la app**: lo que hoy revisa `check_all.py` (dinteles sobre el muro,
   columnas fuera de rango) también podría verse en la pantalla.
