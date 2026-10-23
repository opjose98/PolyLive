# 26 — Versión estable para campo (ronda 2) · informe final

Fecha: 2026-10-22 · Rama: `audit/estable-campo` (desde `main` @ `be14e74`, sin push) · Equipo: Lenovo TB370FU
(1840 × 2944, vertical) · Base: `AUDITORIA_INTEGRAL_POLYLIVE.md` (histórica), plan `docs/23`, criterio `docs/24`,
matriz `docs/25` (ronda 1 y § 6 ronda 2).

## 1. Veredicto: ¿lista para campo?

**Sí, para la prueba de campo del dueño**, con la lista del § 7. No quedan bloqueantes ni altos abiertos: los seis
encontrados en esta ronda están corregidos y verificados en la tableta — H-25 (trazo del alzado), H-53 (menú
fantasma) y, al levantar un plano real (§ 8), H-52 (transacciones que se deshacían entre sí), H-64 (el aula
desaparecía con un muro colgante) y H-65 (14 campos de texto no guardaban). Quedan sin verificar en equipo, y por eso van en la lista a mano: el **giro a horizontal**, los **gestos de
dos dedos**, el **GPS al aire libre** y el **láser**. Tres decisiones de producto nuevas (H-45, H-54, H-67) son medias y no
impiden el uso.

## 2. Mediciones (antes → después, medidas en esta sesión)

| Control | Línea base (`be14e74`) | Cierre (`audit/estable-campo`) |
|---|---|---|
| `npm run typecheck` | 0 errores | 0 errores |
| `npm run lint` | 0 errores · 97 avisos | 0 errores · 98 avisos |
| `npx jest --ci` | 79 suites · 974 ✓ · 4 todo | 82 suites · 985 ✓ · 4 todo |
| IFC/DXF (`validate_exports.py`) | 2 IFC + 1 DXF válidos | 2 IFC + 1 DXF válidos (mismas entidades) |
| `npx knip` | 1 export + 13 tipos sin uso + 3 avisos de config (docs/23 decía «limpio») | limpio |
| `as unknown as` / `catch {}` vacíos / `console.log` / TODO | 1 / 0 / 0 / 0 | 1 / 0 / 0 / 0 |
| `src/` | ~43 000 líneas, 240 archivos | ~43 000 líneas, 240 archivos |

Diferencias con lo que decían los docs: knip no estaba limpio; `SurveyScreen` tiene 1.498 líneas (docs/23: 1.462);
la bóveda `estado-y-capitulos` estaba en 2026-10-03; el README decía docs 01–13.

## 3. Cambios por tema

**Reglas y entorno.** `CLAUDE.md` en la raíz (estructura, scripts, convenciones, flujo rama/PR, build local del APK
y del dev client en Windows, remedio de bloqueos de Gradle). `scripts/qa/adb.sh` sin coordenadas de otro equipo y con
el reenvío de Metro. `graphify-out/` ignorado.

**Correcciones con verificación en la tableta.**
- H-25 (alto) — En el alzado, cercha, correa, viga, cota, línea y marcas se volvían paneo de cámara y la vista
  quedaba vacía: los callbacks de `Gesture.*` se convierten en worklets y cada uno tenía su copia de las variables
  `let`. El estado del gesto pasa a `useRef` (como `PlanCanvas`); test `test/ui/gestureState.test.ts`.
- H-53 (alto) — Tras el selector de carpetas el menú ☰ quedaba dibujado abierto, sin responder, y los toques
  atravesaban al lienzo. El cajón cerrado se desmonta (`SideDrawer`).
- H-10, H-27 — Campo de escala recortado; casillas de Filtros fuera del panel.

- H-52 (P1) — Dos transacciones de expo-sqlite solapadas: el ROLLBACK de una deshacía la otra. Ahora van en cola.
- H-64 (P1) — Un muro colgante hacía descartar el recinto más grande como si fuera la cara exterior. Se podan
  los filamentos antes de buscar caras.
- H-65 (P1) — Nombre, uso y notas del recinto, comentario de la observación y otros 10 campos de texto no
  guardaban lo tecleado. Campos no controlados y `commitTracker` con test.

**Correcciones con test.** H-46: todo fallo que ve el usuario queda en «Enviar diagnóstico» (`reportFailure`); fue
lo que permitió ver H-52 en la tableta.
**Correcciones menores.** H-47 (permiso `SYSTEM_ALERT_WINDOW` fuera de release), H-48/H-55 (textos «teléfono» y
«celular» → «equipo»).

**Limpieza neutra.** knip limpio de nuevo; 61 líneas vacías en imports (restos del barrido anterior); `withAlpha`,
centroide de rótulos y `segmentsIntersect` con una sola copia. Sin cambios de comportamiento: tests e IFC/DXF iguales.

**Documentación.** `docs/25` § 6 (ronda 2), bóveda (`estado-y-capitulos`, `registro-de-diagnostico`,
`capa-viva-y-camara`, trazabilidad), README. `Claude outputs/` archivado en `docs/archivo/claude-outputs/` (OK del
dueño). `docs/23` § 6 (plan de importar IFC de Revit, de otra sesión) incluido por indicación del dueño.

Commits de la rama: ver `git log main..audit/estable-campo` (atómicos, uno por cambio).

## 4. Matriz de resultados (resumen)

Detalle fila por fila en `docs/25` § 6.

| Probado en la tableta (ronda 2) | Resultado |
|---|---|
| Operador, proyectos (crear con disciplina, editar, eliminar), espacio | ✅ |
| Muros, recinto, puerta, ventana, reabrir el espacio | ✅ (al reabrir la vista no se encuadra: H-59) |
| Foto en planta y en la cara del muro; permisos de cámara y ubicación al usarlos | ✅ sin reinicio de la actividad |
| Exportar IFC espacio/proyecto, plano PDF, CSV de áreas, registro fotográfico, paquete, PDF/CSV de avance | ✅ carpeta recordada; IFC validados; PDF revisados a ojo (sin vanos: H-54) |
| Importar `.polylive` con reemplazo | ✅ |
| Alzado: encuadre, cercha (H-25), foto, nube de revisión, pincel de avance | ✅ |
| Topografía: CTM12 y Oeste, amarre por GPS, por mojones (RMSE 0,002 m), filtros | ✅ |
| Avance: cortes, actividades (editar, agregar, quitar), PDF | ✅ |
| Temas Oscuro y Alto contraste en Galería, Exportar, Ajustes, Operador | ✅ |
| Cambiar de modo con un panel abierto (H-40), menú ☰ (H-34), selector de niveles (H-13) | ✅ |

| No probado (y por qué) | Dónde queda |
|---|---|
| Giro a horizontal (J01) | Cambiar `user_rotation` es un ajuste del sistema: requiere autorización; o girar a mano (§ 7) |
| Pinch, rotación del lienzo, gizmo (B17–B19, F17) | adb no simula dos dedos (§ 7) |
| Deshacer manteniendo pulsado (B03) | § 7 |
| Hojas que se desplazan: suelo y notas del recinto (D09, D11) | § 7 |
| GPS al aire libre, replanteo real, láser BLE | § 7 |
| Ventana angosta de tableta (multiventana) | § 7 |
| Revit (abrir el IFC), mapa de fondo | Fuera de alcance (licencias) |

## 5. Decisiones pendientes del dueño (opciones y recomendación)

| ID | Pregunta | Opciones | Recomendación |
|---|---|---|---|
| H-15 | ¿Muro punto a punto encadena? | (a) cada muro dos toques, como hoy · (b) encadenar desde el último punto, con botón «Terminar» · (c) encadenar solo si se mantiene la herramienta | **(b)**: es lo que espera quien levanta un recinto; el test que documenta «no encadena» se cambia a la vez |
| H-18 | Cota entre nodos distintos | (a) alineada a los nodos, como hoy · (b) ortogonal (horizontal/vertical según el arrastre) · (c) alineada, con alternar a ortogonal en la hoja | **(c)**: no rompe las cotas existentes y da la ortogonal cuando se pide |
| H-45 | Importar un paquete cuyo código BIM ya usa otro proyecto | (a) dejarlo duplicado, como hoy · (b) renombrar el importado (BIM002 → BIM002-2) y avisar · (c) rechazar la importación | **(b)**: no pierde datos y mantiene la unicidad del código |
| H-54 | Puertas, ventanas y vanos en el plano PDF y en el PDF de avance | (a) como hoy, sin vanos · (b) dibujar los vanos (hueco y arco de puerta) en `planSvg` | **(b)**: el plano entregable debe coincidir con el IFC y el DXF (en NARG29 faltan 14 vanos) |
| H-67 | Al medir, ¿la T de un tabique sigue la posición relativa o la absoluta sobre el muro que se alarga? | (a) relativa, como hoy (el tabique se inclina) · (b) absoluta al medir, relativa al arrastrar · (c) absoluta siempre | **(b)**: medir no debe torcer muros ortogonales; arrastrar a mano conserva el comportamiento actual |
| H-70 | ¿Los vanos sin carpintería salen en el IFC? | (a) no, como hoy (solo viven en el alzado) · (b) `IfcOpeningElement` sin relleno, recortando el muro · (c) además, una `IfcDoor` «vano» para que Revit lo liste | **(b)**: el hueco existe en obra y en Revit; sin relleno no inventa una carpintería |

## 6. Hallazgos abiertos

P1: ninguno · P2: H-45, H-54, H-67 y H-70 (decisión), H-66 (sentido de apertura de puertas) · P3: H-50, H-51, H-52, H-56 a H-63, H-68, H-71 a H-73, y H-14 intermitente (lista en `docs/25`
§ 6.3).

## 7. Qué está instalado y lista para tu prueba en campo

**Instalado en la tableta:** dev client `com.polylivebim.qa` (debug, `assembleDebug`) con Metro desde el PC; carga el
código vivo de la rama (commit final de esta sesión). Para la prueba sin PC: APK release `.qa` (ver nota del build al
final de este documento). La app real `com.polylivebim` no se tocó.

**Lista de verificación (marca cada una):**

1. [ ] **Giro**: con el editor abierto y un muro seleccionado, gira la tableta a horizontal y de vuelta: el editor se
   re-mide, la selección se conserva, las hojas quedan centradas (J01).
2. [ ] **Dos dedos**: pellizca para acercar/alejar; gira el lienzo con dos dedos (debe enganchar a 0/90/180/270) y toca el
   gizmo para volver al norte (B17–B19); en Topografía la flecha N sigue al norte (F17).
3. [ ] **Láser / medida real** (docs/24): recinto de unos 4 × 5 m dibujado a ojo; mide con láser las 4 caras interiores
   y la diagonal; ingrésalas con «Medición láser»; cada cara < 1 cm, área ±0,5 %, diagonal dentro de 1 cm + 1 mm/m.
   Anota el error de cierre en docs/24.
4. [ ] **GPS al aire libre**: Topografía → Amarre → GPS en un punto despejado (precisión < 5 m); luego Replanteo hacia un
   mojón conocido.
5. [ ] **Hoja del recinto**: espesor del suelo, quitar y poner suelo, notas (D09, D11), desplazando la hoja con el dedo.
6. [ ] **Deshacer mantenido**: en la planta, mantén pulsado el botón flotante de deshacer: debe rehacer (B03).
7. [ ] **Rótulos del FAB**: toca el TEXTO (no el círculo) de «Foto», «Muro», «Puerta»: cada uno debe activar su
   herramienta (H-14).
8. [ ] **Exporta y abre en el PC**: IFC del proyecto en Revit (posición y giro con amarre) y DXF en AutoCAD.
9. [ ] **Respaldo real**: «Respaldar proyecto» a Drive; en otro equipo, «Importar proyecto».
10. [ ] **Uso continuo**: una hora de levantamiento con fotos; si algo falla, Ajustes → «Enviar diagnóstico».

## 8. Prueba con un plano real: NARG29 · BRIS · B1 (tableta en horizontal)

Plano: `NARG29-BRIS-B1-ARQ-A1 01-04-V02.1.pdf` (aula, cocina, bodega abierta, dos baños; ejes A–F × 1–5; 5 puertas y
9 ventanas con tabla de carpintería). Se levantó en PolyLive como en obra: muros a ojo por ejes, medidas con
«Medición láser» (ingreso manual), recintos nombrados, vanos con sus medidas de la tabla, y exportación.

**Resultado:** 12 muros, 4 recintos (Aula 69,53 m² = 10,15 × 6,85 interior del plano; Cocina 19,03; Baños 1,34 y
1,33), 5 puertas y 9 ventanas con ancho y alto exactos de la tabla. IFC4 válido (12 `IfcWall`, 5 `IfcDoor`,
9 `IfcWindow`, 4 `IfcSpace` con `Qto`), CSV de áreas y plano PDF.

**Tres fallos P1 aparecieron solo con un plano real y quedaron corregidos** (H-52, H-64, H-65; § 3).

### Herramientas que se adaptan bien

- **Muro punto a punto con enganche a nudo y a eje**: las esquinas y las T salen cerradas sin ajustar a mano.
- **Detección de recintos**: aula, cocina y los dos baños aparecen solos al cerrar los muros.
- **Medición láser (ingreso manual)**: muestra interior / exterior / eje actuales, aplica la cara interior y lleva el
  muro al eje con el espesor; el aula quedó exactamente en las medidas interiores del plano.
- **Puerta y ventana por toque sobre el muro** y **hoja de propiedades** (ancho, alto, posición): las medidas de la
  tabla de carpintería entran tal cual y salen tal cual en el IFC.
- **Chips de uso** (Cocina, Baño): nombran el recinto con un toque.
- **Exportación** IFC / CSV / PDF a la carpeta recordada, sin volver a pedirla.
- **Horizontal en tableta**: todo el cromo se acomoda; más lienzo útil que en vertical.

### Lo que no se adapta o frena el flujo (y propuesta)

| # | Fricción | Propuesta |
|---|---|---|
| 1 | Punto a punto no encadena: cada muro son dos toques y hay que volver a tocar el último punto (H-15) | Encadenar desde el último punto con «Terminar» (decisión H-15) |
| 2 | No hay usos de recinto para obra educativa ni zonas exteriores: Aula, Bodega, Corredor, Exterior se escriben a mano | Catálogo de usos por disciplina o editable por proyecto |
| 3 | Un espacio abierto (la bodega «Disponible», el corredor, el andén) no puede ser recinto si no lo cierran muros | Herramienta «línea de recinto» (separación sin muro) que cierre zonas abiertas |
| 4 | No se puede invertir el sentido de apertura de una puerta (H-66): P1 quedó abriendo hacia fuera | Botón «invertir giro / mano» en la hoja de la puerta |
| 5 | El antepecho (0,83 m en el plano) solo se fija desde el alzado, ventana por ventana | Antepecho en la hoja de la ventana en planta y valor por defecto por herramienta |
| 6 | Ancho por defecto fijo (puerta 0,90, ventana 1,20): hubo que corregir 13 de 14 vanos uno a uno | Recordar el último ancho/alto usado, o tipos (P1, P2, V1…) reutilizables como en la tabla de carpintería |
| 7 | «Posición en el muro» se mide desde el inicio del muro, que depende del sentido en que se trazó (V3 del aula salió a 7,77 m) | Mostrar en el plano cuál es el inicio, o medir desde la esquina más cercana |
| 8 | Al medir, la T de la cocina se movió en proporción y el muro quedó 9 cm torcido (H-67) | Decisión H-67 (b) |
| 9 | La medida arranca en 3,000 en vez de la longitud actual | Prellenar con la medida actual de la cara elegida |
| 10 | El plano PDF no dibuja puertas ni ventanas (H-54) y los rótulos de recintos pequeños desbordan (H-68) | Decisión H-54 (b); rótulo abreviado o fuera del recinto |
| 11 | «Encuadrar todo» en horizontal deja el dibujo debajo de la barra superior y de los botones laterales; al reabrir el espacio la vista no se encuadra (H-59) | Encuadre con márgenes del cromo y encuadre automático al abrir |
| 12 | La hoja del vano muestra el id interno («mvkdxkkw-…») | Mostrar el código o el tipo (P1, V3) |
| 13 | Las alturas de muro y niveles (Piso 0,00 · Muro +2,64 · Cubierta +3,24) se configuran aparte; los muros nacen a 2,80 | Plantilla de niveles al crear el proyecto |

Notas de método: en el dev client dos «R» seguidas recargan la app y la burbuja «Tools» del dev client intercepta
toques en el borde (no existen en el APK de producción). Los toques que «se perdían» al principio eran del script de
prueba (adb consumía la entrada del bucle), no de la app.

## 9. Tres planos más: NARG29 · SUMB, MARA y MACO

Cada sede en su proyecto (BIM004 «NARG29 SUMB», BIM005 «NARG29 MARA», BIM006 «NARG29 MACO»), levantada desde su
PDF de arquitectura, exportada a `/sdcard/PolyLive-QA/` y abierta con ifcopenshell en el PC.

| Sede | Tableta | Muros | Recintos (neto) | Puertas · ventanas | IFC |
|---|---|---|---|---|---|
| SUMB · B1 Aula | vertical | 4 (5 cm) | Aula 62,55 m² (interior 9,00 × 6,95 medido con láser) | 1 · 6 | válido |
| MARA · B1 Primer piso | vertical | 10 | Aulas 89,37 · Comedor y cocina 39,09 · Batería sanitaria 6,57 | 5 · 11 | válido |
| MACO · B1 Primer piso | horizontal | 11 | Aula 42,27 · Comedor 13,96 · Cocina 9,11 · Dormitorio 8,08 · Batería sanitaria 5,01 | 5 · 7 (+1 vano) | válido |

Anchos y altos de puertas y ventanas salen en el IFC tal cual la tabla de carpintería de cada plano (MACO: P1
0,80 × 2,23, P3 0,97 × 2,20, V1/V5 1,98–1,99 × 0,77, V2 1,89 × 0,20, V4 1,43 × 0,81). La zonificación de SUMB
(64,19 m²) se mide a cara exterior; PolyLive da el área neta interior.

**Un P1 nuevo, corregido (H-69):** en MACO el baño cuelga bajo el muro sur, y el muro sur se trazó después de los
muros del baño. El grafo partía un muro cuando OTRO terminaba en su interior, pero no cuando el muro nuevo pasaba
por extremos ya existentes: el baño no salía como recinto. Ahora el muro nuevo se parte también en esos nudos (dos
tests nuevos); en la tableta el baño apareció al recargar. En MARA el tabique suelto entre aulas confirmó H-64 en un
segundo plano: el recinto de aulas no se pierde.

**Lo que confirman los tres planos** (además de la tabla del § 8):

- Las fricciones 1, 2, 6 y 13 del § 8 se repiten en cada sede: dos toques por muro, «Aula» se escribe a mano, cada
  vano nace a 0,90 / 1,20 y hay que corregirlo uno a uno, y los muros nacen a 2,80 cuando los planos dicen 2,22.
- «Vano» existe y separa bien cocina y comedor sin unir los recintos, pero no llega al IFC (decisión H-70).
- Ajustar la «Posición en el muro» tras cambiar el ancho es habitual: el vano crece desde su borde inicial, no desde
  el centro donde se tocó. Propuesta: crecer desde el centro al cambiar el ancho.
- Con la herramienta Muro, el borde izquierdo del lienzo no recibe toques en vertical (H-72); con vanos juntos, la
  pulsación larga abre el vecino o el muro (H-73).
- Re-exportar el CSV con el mismo nombre deja un archivo sin extensión `.csv` (H-71).

## Nota del build release

El APK release `.qa` no terminó en este PC: Gradle falla una y otra vez con «Unable to delete directory» sobre
carpetas recién generadas dentro de `node_modules/*/android/build` (Worklets, Reanimated, Skia, y luego cada módulo
de Expo). Con Gradle parado esas carpetas se borran sin problema y no queda ningún proceso de compilación colgado;
borrando la carpeta bloqueada y reintentando, el build avanza un paso por intento (`CLAUDE.md` tiene el remedio). La
causa más probable es el antivirus o el indexador de Windows sobre archivos recién escritos; la solución estable es
una exclusión para `C:\APP\PolyLive` (ajuste del dueño). Mientras tanto, la prueba se hizo con el dev client `.qa`
(debug) contra Metro, con el código de esta rama.
