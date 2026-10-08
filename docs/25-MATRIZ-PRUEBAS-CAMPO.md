# 25 — Matriz de pruebas de campo (ronda 1) · tableta Lenovo TB370FU

Fecha: 2026-10-07 · App: dev client Expo SDK 57 con Metro (rama `feat/mvp-auditoria`, commit `dae07ee`) · Equipo: Lenovo TB370FU (1840 × 2944, Android) en la ventana angosta de tableta y a pantalla completa vertical · Proyecto de prueba `P2` (tablet limpia, operador `QA`). Incluye la ronda en tema Oscuro y Alto contraste (capítulo K).

**Para qué sirve:** una sola tabla con todas las herramientas, botones, menús y funciones de la app, ordenadas por capítulo y modo, con el paso a paso, lo esperado, el resultado de esta ronda y la nota/hallazgo. Úsala como lista de comprobación para repetir las pruebas a mano (casilla *Tu prueba*) y como lista de trabajo para la siguiente ronda de correcciones (§ 4).

## 1. Resumen

| Estado | Filas |
|---|---:|
| ✅ Ok | 125 |
| 🟡 Parcial | 22 |
| ❌ Falla | 18 |
| ⬜ No probado | 18 |
| ➖ N/A | 1 |
| **Total** | **184** |

Hallazgos: **42** — P1 (datos o bloqueo) 4 · P2 (funciona mal) 13 · P3 (pulido) 22 · corregidos en esta ronda 3.

Leyenda: ✅ OK · 🟡 Parcial · ❌ Falla · ⬜ No probado · ➖ No aplica. Prioridad: **P1** corrompe datos o bloquea, **P2** funciona mal, **P3** pulido.

### Qué NO se pudo probar (y por qué)

- **Gestos de dos dedos** (rotación del lienzo, pinch, snaps de giro): `adb` no simula multitáctil. Probar a mano (B17–B19, F17).
- **Pantallas de aplicación en alto contraste y oscuro** (Exportar, Ajustes, Perfil, Importar, Galería/cámara en AC): K13, K15.
- **Giro físico de la tableta** a horizontal real: no se cambió ningún ajuste del sistema. Probar a mano (J01).
- **Alzado**: foto en la cara, pincel de Avance sobre la cara y marcas de Revisión (E07, G09, H12); el alzado se abre desencuadrado (H-25) y las hojas de detalles se superponen. Repetir tras corregir.
- **Hojas que se desplazan** (recinto, detalles del alzado): tras desplazarlas los toques automáticos caen en otra hoja; quedan para tu prueba a mano (D09, D11, E07, G09, H12).
- **Amarre por GPS / por mojones, actividades de avance, PDF de avance, disciplinas del proyecto**: no se alcanzaron en el tiempo de esta ronda (F05, F06, G04, G10, G13, A09).
- **Mapa de fondo**: pendiente de licencia (decisión de producto).
- **PDF**: se comprobó que son válidos (1 página carta) pero no se pudo ver cómo se ven; revisar a ojo (I05, I07, G13).
- **Bluetooth / láser**: fuera del alcance acordado.

## 2. Cómo usar esta matriz

1. Ve capítulo por capítulo. Cada fila es una función con su prueba.
2. La columna **Esta ronda** es lo que se vio; **Nota** dice qué falló y apunta al hallazgo `H-xx` del § 4.
3. Marca **Tu prueba** (`[ ]` → `[x]`) cuando la repitas a mano; escribe diferencias en tus notas.

## 3. Matriz por capítulo

### A · App y datos

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| A01 | — | Arranque en frío (instalación limpia) | Abrir la app | Migraciones v1–v3 sin error; pantalla de operador | ✅ |  | [ ] |
| A02 | — | Crear operador | Escribir nombre + Crear | Operador creado y activo; entra a Proyectos | ✅ | Con el teclado abierto el campo y el botón quedan tapados (H-12) | [ ] |
| A03 | — | Elegir operador existente | Tocar operador en la lista | Entra a Proyectos con 'Operador: X' | ✅ |  | [ ] |
| A04 | — | Proyectos: lista vacía | Instalación limpia | Mensaje 'Todavía no hay proyectos' | ✅ |  | [ ] |
| A05 | — | Proyectos: buscar | Escribir texto sin coincidencias; borrar | 'Ningún proyecto coincide' / vuelve la lista | ✅ |  | [ ] |
| A06 | — | Nuevo proyecto: nombre vacío | Abrir el formulario sin nombre | Guardar deshabilitado | ✅ |  | [ ] |
| A07 | — | Nuevo proyecto: código BIM duplicado | Código existente + Guardar | Error 'Ya existe un proyecto con el código…' | ✅ |  | [ ] |
| A08 | — | Nuevo proyecto: código con espacios y minúsculas | 'bim 777' + Guardar | Normaliza a BIM777 | ✅ |  | [ ] |
| A09 | — | Nuevo proyecto: disciplina (Arquitectura / Estructuras / Instalaciones) | Elegir cada una + Guardar | Se guarda con la disciplina elegida | ⬜ | Pendiente: crear un proyecto por cada disciplina | [ ] |
| A10 | — | Tarjeta de proyecto: Exportar / Editar / Eliminar | Tocar cada botón | Exportar crea paquete; Editar abre formulario; Eliminar pide confirmar | 🟡 | Exportar OK; Editar y Eliminar sin probar en esta ronda | [ ] |
| A11 | — | Etiqueta 'Respaldado hace…' en la tarjeta | Exportar paquete y volver a la lista | Aparece el respaldo reciente | ✅ |  | [ ] |
| A12 | — | Importar proyecto (.polylive) | Importar el paquete exportado | Proyecto restaurado con sus datos | ✅ | Importa el paquete; pregunta antes de reemplazar y deja '2 espacios' (el texto dice 'teléfono', H-33) | [ ] |
| A13 | — | Proyecto: lista de espacios vacía | Abrir un proyecto nuevo | 'Este proyecto no tiene espacios' | ✅ |  | [ ] |
| A14 | — | Nuevo espacio: crear y abrir | Nombre + 'Crear y abrir' | Abre el editor; código SPCnnn | ✅ |  | [ ] |
| A15 | — | Espacio: Renombrar / Quitar / varios espacios | Botones de la tarjeta | Renombra; Quitar pide confirmar | ✅ | Renombrar (código SPC no cambia) y Quitar con confirmación ('el Recinto y lo dibujado NO se borran') | [ ] |
| A16 | — | Pantalla Ajustes y respaldos | ☰ → Ajustes y respaldos | Copia automática, copias, esquema v3, diagnóstico | 🟡 | Visible y correcto; faltan Crear copia ahora, Restaurar y Enviar diagnóstico | [ ] |
| A17 | — | Perfil de operador / cambiar operador | ☰ → Operador | Muestra el perfil y permite cambiar | ✅ | Perfil: nombre editable, Guardar cambios deshabilitado sin cambios; 'Cambiar de operador' | [ ] |
| A18 | — | Galería de fotos del espacio | ☰ → Galería de fotos | Lista las fotos; visor; vincular a objeto; eliminar | ✅ | Galería: miniaturas, visor con Ficha/Vincular/Ocultar/Eliminar; vincular a un objeto; eliminar pide confirmar | [ ] |
| A19 | — | Pantalla IFC y DXF del recinto | ☰ → IFC y DXF del recinto | Elegir formato y exportar | ✅ | Exportar a IFC y a DXF desde la pantalla; muestra el resumen (4 muros, 2 columnas, 2 huecos, 8 de dibujo) | [ ] |

### B · Cromo del editor

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| B01 | Todos | Barra superior: título, ☰, deshacer, rehacer, ⋮ | Mirar la barra | Proyecto · Espacio y cuatro botones | ✅ |  | [ ] |
| B02 | Todos | Deshacer / Rehacer (barra) | Crear objeto, deshacer, rehacer | Revierte y reaplica en un solo paso | ✅ | Deshacer de una medida restaura todo en un paso | [ ] |
| B03 | Todos | Deshacer manteniendo pulsado = rehacer (botón flotante junto al FAB) | Mantener pulsado | Rehace | ⬜ | Requiere mantener pulsado el botón de deshacer: probar a mano | [ ] |
| B04 | Todos | Menú ☰: abrir y cerrar | Tocar ☰, tocar el velo, arrastrar | Se abre y cierra animado | ✅ | Tras volver del selector de carpetas quedaba dibujado abierto (H-03, corregido) | [ ] |
| B05 | Todos | ☰ → Encuadrar todo | Tocar la entrada | Encuadra el dibujo | ✅ | Encuadrar todo reencuadra el dibujo | [ ] |
| B06 | Todos | ☰ → Galería / Otros espacios / Cambiar de proyecto / Operador / Ajustes | Tocar cada entrada | Navega a cada pantalla | 🟡 | Solo Ajustes verificado | [ ] |
| B07 | Todos | Menú ☰ cerrado: accesibilidad | Leer el árbol de accesibilidad con el menú cerrado | No debe exponer sus entradas | ❌ | Las entradas siguen en el árbol con el cajón cerrado (H-06) | [ ] |
| B08 | Todos | ⋮ Configuración: 7 secciones | Abrir ⋮ y cada acordeón | Datos, Modo y capas, Zoom, Snap, Tema, Cuadrícula, Escala | ✅ |  | [ ] |
| B09 | Todos | ⋮ → Datos del archivo | Abrir la sección | Proyecto, espacio, operador, muros, objetos, área cerrada | ✅ |  | [ ] |
| B10 | Todos | ⋮ → Tema claro / oscuro / alto contraste | Elegir cada tema | Cambia toda la interfaz y el lienzo | ✅ | Alto contraste: cuadrícula azul muy gruesa (H-07) | [ ] |
| B11 | Todos | ⋮ → Zoom: Encuadre / Alejar / Acercar | Tocar cada uno | Cambia el zoom | ✅ | Falta 'Zoom a selección', que sí está en la esquina (H-08) | [ ] |
| B12 | Todos | ⋮ → Snap: Nodo / Vértice / Punto medio / Ángulo | Activar y desactivar | Se refleja en el botón de esquina | ✅ |  | [ ] |
| B13 | Todos | ⋮ → Cuadrícula: Líneas / Puntos / Rotación | Alternar | Cambia el fondo | ✅ | Líneas y Puntos pueden quedar activas a la vez (H-09) | [ ] |
| B14 | Todos | ⋮ → Escala: Acotado / Anotativa / Escala 1:N | Escribir 100 y cerrar | La barra muestra 'Escala 1:100' | ✅ | Los dígitos del campo salen recortados arriba (H-10) | [ ] |
| B15 | Todos | Esquina: Zoom (Encuadre, Acercar, Alejar, Zoom a selección) | Tocar cada uno | 100 → 125 → 156 → 125 → 100 % | ✅ | Zoom a selección sin selección no hace nada y no avisa | [ ] |
| B16 | Todos | Esquina: Snap, Tema, Cuadrícula, Escala | Abrir cada fila | Mismas opciones que el cajón ⋮ | ✅ |  | [ ] |
| B17 | Todos | Gizmo de ejes: tocar para enderezar la vista | Girar la vista y tocar el gizmo | Vuelve al norte | ⬜ | Requiere girar el lienzo con dos dedos antes: probar a mano | [ ] |
| B18 | Todos | Rotación del lienzo con dos dedos y snaps | Gesto de dos dedos | Gira con snaps 0/90/180/270 | ⬜ | Gesto de dos dedos: no se puede simular por adb; probar a mano | [ ] |
| B19 | Todos | Pan con un dedo / pinch | Arrastrar y pellizcar | Mueve y escala el plano | 🟡 | Pan con un dedo OK; pinch requiere dos dedos: probar a mano | [ ] |
| B20 | Todos | Selector de Niveles: abrir, thumbs N/S/I, arrastrar el nivel | Abrir y arrastrar | Cambia 'Nivel: X' y las restricciones | ✅ |  | [ ] |
| B21 | Todos | Niveles: configurar (agregar, nombre, cota, eliminar) | ⚙ → Agregar; editar cota; cerrar | Crea niveles con su cota | ❌ | La cota tecleada no se guarda si se cierra con Atrás: Nivel 2 quedó en +2 m en vez de 6 (H-02) | [ ] |
| B22 | Todos | Niveles: orden de la lista de configuración | Agregar Nivel 1 y Nivel 2 | Ordenados por cota | ❌ | Salen 3 m, 6 m, 0 m (H-11) | [ ] |
| B23 | Todos | Selector de Fases: abrir, configurar, agregar | Abrir y '+ Agregar' | Crea 'Fase 1' con orden 1 | ✅ |  | [ ] |
| B24 | Todos | Selector de Niveles frente al gizmo de ejes | Abrir el selector | No deben taparse | ❌ | El botón ← del selector cae sobre el gizmo (H-13) | [ ] |
| B25 | Todos | Botón 'Tools' del cliente de desarrollo sobre el ⋮ | Solo en build de desarrollo | — | ➖ | Solo en desarrollo; no afecta a la app de producción | [ ] |

### C · Levantamiento · Planta

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| C01 | Levantamiento | FAB +: categorías Acotado / Dibujo / Arquitectónico / Estructural / Auditoría | Tocar + y cada categoría | Muestra las herramientas de la categoría | ✅ | El botón es el círculo del icono; el rótulo no responde (H-14) | [ ] |
| C02 | Levantamiento | Muro · Punto a punto | Arquitectónico → Muro → Punto a punto; 2 toques por muro | Un muro por par de toques; recinto al cerrar | ✅ | No encadena: cada muro son dos toques (H-15) | [ ] |
| C03 | Levantamiento | Muro · Arrastre libre | Muro → Arrastre libre; arrastrar | Un muro por arrastre | ✅ | Arrastre libre: 2,77 m horizontal con snap (el helper de pruebas usaba el origen equivocado) | [ ] |
| C04 | Levantamiento | Muro: pastilla de espesor (BPC) | Tocar / arrastrar 'Espesor 15 cm' | Cambia el espesor de los próximos muros | ✅ | La pastilla 'Espesor' de la barra cambia el valor (15 → 24 cm) | [ ] |
| C05 | Levantamiento | Muro: restricción tope / base (selector T/B) | Mirar tras crear con niveles definidos | Tope por defecto razonable | ❌ | El tope queda en 'Nivel 2' en vez de altura libre o siguiente nivel (H-16) | [ ] |
| C06 | Levantamiento | Recinto detectado: nombre y área neta | Cerrar 4 muros | 'Recinto 1' con m² neto | ✅ | 2,99 × 2,00 → 5,25 m² | [ ] |
| C07 | Levantamiento | Puerta | Arquitectónico → Puerta; tocar muro | Hueco con arco de giro | ✅ |  | [ ] |
| C08 | Levantamiento | Ventana | Arquitectónico → Ventana; tocar muro | Hueco con vidrio | ✅ |  | [ ] |
| C09 | Levantamiento | Columna rectangular | Columna → Rectangular; tocar | Cuadrado de 30 cm | ✅ |  | [ ] |
| C10 | Levantamiento | Columna circular | Columna → Circular; tocar | Círculo | ✅ | La pastilla dice 'Lado' en vez de 'Diámetro' (H-17) | [ ] |
| C11 | Levantamiento | Suelo | Suelo; tocar dentro del recinto | Achurado con espesor | ✅ |  | [ ] |
| C12 | Levantamiento | Vano (hueco genérico) | Vano; tocar muro | Hueco punteado en el muro | ✅ |  | [ ] |
| C13 | Levantamiento | Cota (por arrastre) | Acotado → Cota; arrastrar de un punto a otro | Cota con valor y separación | 🟡 | Se crea, pero el trazo sale inclinado al pegarse a nodos distintos (H-18) | [ ] |
| C14 | Levantamiento | Medición láser (ingreso manual) | Medición láser; tocar muro; Ingresar medida; teclear; Guardar | Aplica el valor tecleado, cara a cara | ✅ | Corregido en esta ronda (H-01) | [ ] |
| C15 | Levantamiento | Texto | Texto; tocar; escribir; Agregar | Texto en el plano | ✅ |  | [ ] |
| C16 | Levantamiento | Etiqueta (muro / columna / vano / recinto) | Etiqueta; tocar muro; Agregar | Texto prellenado con línea guía | ✅ | 'Muro · 15 cm · 2.99 m' | [ ] |
| C17 | Levantamiento | Coordenada | Dibujo → Coordenada; tocar | Rótulo x / y locales | ✅ |  | [ ] |
| C18 | Levantamiento | Línea | Dibujo → Línea; arrastrar | Línea | ✅ |  | [ ] |
| C19 | Levantamiento | Polígono: vértices, Quitar punto, Cerrar polígono | Tocar 4 puntos; Quitar punto; Cerrar | Polígono con área | ✅ | Triángulo de 0,25 m² | [ ] |
| C20 | Levantamiento | Viga (arrastrar el eje) | Estructural → Viga; arrastrar | Viga punteada 'V 30×40' | ✅ |  | [ ] |
| C21 | Levantamiento | Foto anclada (permisos de cámara y ubicación) | Auditoría → Foto; tocar; permisos; obturador | Pide permisos al usarla; marcador FOTnnn | ✅ | Al volver, la actividad se reinició y la tablet quedó a pantalla completa en vertical (H-19) | [ ] |

### D · Levantamiento · Selección y edición

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| D01 | Levantamiento | Seleccionar muro (tocar) | Tocar un muro con la herramienta suelta | BPC muestra 'Muro', espesor y longitud | ✅ |  | [ ] |
| D02 | Levantamiento | Seleccionar columna / puerta / ventana / vano | Tocar cada uno | BPC con su nombre y pastilla (Lado / Ancho) | 🟡 | Columna y ventana OK; puerta y cota se pisan al tocar (H-20) | [ ] |
| D03 | Levantamiento | Seleccionar recinto | Tocar dentro del recinto | BPC 'R-01 Nombre · neta m² · P m' | ✅ |  | [ ] |
| D04 | Levantamiento | Seleccionar objetos de dibujo (cota, texto, línea, polígono, viga, coordenada) | Tocar cada uno | BPC con su tipo y medida | ✅ |  | [ ] |
| D05 | Levantamiento | Hoja de propiedades del muro (mantener pulsado) | Pulsación larga en un muro | Nombre, longitud, espesor, altura, función, elevación, fotos, eliminar | ✅ |  | [ ] |
| D06 | Levantamiento | Muro: editar nombre y espesor | Escribir y confirmar con Enter | Se guarda y se ve en el plano | ✅ | Con Atrás en vez de Enter no se confirma (H-02) | [ ] |
| D07 | Levantamiento | Muro: función Portante / Partición | Cambiar a Partición | Cambia el estilo del muro | ❌ | Un muro en Partición deshizo el recinto y su suelo sin avisar (H-21) | [ ] |
| D08 | Levantamiento | Hoja del recinto: nombre, uso (10 usos), área neta / perímetro / al eje, nivel | Pulsación larga en el recinto; elegir 'Cocina' | Nombre y rótulo se actualizan | ✅ |  | [ ] |
| D09 | Levantamiento | Recinto: espesor del suelo, Quitar suelo, Poner suelo | Editar el espesor | Cambia el suelo | ⬜ | La hoja del recinto cambia de posición al desplazarla y los toques cayeron en otra hoja: repetir a mano (espesor, quitar y poner suelo) | [ ] |
| D10 | Levantamiento | Recinto: Control de cierre (diagonal medida) | Teclear 3.40 y 3.372 | 'No cierra … 3,2 cm' / 'Cierra … 0,4 cm' con tolerancia ±1,3 cm | ✅ |  | [ ] |
| D11 | Levantamiento | Recinto: notas | Escribir una nota | Se guarda | ⬜ | Igual que D09: repetir a mano (campo Notas) | [ ] |
| D12 | Levantamiento | Mover extremo de muro con el manejador | Seleccionar muro; arrastrar su extremo | El muro unido acompaña; recinto se recalcula | ✅ |  | [ ] |
| D13 | Levantamiento | Mover un muro entero / columna / puerta arrastrando | Seleccionar y arrastrar el cuerpo | Se mueve con vista previa en vivo | 🟡 | Arrastrar el cuerpo de una columna seleccionada mueve el plano, no el objeto; solo se mueve con sus manejadores (H-39) | [ ] |
| D14 | Levantamiento | Eliminar muro (hoja de propiedades) | Eliminar | Se borra con confirmación | ❌ | Se borra al instante sin confirmar; el deshacer lo recupera todo (H-22) | [ ] |
| D15 | Levantamiento | Eliminar viga / dibujo (Borrar) | Borrar en la hoja | Se borra | ✅ | Sin confirmación; deshacer disponible | [ ] |
| D16 | Levantamiento | Deshacer en cadena (varios pasos) y rehacer | Deshacer 3 veces | Revierte en orden | ✅ |  | [ ] |
| D17 | Levantamiento | Deshacer una propiedad editada | Editar espesor; deshacer | Vuelve al valor anterior | ❌ | Deshacer recuperó el recinto pero el espesor y el nombre editados siguieron cambiados (H-23) | [ ] |
| D18 | Levantamiento | Pastilla BPC arrastrable (cambiar valor) | Arrastrar 'Espesor' / 'Ancho' | Cambia el valor con paso | ✅ | Arrastrar la pastilla 'Espesor' cambia 15 → 24 cm | [ ] |
| D19 | Levantamiento | Muro encima de otro / muro de longitud cero | Dos toques en el mismo punto | Rechaza o ignora | 🟡 | Un muro de longitud cero (mismo punto dos veces) se ignora sin aviso (H-38) | [ ] |
| D20 | Levantamiento | Selector de restricciones T/B, 'Desfases y altura', separar extremos | Abrir cada control con un muro seleccionado | Cambia tope/base por extremo | ✅ | Editar extremo A/B, Separar/Ligar extremos y 'Restricciones del muro' (desfase de base y tope) funcionan | [ ] |
| D21 | Levantamiento | Fotos de un objeto (botón Fotos de la hoja) | Hoja → Fotos | Abre la galería filtrada por objeto | ✅ | El botón Fotos de la hoja abre 'Fotos del objeto' filtrado ('0 fotos' para ese muro) | [ ] |

### E · Levantamiento · Alzado

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| E01 | Levantamiento | Abrir alzado (hoja del muro → Elevación) | Pulsación larga; Elevación | Vista del muro con huecos y mini-mapa | ✅ |  | [ ] |
| E02 | Levantamiento | Alzado: ver ventana, lado A/B | Alternar A/B | Cambia el lado y el rótulo | ✅ |  | [ ] |
| E03 | Levantamiento | Alzado: Detalles → Cuantificación y alturas | Abrir Detalles | Bruta / huecos / neta; alturas por extremo | ✅ | 3,99 − 1,20 = 2,79 m² | [ ] |
| E04 | Levantamiento | Alzado: Puerta / Vano / Ventana (tocar el muro) | FAB → Arquitectónico | Crea el hueco con su ancho | 🟡 | Se crea, pero acepta una puerta de 2,10 m en un muro de 2,00 m y huecos solapados (H-24) | [ ] |
| E05 | Levantamiento | Alzado: Cercha / Correa / Viga | FAB → Estructural; arrastrar | Crea el elemento | ❌ | Cercha: al arrastrar se mueve la cámara y queda una cercha de 0,00 m suelta; con toques no se crea nada (H-25) | [ ] |
| E06 | Levantamiento | Alzado: Cota / Texto / Etiqueta / Coordenada / Línea / Polígono | FAB → Acotado / Dibujo | Crea sobre el alzado | 🟡 | Cota y Línea se activan; Texto abre su hoja titulada 'Texto en el plano' en el alzado (H-41); con Cercha el arrastre mueve la cámara (H-25); el resto repetir tras corregir | [ ] |
| E07 | Levantamiento | Alzado: Foto en la cara del muro | FAB → Auditoría → Foto | Foto anclada a la cara | ⬜ | Repetir a mano: Auditoría → Foto en el alzado (la cámara se probó en planta) | [ ] |
| E08 | Levantamiento | Alzado: mini-mapa (ocultar / mostrar) | Tocar 'Ocultar mini-mapa' | Oculta y muestra | ✅ | Ocultar / Mostrar mini-mapa alterna | [ ] |
| E09 | Levantamiento | Alzado: Filtros (Vanos, Puertas, Ventanas, Vigas, Cotas, Fotos) | Apagar cada uno | Oculta su capa | 🟡 | Los 6 filtros existen y 'Ventanas' oculta el cuerpo de la ventana, pero deja visibles sus guías azules (H-42) | [ ] |
| E10 | Levantamiento | Alzado: Niveles (cota de nivel y líneas de nivel) | Abrir el selector | Líneas de nivel reales | 🟡 | El alzado se abre desencuadrado (solo líneas de nivel) hasta usar Encuadre (H-25) | [ ] |
| E11 | Levantamiento | Alzado: encuadre / zoom tras crear | Corner → Encuadre | Reencuadra al muro | ❌ | Al entrar al alzado o cambiar de modo en él la cámara se desencuadra; Encuadre lo recupera (H-25) | [ ] |
| E12 | Levantamiento | Volver a la planta | Botón 'Volver a la planta' | Regresa a la planta como estaba | ✅ |  | [ ] |
| E13 | Levantamiento | Alzado de trapecio (alturas distintas por extremo) | Detalles → alturas A y B | Muro en trapecio | ✅ | El trapecio se define con los selectores de nivel por extremo; 'Detalles' muestra Cotas A · B (0,00→2,00) | [ ] |
| E14 | Levantamiento | Alzado: editar hueco (ancho, alto, antepecho, posición, tipo, notas) | Pulsación larga en el hueco | Hoja con campos; 'Máximo colocable' | 🟡 | Hoja de ventana OK; falta recorrer puerta y vano | [ ] |

### F · Topografía

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| F01 | Topografía | Cambiar a modo Topografía (solo planta) | Selector de modo | Barra con Coordenadas y Amarre; abre el asistente | ✅ |  | [ ] |
| F02 | Topografía | Asistente de amarre: elegir sistema (CTM12, Bogotá, Este, Este-Este, Oeste, Oeste-Oeste, geográficas) | Elegir 'Bogotá' + Siguiente | Pasa al paso 2/2 | 🟡 | Bogotá OK; faltan Oeste, Oeste-Oeste y CTM12 | [ ] |
| F03 | Topografía | Amarre: Origen conocido (N, E, azimut) | Teclear N y E; Amarrar | Barra 'Amarre: origen conocido'; vértices con N/E | ✅ |  | [ ] |
| F04 | Topografía | Amarre: Origen vacío | Amarrar sin datos | Avisa que faltan datos | ❌ | No muestra aviso: se amarra con 0 (H-26) | [ ] |
| F05 | Topografía | Amarre: GPS en un punto | Pestaña GPS | Promedia y amarra | ⬜ | Pendiente: GPS promedia en vivo (se vio en 'Punto GPS'); el amarre por GPS no se completó | [ ] |
| F06 | Topografía | Amarre: por mojones (≥2) con residuales | Pestaña Mojones | Ajuste y RMSE | ⬜ | Pendiente: hay 4 mojones creados; falta ejecutar el ajuste por mojones | [ ] |
| F07 | Topografía | Mojón por toque | Puntos → Mojón; tocar el plano; Crear mojón | Crea M-n con N/E calculados | ✅ |  | [ ] |
| F08 | Topografía | Mojón por coordenadas (planas / lat-long) | Puntos → Coordenada; teclear; Crear | Crea el mojón en esa posición | ✅ | Se necesita Tab entre N y E (el teclado numérico no tiene 'siguiente') | [ ] |
| F09 | Topografía | Punto GPS (promedio configurable) | Puntos → Punto GPS | Promedia ± precisión y crea el mojón | ✅ | Avisa la precisión; en interior ±18 m | [ ] |
| F10 | Topografía | Inverso (distancia, azimut, ΔN, ΔE) | Medir → Inverso; dos toques | D 3,597 m · Az 123°41′24″ | ✅ |  | [ ] |
| F11 | Topografía | Área / perímetro real | Medir → Área; 4 toques | 'A 5,97 m² · P 9,98 m' | ✅ | Quitar punto y Reiniciar disponibles | [ ] |
| F12 | Topografía | Replanteo (guía a un punto) | Medir → Replanteo; tocar el punto | Flecha, distancia, norte/este, precisión | ✅ | Distancia enorme porque el amarre de prueba es ficticio | [ ] |
| F13 | Topografía | Tabla de coordenadas (mojones) | Coordenadas | Lista con N/E/cota y botones Colocar/Quitar | ✅ |  | [ ] |
| F14 | Topografía | Coordenadas: Planas ⇄ Lat/Long | Alternar | Cambia el sistema | ✅ | Planas ⇄ Lat/Long: el mojón M-1 pasa a 4°35′46,273″ N | [ ] |
| F15 | Topografía | Filtros: Muros, Columnas, Vértices, Mojones, Rótulos, Cuadrícula, Mapa de fondo, Norte | Abrir y alternar | Cada uno muestra / oculta su capa | 🟡 | Cuadrícula de coordenadas OK; la casilla de 'Mapa de fondo' queda cortada por el borde (H-27); resto sin recorrer | [ ] |
| F16 | Topografía | ⋮ Topografía: promedio GPS, reconfigurar amarre, tabla, importar CSV, exportar CSV / KML | Abrir el cajón | Todas las opciones | 🟡 | Solo se verificó que aparecen; faltan importar y exportar CSV / KML | [ ] |
| F17 | Topografía | Rotación del lienzo + norte visible | Gizmo / gesto | La flecha N sigue al norte | ⬜ | Gesto de dos dedos: probar a mano | [ ] |
| F18 | Topografía | IFC georreferenciado (IfcMapConversion) | Exportar IFC con amarre | Eastings / Northings correctos | ✅ | 1.000.000 / 1.000.000 en el IFC del espacio | [ ] |
| F19 | Topografía | Mapa de fondo con descarga | Filtro Mapa de fondo | Mapa | ⬜ | Pendiente de licencia (decisión de producto) | [ ] |

### G · Avance

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| G01 | Avance | Entrar a Avance sin objetos | Cambiar de modo en un espacio vacío | Aviso 'Avance necesita objetos' | ✅ | Espacio vacío: Avance atenuado y aviso 'Avance necesita objetos…'; pero un espacio vacío abre en Avance si venías de él (H-29) | [ ] |
| G02 | Avance | Actividad y corte: Nuevo corte (fecha) | Actividad y corte → Nuevo corte | Crea 'Corte 2026-10-07' | ✅ |  | [ ] |
| G03 | Avance | Elegir actividad (7 de fábrica con color) | Tocar 'Pañete' | Barra muestra la actividad | ✅ |  | [ ] |
| G04 | Avance | Editar actividad (nombre, color, unidad) / agregar / borrar | Hoja de actividades | Se guarda | ⬜ | Pendiente: editar/crear/borrar actividades (los 7 colores sí se listan) | [ ] |
| G05 | Avance | Pincel (ancho) | Avance → Pincel; arrastrar sobre el suelo | Franjas pintadas con la actividad | ✅ |  | [ ] |
| G06 | Avance | Borrador | Avance → Borrador; arrastrar | Borra lo pintado | ✅ | Borrador deja una muesca redondeada del ancho elegido | [ ] |
| G07 | Avance | Rectángulo | Avance → Rectángulo; arrastrar | Pinta un rectángulo | ✅ | Rectángulo pinta el rectángulo arrastrado sobre el suelo; fuera del suelo avisa 'Pinta sobre un suelo' | [ ] |
| G08 | Avance | Relleno | Avance → Relleno; tocar el suelo | Pinta todo el suelo | ✅ | 5,19 m² de 5,20 (100 % del soporte) | [ ] |
| G09 | Avance | Pincel sobre cara de muro (alzado A/B) | En alzado, Avance → Pincel | Pinta la cara recortada sin vanos | ⬜ | Repetir a mano: pincel sobre la cara A/B (el alzado de Avance solo mostró el pincel activo) | [ ] |
| G10 | Avance | Cortes anteriores (tenues) y Filtros de Avance | Filtros → Cortes anteriores | Muestra el corte previo | ⬜ | Pendiente: el cambio de modo con un panel abierto no se aplicó y no avisa (H-40); repetir cerrando el panel antes | [ ] |
| G11 | Avance | Reporte: cantidades por actividad | Reporte | '5.19 m² en el corte / acumulado' | ✅ |  | [ ] |
| G12 | Avance | Exportar CSV de avance | Reporte → Exportar CSV | Archivo CSV | ✅ | Pide carpeta de nuevo (H-28) | [ ] |
| G13 | Avance | Exportar PDF y Compartir PDF de avance | Reporte → PDF / Compartir | PDF con vistas coloreadas | ⬜ | Pendiente: Exportar PDF y Compartir PDF de avance | [ ] |
| G14 | Avance | El modo se conserva al reabrir el espacio | Reabrir el espacio estando en Avance | Debe abrir en Levantamiento (decisión de diseño) | ❌ | Abre en el modo anterior (H-29) | [ ] |

### H · Revisión

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| H01 | Revisión | Entrar a Revisión | Selector de modo | Barra con Observaciones y contador | ✅ |  | [ ] |
| H02 | Revisión | Flecha | Marcas → Flecha; arrastrar | Crea la observación y abre su hoja | ✅ |  | [ ] |
| H03 | Revisión | Rectángulo / Nube / Texto / Trazo libre | Marcas → cada una | Crea la marca | ✅ | Rectángulo, Nube, Trazo libre y Texto crean la marca y la observación; Texto pide el texto | [ ] |
| H04 | Revisión | Hoja de observación: comentario, color (5), vista, autor y fecha | Escribir y elegir color | Se guarda | ✅ |  | [ ] |
| H05 | Revisión | Marcar como resuelta / Reabrir | Botones de la hoja | Estado Resuelta y campo 'Resuelta por' | ✅ |  | [ ] |
| H06 | Revisión | Tomar foto de la observación | Botón 'Tomar foto' | Adjunta la foto | ✅ | Tomar foto adjunta la foto; la hoja pasa a 'Ver foto / Quitar foto' | [ ] |
| H07 | Revisión | Borrar observación | Botón 'Borrar observación' | Pide confirmar y borra | ✅ | Borrar observación pide confirmación; el contador baja | [ ] |
| H08 | Revisión | Lista de observaciones | Observaciones | '0 abiertas · 1 resuelta' con la lista | ✅ |  | [ ] |
| H09 | Revisión | Exportar acta PDF | Observaciones → Exportar acta PDF | PDF con fotos | ✅ | 52 KB; nombre con fecha de mañana (2026-10-08) por usar UTC (H-30) | [ ] |
| H10 | Revisión | Exportar CSV de observaciones | Observaciones → Exportar CSV | CSV | ✅ |  | [ ] |
| H11 | Revisión | Compartir acta | Observaciones → Compartir acta | Abre el selector del sistema con el PDF | ✅ |  | [ ] |
| H12 | Revisión | Marcas en alzado | En alzado, Revisión | Observaciones en la cara del muro | ⬜ | Repetir a mano: la hoja de Detalles y la cámara desencuadrada impidieron dibujar una marca en el alzado | [ ] |
| H13 | Revisión | Filtros: Comentarios abiertos / Resueltos / Cotas | Alternar | Muestra u oculta | ✅ | Filtros de Revisión: 'Comentarios abiertos', 'Resueltos', 'Cotas'; cambiar de modo con el panel abierto no se aplica (H-40) | [ ] |
| H14 | Revisión | La marca de una observación resuelta desaparece del plano | Resolver y mirar el plano | Con 'Resueltos' apagado no se ve | ✅ | Coherente con el filtro | [ ] |

### I · Entregables y archivos

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| I01 | — | IFC para Revit (espacio) | ☰ → IFC para Revit | IFC4 válido; georreferenciado si hay amarre | ✅ | Validado con ifcopenshell: 4 muros, puerta, ventana, 2 columnas, losa, espacio, viga, MapConversion | [ ] |
| I02 | — | IFC del proyecto (todos los espacios) | ☰ → IFC del proyecto | Un IfcProject, un espacio por IfcSpace | ✅ | Validado; sin ubicación definida los espacios se superponen (H-31) | [ ] |
| I03 | — | IFC y DXF del recinto (pantalla Exportar) | ☰ → IFC y DXF | Archivos y resumen | 🟡 | DXF OK (11 capas); la pantalla muestra el área bruta 5,97 en vez de la neta 5,20 (H-32); su 'Volver' queda tapado | [ ] |
| I04 | — | DXF R2000 (capas S-WALL, S-COLS, S-OPEN, S-BEAM, A-ANNO-*, V-ANNO-COOR) | Exportar DXF | Válido con ezdxf | ✅ |  | [ ] |
| I05 | — | Plano PDF con rótulo, escala gráfica y cuadro de áreas | ☰ → Plano PDF | PDF carta de 1 página | ✅ | No se pudo revisar visualmente (sin visor de PDF en el PC) | [ ] |
| I06 | — | Cuadro de áreas (CSV) | ☰ → Cuadro de áreas | CSV con neta, perímetro y al eje | ✅ |  | [ ] |
| I07 | — | Registro fotográfico (PDF) con sello | ☰ → Registro fotográfico | PDF con foto, código, fecha, autor, planta, sello | ✅ | 974 KB | [ ] |
| I08 | — | Respaldar proyecto (.polylive) | ☰ → Respaldar | Paquete con manifiesto + datos + fotos | ✅ |  | [ ] |
| I09 | — | Importar proyecto (.polylive) con reemplazo | Proyectos → Importar | Pregunta antes de reemplazar y restaura | ✅ | El texto dice 'este teléfono' en una tablet (H-33) | [ ] |
| I10 | — | Selector de carpetas (SAF): primera vez y siguientes | Exportar varias veces | Pide una carpeta una vez | ❌ | Algunos exportes (CSV de avance) la piden de nuevo (H-28) | [ ] |
| I11 | — | Menú ☰ abierto: lista completa en tableta | Abrir ☰ | Todas las entradas alcanzables | 🟡 | La lista no cabe y hay que desplazar; no se ve que desplaza (H-34) | [ ] |

### J · Transversal y dispositivo

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| J01 | — | Giro de pantalla (vertical / horizontal) en tableta | Girar la tablet | El editor se re-mide y conserva la selección | 🟡 | Pantalla completa vertical se ve bien (editor, hoja de observación, FAB); el giro físico de la tablet queda para ti | [ ] |
| J02 | — | Teclado numérico: confirmar con Atrás | Teclear un número y cerrar con Atrás | Debe aplicar el valor | ❌ | Niveles / propiedades no aplican el valor (H-02); Medida sí (corregido) | [ ] |
| J03 | — | Cámara: permiso al usarla y retorno | Auditoría → Foto | Pide permiso, toma foto, vuelve al editor | 🟡 | OK; al volver se reinició la actividad (H-19) | [ ] |
| J04 | — | Ubicación: permiso al usarla | Foto / Punto GPS | Pide permiso al usarla | ✅ |  | [ ] |
| J05 | — | Galería de fotos: abrir, visor, Ficha, Vincular, Ocultar en planta, Eliminar | ☰ → Galería | Opciones del visor | 🟡 | Vincular y Eliminar (con confirmación) OK; 'Ocultar en planta' sin probar | [ ] |
| J06 | — | Galería: encabezado 'Volver' tapado por la barra del editor | Abrir la galería | Encabezado visible | ❌ | La barra superior del editor tapa el encabezado de las pantallas del menú (H-35) | [ ] |
| J07 | — | Al reabrir el espacio se abre solo el visor de la foto | Volver al espacio tras ver la galería | Abre el editor | ❌ | Abre el visor de la última foto (H-36) | [ ] |
| J08 | — | Registro de errores en Metro (avisos obsoletos) | Mirar la consola | Sin avisos | ❌ | SkPath.moveTo/lineTo/addCircle/addArc/close obsoletos y SafeAreaView obsoleto (H-37) | [ ] |
| J09 | — | Pantalla Ajustes: crear copia, restaurar, enviar diagnóstico, versión, esquema | Probar cada botón | Funciona | ✅ | Copia creada (2 copias); diagnóstico abre el selector con el .txt | [ ] |
| J10 | — | Perfil de operador y cambiar de operador | ☰ → Operador | Guardar deshabilitado sin cambios | ✅ |  | [ ] |
| J11 | — | Importar el proyecto sobreescribe y conserva las fotos | Importar | Datos restaurados | ✅ |  | [ ] |

### K · Temas (Oscuro y Alto contraste)

| ID | Modo | Función | Pasos | Esperado | Esta ronda | Nota | Tu prueba |
|---|---|---|---|---|:-:|---|:-:|
| K01 | Todos | Apps: operador, Proyectos, formulario Nuevo proyecto, diálogos | Cambiar el tema (⋮ → Tema) y mirar la superficie | Texto y botones legibles | 🟡 | Oscuro OK · Alto contraste PARCIAL. AC: 'Guardar' deshabilitado queda durazno desvaído (H-43) | [ ] |
| K02 | Todos | Menú ☰ y cajón ⋮: lista y secciones | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K03 | Todos | Planta: muros, columnas, suelo, recinto, fotos | Cambiar el tema (⋮ → Tema) y mirar la superficie | Distinguibles del fondo | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K04 | Todos | Planta: rótulos del dibujo técnico (cotas, texto, etiqueta, coordenada, área) | Cambiar el tema (⋮ → Tema) y mirar la superficie | Texto legible sobre su fondo | ✅ | Oscuro OK · Alto contraste OK. Oscuro: salían como cajas blancas vacías (H-44); corregido con labelBackdrop + test y verificado en la tablet | [ ] |
| K05 | Todos | Planta: cuadrícula | Cambiar el tema (⋮ → Tema) y mirar la superficie | Sobria, no compite con el dibujo | ❌ | Oscuro OK · Alto contraste FALLA. AC: cuadrícula azul gruesa + puntos saturan el dibujo (H-07) | [ ] |
| K06 | Todos | Cromo: FAB, selector de modo, Filtros, Capas | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K07 | Todos | Selectores: Niveles / Fases y ventana de niveles | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K08 | Todos | Hojas: muro, recinto, observación, lista de observaciones | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K09 | Todos | Topografía: mojones y rótulos N/E | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K10 | Todos | Avance: suelo pintado | Cambiar el tema (⋮ → Tema) y mirar la superficie | Color distinguible | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K11 | Todos | Revisión: flecha y hoja de observación | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K12 | Todos | Alzado: muro, ventana, mini-mapa, líneas de nivel | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ✅ | Oscuro OK · Alto contraste OK. AC: guías azules más gruesas | [ ] |
| K13 | Todos | Galería y cámara: miniaturas y visor | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ⬜ | Oscuro OK · Alto contraste NP. AC sin revisar | [ ] |
| K14 | Todos | Persistencia: el tema se conserva tras recargar | Cambiar el tema (⋮ → Tema) y mirar la superficie | Se conserva | ✅ | Oscuro OK · Alto contraste OK. | [ ] |
| K15 | Todos | Pantallas Exportar, Ajustes, Perfil, Importar: revisión visual | Cambiar el tema (⋮ → Tema) y mirar la superficie | Legible | ⬜ | Oscuro NP · Alto contraste NP. Sin revisar en ningún tema | [ ] |

## 4. Hallazgos (lista de trabajo para la ronda de correcciones)

| ID | Prio | Ámbito | Hallazgo | Cómo reproducir | Esperado / obtenido | Filas |
|---|:-:|---|---|---|---|---|
| H-02 | P1 | Entrada de datos | Los campos numéricos no confirman al cerrar el teclado con Atrás (Niveles, propiedades) | Niveles → ⚙ → Agregar → editar la cota a 6 → Atrás → cerrar | Nivel 2 quedó en +2 m en vez de 6 m. Mismo patrón en todas las hojas con NumberField (solo la medida se arregló) | B21, D06, J02 |
| H-21 | P1 | Muros · función | Cambiar un muro a 'Partición' deshace el recinto y su suelo sin avisar | Hoja del muro → Función → Partición | El recinto no debe desaparecer (o avisar) | D07 |
| H-23 | P1 | Deshacer | Deshacer tras editar nombre/espesor/función no revierte esos campos (revierte el recinto) | Editar espesor → deshacer | Debe revertir la propiedad editada | D17 |
| H-25 | P1 | Alzado · Cercha/Correa/Viga | Al arrastrar una cercha el muro y la ventana desaparecen y la vista queda vacía; no se crea la cercha | Alzado → Estructural → Cercha → arrastrar sobre el muro | Debe crearla y conservar la vista | E05, E11 |
| H-11 | P2 | Niveles | La lista de configuración de niveles no se ordena por cota | Agregar Nivel 1 (3 m) y Nivel 2 (6 m) | Salen 3 m, 6 m, 0 m | B22 |
| H-12 | P2 | Tableta · teclado | El teclado tapa el campo 'Nuevo operador' y su botón Crear | Pantalla de operador → tocar el campo | El campo debe subir sobre el teclado | A02 |
| H-16 | P2 | Muros · restricciones | Con niveles definidos el tope de los muros nuevos queda en el último nivel (Nivel 2) | Crear 3 niveles y dibujar un muro | Debe quedar en altura libre o el nivel siguiente | C05 |
| H-19 | P2 | Cámara | Al volver de la cámara la actividad se reinicia y la tablet queda a pantalla completa en vertical | Foto → obturador | Debe volver a la misma ventana y orientación | C21, J03 |
| H-22 | P2 | Eliminar | Eliminar un muro es inmediato, sin confirmar (arrastra recinto y suelo); en cambio borrar observación sí confirma | Hoja del muro → Eliminar | Confirmar o mostrar 'Deshacer' en un aviso | D14 |
| H-24 | P2 | Alzado · huecos | Se aceptan puertas más altas que el muro y huecos solapados | Alzado → Puerta en muro de 2,00 m; luego Vano encima | Debe limitar o avisar | E04 |
| H-26 | P2 | Topografía · amarre | 'Amarrar' con el origen vacío no avisa y deja el amarre en 0 | Amarre → Origen conocido sin datos → Amarrar | Debe pedir N y E | F04 |
| H-28 | P2 | Archivos | Algunos exportes (CSV de avance) piden carpeta de nuevo aunque ya se concedió | Avance → Reporte → Exportar CSV | Debe reutilizar la carpeta | G12, I10 |
| H-31 | P2 | IFC del proyecto | Sin ubicación de cada espacio en el proyecto, todos los espacios quedan superpuestos en el origen | Dos espacios → IFC del proyecto | Debe pedir o desplazar los espacios (hoy requiere un amarre por espacio) | I02 |
| H-32 | P2 | Exportar · pantalla | La pantalla IFC y DXF muestra el área bruta al eje (5,97) en vez de la neta (5,20); la tarjeta del espacio también | ☰ → IFC y DXF del recinto | Mostrar área neta, o ambas rotuladas | I03 |
| H-34 | P2 | Menú ☰ | En la ventana angosta de tableta la lista no cabe y no se nota que desplaza; las entradas finales quedan fuera de vista | Abrir ☰ | Indicar desplazamiento o compactar | I11 |
| H-35 | P2 | Pantallas del menú | La barra del editor tapa el encabezado ('Volver') de Galería, Exportar, Operador y Ajustes | ☰ → Galería de fotos | El encabezado debe verse y su botón Volver funcionar | J06 |
| H-36 | P2 | Galería | Al volver al espacio tras ver una foto se abre sola de nuevo el visor | Galería → abrir foto → cerrar → Atrás | Debe volver al editor | J07 |
| H-06 | P3 | Accesibilidad | El menú ☰ cerrado sigue exponiendo todas sus entradas al lector de pantalla | Con el menú cerrado, leer el árbol de accesibilidad | No debería | B07 |
| H-07 | P3 | Tema | Alto contraste: cuadrícula azul muy gruesa que compite con el dibujo | ⋮ → Tema → Alto contraste | Debe verse sobria | B10 |
| H-08 | P3 | Cajón ⋮ | El cajón ⋮ no incluye 'Zoom a selección' que sí está en la esquina | ⋮ → Zoom | Mismas 4 opciones | B11 |
| H-09 | P3 | Cuadrícula | Líneas y Puntos pueden quedar activas a la vez | ⋮ → Cuadrícula → activar ambas | Debe ser excluyente o aclarar | B13 |
| H-10 | P3 | Escala | Los dígitos del campo de escala salen recortados por arriba | ⋮ → Escala | Texto completo | B14 |
| H-13 | P3 | Selectores | El botón ← del selector de Niveles cae sobre el gizmo de ejes | Abrir el selector de Niveles | No deben solaparse | B24 |
| H-14 | P3 | FAB | Solo responde el círculo del icono; el rótulo de cada fila no | FAB → tocar el texto 'Muro' | Toda la fila debería responder | C01 |
| H-15 | P3 | Muro | Punto a punto no encadena: cada muro son dos toques | Muro → Punto a punto | Esperado por el usuario: continuar desde el punto final | C02 |
| H-17 | P3 | Columna | La pastilla de la columna circular dice 'Lado' en vez de 'Diámetro' | Columna → Circular | Etiqueta 'Diámetro' | C10 |
| H-18 | P3 | Cota | Una cota creada por arrastre sale inclinada si los extremos se pegan a nodos distintos | Cota → arrastrar entre dos esquinas | Debería alinearse al eje del arrastre | C13 |
| H-20 | P3 | Selección | Al tocar donde se superponen cota y puerta se elige siempre la cota | Tocar sobre una puerta con una cota encima | Priorizar el objeto de arquitectura o alternar | D02 |
| H-27 | P3 | Topografía · filtros | La casilla de 'Mapa de fondo (pendiente de licencia)' queda cortada | Modo Topografía → Filtros | Casilla completa | F15 |
| H-29 | P3 | Modos | Al reabrir un espacio abre en el modo anterior (la decisión de diseño era Levantamiento) | Estar en Avance → salir → entrar | Abrir en Levantamiento | G14 |
| H-30 | P3 | Archivos | El acta de revisión se nombra con la fecha UTC (2026-10-08 a las 8 p. m. locales) | Exportar acta PDF | Fecha local | H09 |
| H-33 | P3 | Textos | El diálogo de importar dice 'este teléfono' en una tablet | Importar un proyecto existente | Texto neutro ('este equipo') | I09 |
| H-37 | P3 | Consola | Avisos de API obsoletas: SkPath.moveTo/lineTo/addCircle/addArc/close (Skia 2) y SafeAreaView | Mirar la consola de Metro | Sin avisos | J08 |
| H-38 | P3 | Muro | Un toque doble en el mismo punto (muro de longitud cero) se ignora sin avisar | Muro → Punto a punto → mismo punto dos veces | Aviso 'muy corto' | D19 |
| H-39 | P3 | Selección | Una columna seleccionada no se mueve arrastrando su cuerpo (mueve el plano) | Seleccionar la columna y arrastrar sobre ella | Debería moverse con vista previa; hoy solo con manejadores | D13 |
| H-40 | P3 | Modos | Al cambiar de modo estando una hoja o filtro abierto el cambio puede no aplicarse y no avisa | Abrir Filtros y tocar un modo | Debe cerrar el panel y cambiar | G10, H13 |
| H-41 | P3 | Alzado | La hoja de texto del alzado se titula 'Texto en el plano' | Alzado → Acotado → Texto | 'Texto en el alzado' | E06 |
| H-42 | P3 | Alzado · filtros | Con el filtro 'Ventanas' apagado quedan visibles las guías azules de la ventana | Alzado → Filtros → apagar Ventanas | Deben ocultarse con el elemento | E09 |
| H-43 | P3 | Tema alto contraste | El botón 'Guardar' deshabilitado queda durazno desvaído, poco legible | Alto contraste → Nuevo proyecto sin nombre | Debe verse deshabilitado pero legible | K01 |
| H-01 | Corregido | Medida | 'Guardar' de la medida aplicaba el valor anterior si el teclado se cerraba con Atrás | Medición láser → muro → Ingresar medida → teclear 3.9 → Atrás → Guardar | Debe aplicar 3.9; aplicaba 3.0 | C14, J02 |
| H-03 | Corregido | Menú ☰ / hojas | Menú y hoja inferior quedaban dibujados abiertos al volver del selector de carpetas | ☰ → exportar → volver | Debe quedar cerrado | B04 |
| H-44 | Corregido | Tema oscuro | Los rótulos del dibujo técnico salían como cajas blancas vacías (texto claro sobre fondo blanco fijo) | Tema oscuro → cota, texto, etiqueta, coordenada | Fondo que contraste con el texto (labelBackdrop) | K04 |

### Orden sugerido para la ronda de correcciones

1. **P1:** H-02 (campos numéricos no confirman con Atrás, afecta a Niveles y propiedades), H-21 (Partición deshace el recinto), H-23 (deshacer no revierte propiedades), H-25 (alzado desencuadrado y cercha que borra la vista).
2. **P2:** niveles (H-11, H-16), cámara (H-19), borrado sin confirmar (H-22), huecos en alzado (H-24), amarre vacío (H-26), carpeta de exportes (H-28), rótulos en oscuro (H-44, ya corregido), IFC del proyecto con espacios superpuestos (H-31), área bruta/neta (H-32), pantallas del menú tapadas (H-35, H-36), menú ☰ en tableta (H-34), teclado sobre el campo de operador (H-12).
3. **P3:** textos, etiquetas, accesibilidad, avisos de API obsoleta y pulido visual.

Nota: los ids H-04 y H-05 no se usaron (se descartaron al verificarlos).

## 5. Datos de la prueba

- Archivos exportados en la tableta (`/sdcard/PolyLive-QA/`) y validados en el PC: IFC del espacio (ifcopenshell, 15 geometrías), IFC del proyecto con 2 espacios (1 `IfcProject`, 8 muros, 2 `IfcSpace`), DXF (ezdxf, 11 capas), paquete `.polylive` (esquema 3), plano PDF, registro fotográfico PDF, acta de revisión PDF/CSV, CSV de áreas y de avance.
- Entorno: Metro por `adb reverse` con un reenviador IPv4→IPv6 (Metro escucha solo en `::1` en este equipo).

