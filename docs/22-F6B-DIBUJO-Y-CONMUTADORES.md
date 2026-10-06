# 22 — F6b: dibujo técnico, foto en alzado y conmutadores

Rama `fix/qa-telefono`, commit `5297461` (sobre `2a2116e` pincel, `43dba05` limpieza).
Estado: `tsc` limpio, **903 tests** en verde (4 todo). **Falta la prueba en teléfono** (ver abajo).

## Herramientas completadas

| Herramienta | Planta | Alzado | Cómo se usa |
|---|---|---|---|
| Cota | ✅ | ✅ | Arrastrar de un punto a otro; en planta se pega a nodos (y vértices/puntos medios si están activos). Píldora *Separación*. |
| Texto | ✅ | ✅ | Tocar → diálogo de texto. Píldora *Tamaño* (pt). |
| Etiqueta | ✅ | — | Tocar un muro, columna, vano o recinto: propone su texto (espesor, largo, material, área…) y dibuja la línea de referencia. |
| Coordenada | ✅ | ✅ | Tocar: rótulo N/E si hay amarre, X/Y locales si no. |
| Línea | ✅ | ✅ | Arrastrar. |
| Polígono | ✅ | ✅ | Tocar vértices; cerrar tocando el primero o con *Cerrar polígono*; *Quitar punto*. Muestra el área. |
| Viga | ✅ | ✅ | Arrastrar el eje. Planta: doble línea de trazos y "V 30×40"; alzado: silueta llena bajo la línea. |
| Cercha | ✅ | ✅ | Arrastrar de apoyo a apoyo; píldora *Peralte*. |
| Correa | ✅ | ✅ | Arrastrar el eje; *Base* y *Peralte*. |
| Vano (planta) | ✅ | (ya existía) | Tocar un muro: hueco genérico del ancho de la píldora; se deshace. |
| Foto (alzado) | — | ✅ | Tocar la cara: abre la cámara y ancla la foto a esa cara y punto. Se ve en el alzado y en planta sobre el eje del muro. |

Sin herramienta, tocar un elemento de dibujo lo selecciona; la BPC ofrece **Dibujo** (hoja con longitud/área,
texto, tamaño, separación, base, peralte y *Borrar* con deshacer). Editar solo en Levantamiento.

Deshacer/rehacer (pulgar y barra) siguen a la herramienta de dibujo activa o al elemento seleccionado.
El atrás de Android cierra, en orden: diálogo de texto, hoja, último punto del polígono, selección.

## Conmutadores que estaban ⚠️

- **Snap → Vértice**: esquinas de los recintos (cara interior y eje). **Punto medio**: centro del eje de cada muro.
  Valen al dibujar muros, al arrastrar extremos y en el dibujo técnico. En la esquina y en el drawer ⋮.
- **Cuadrícula → Rotación**: activa/desactiva el giro con dos dedos (por defecto activo). Apagarla deja el norte arriba.
- **Escala → Acotado**: muestra/oculta las cotas. **Anotativa**: los textos miden su tamaño en pt *en el papel*
  a la escala 1:N, así que crecen y decrecen con el zoom (acotado entre ×0,4 y ×6).
- **Capas → Topografía** (por defecto activa): mojones visibles fuera del modo Topografía.
  **Coordinación**: las observaciones de Revisión se ven también en los demás modos (planta y alzado).

## Revisión de código

- Archivos sin importar: solo `native/ble/HuepaDeviceManager.ts` (láser BLE, con tests). Se conserva: falta su
  interfaz, que ya es posible con el *dev client*.
- Sin "próximamente" en esquinas; el FAB sigue atenuando lo que no tenga binding (hoy, ninguno de planta/alzado:
  lo verifica `workspace.test.ts`).

## Pendiente

1. **Prueba en teléfono de todo** (las correcciones 1–15 de docs/21 y esto): instalar `polylive-dev.apk`,
   `adb reverse tcp:8081 tcp:8081`, `npx expo start --dev-client`, recorrer cada herramienta en el proyecto *QA T0-M4*.
2. Exportar el dibujo técnico a DXF/IFC (líneas, cotas y textos a DXF; vigas a `IfcBeam`).
3. Interfaz del láser BLE.

## Prueba en teléfono (2026-10-05, dev client, proyecto *QA T0-M4*)

**Funcionó:** Cota (se pega a nodos y, con el snap activo, a vértices), Texto, Etiqueta, Coordenada
(N/E reales), Línea, Polígono (cerrar, área), Viga (planta y alzado), Cercha y Correa (alzado), Vano en
planta con deshacer/rehacer, selección + hoja + Borrar con deshacer, foto en alzado (cámara, marcador
en la cara, en planta sobre el eje, visor), Acotado, Anotativa, capas Topografía y Coordinación,
persistencia tras reiniciar. Avance: pincel (trazo redondo y círculo bajo el dedo, celdas finas),
rectángulo, borrador, relleno y deshacer por modo. Revisión: flecha, hoja con hora local, borrar.
Topografía: inverso Az 64°59'31" → rumbo N 65°00' E (sin 60').

**Fallos encontrados y corregidos (commit `fcc0de3`):**
1. Deshacer tras borrar un elemento de dibujo deshacía otra cosa (dos historias) → historia única.
2. En alzado el trazo iba segundos atrás del dedo (cada punto regrababa el muro) → capa viva.
3. En Avance, el toque de Relleno seleccionaba una línea del dibujo → solo selecciona sin herramienta.
4. La capa Coordinación no mostraba nada fuera de Revisión → corregido.
5. La etiqueta quedaba encima del objeto, sin línea de referencia → al lado, con punto y línea.
6. Detalles: título de la BPC con el elemento, género en "borrado/a", ayuda de Correa, cara del alzado en el visor.

**Verificación en teléfono de los arreglos (2026-10-06):** deshacer unificado (borrar línea → deshacer la
devuelve), título de la BPC ("Línea · 1.55 m"), visor con la cara del alzado. Se hallaron y corrigieron dos más:
7. Al abrir el espacio el dibujo no aparecía hasta otro redibujado (el nivel llegaba tarde al controlador).
8. Tocar una foto que tenía una cota cerca seleccionaba la cota → las fotos tienen prioridad sin herramienta.

**Pendientes menores:** rótulos que se salen por el borde de la pantalla (coordenadas cerca del borde);
cotas del usuario superpuestas a las cotas automáticas de muro; rotación con dos dedos no probada
(adb no hace multitoque; el conmutador sí).

## Exportación del dibujo técnico (rama `feat/f6b-export-dibujo`)

**DXF** (planta del nivel base, `exportPlanDxf`): cotas explotadas (líneas de referencia, línea de cota,
trazos a 45° y valor), textos, etiquetas con línea al objeto, coordenadas (N/E si hay amarre, X/Y si no),
líneas, polígonos con su área y vigas en trazos (`DASHED`) con su sección. Capas AIA/NCS:

| Capa | Contenido |
|---|---|
| A-ANNO-DIMS | cotas |
| A-ANNO-TEXT / A-ANNO-TAGS | textos / etiquetas |
| V-ANNO-COOR | coordenadas |
| A-DETL-GENF / A-AREA | líneas / polígonos |
| S-BEAM / S-TRUS | vigas / cerchas (eje) |

Los textos miden en el papel: alto (m) = mm × N / 1000 a escala 1:N (la de la esquina). Lo dibujado en
alzado no va al plano de planta.

**IFC**: viga → `IfcBeam`; cercha → `IfcMember` `.CHORD.` (cordones) y `.STRUT.` (alma, barras de
10×10 cm); correa → `IfcMember` `.PURLIN.`. Planta: cara superior en el nivel de encima (o el tope de los
muros si es el último). Alzado: a lo largo del muro y a la altura dibujada sobre su base; la correa sale
perpendicular por el lado dibujado con 1 m supuesto (`LengthAssumed` en el pset).

**Corregido de paso:** en el DXF los contornos y rótulos de recinto salían espejados norte-sur respecto
a los muros (no se pasaban a Y arriba).

**También corregido:** los textos con caracteres fuera de ASCII ("·", "ñ", "ó", "m²") salían ilegibles
en el DXF ("Â·"): R2000 no lee UTF-8. Ahora van como `\U+XXXX`.

Tests: `test/drafting/draftExport.test.ts` (entidades, capas, DASHED, Y arriba, cotas 3D de vigas y
correas, lint IFC4).

**Prueba en teléfono (2026-10-06, proyecto QA T0-M4):** DXF "4 muros, 1 hueco, 10 elementos de dibujo";
IFC "1 nivel, 1 recinto, 2 vigas, 25 barras, georreferenciado". Validados fuera de la app:
ezdxf lee el DXF R2000 sin errores (capas, DASHED, recinto del mismo lado que los muros, textos
legibles); ifcopenshell: IFC4 sin problemas de esquema, 2 IfcBeam y 25 IfcMember (10 CHORD,
14 STRUT, 1 PURLIN) con geometría válida; viga de planta a 2,40–2,80 m (tope del muro).
Falta abrirlos en AutoCAD y Revit.
