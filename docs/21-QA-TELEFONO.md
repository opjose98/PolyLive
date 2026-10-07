# 21 — Prueba en teléfono (QA) de T0, Suelo, M2b, M3 y M4

**Datos de la prueba:**
- Fecha: 2026-10-05.
- Equipo: moto g86 5G (Android), APK `preview` compilado con EAS.
- Proyecto de prueba: "QA T0-M4". No se tocaron los proyectos del usuario.
- Método: toques, arrastres y capturas por `adb`; los archivos exportados se bajaron al PC y se revisaron.

## Qué funcionó

| Área | Prueba | Resultado |
|---|---|---|
| T0 Uniones | Arrastrar el muro inferior de un recinto | Los muros unidos se estiran (2,49 → 3,56 m) y el recinto se conserva |
| T0 Recintos | Hoja del recinto; atajo "Cocina" | R-01, área neta 7,80 m², al eje 8,68 m², perímetro. El nombre persiste al reabrir la app |
| F6a Suelo | "Poner suelo" desde la hoja | Trama en planta; persiste |
| M3 Avance | Corte, actividad Piso, pincel | Pinta recortado al suelo; persiste tras reiniciar |
| M3 Avance | Cara de muro en alzado (la pintó el usuario) | 8,95 m² de 9,96 m² (90 %), vanos descontados |
| M3 Reporte | CSV, PDF y compartir PDF | CSV y PDF correctos; las cifras cuadran entre app, CSV y PDF |
| M4 Revisión | Nube, comentario, color, foto | Observación 1 con foto; número y color en planta |
| M4 Acta | Exportar PDF | Planta con la nube numerada y tabla con comentario, autor y estado |
| M2b Amarre | Origen conocido + azimut 30° | Rótulos N/E en las esquinas |
| M2b Inverso | Dos esquinas | D 2,395 m, Az 120°00'00" (90° + 30°): correcto |
| M2b Área | Toque dentro del recinto | 7,81 m², P 11,40 m en planas |
| M2b Cuadrícula | Filtro | Líneas giradas 30° |
| M2b CSV | Importar PNEZD con `;` y coma decimal; exportar CSV y KML | Ida y vuelta exacto; el KML cae en Bogotá |

## Problemas encontrados y corregidos

| # | Problema | Arreglo |
|---|---|---|
| 1 | Atrás con la hoja del recinto abierta salía del espacio | Atrás cierra primero hojas, texto pendiente y replanteo (planta y alzado) |
| 2 | Un tabique en T quedaba corto y no dividía el recinto | Enganche al **eje del muro**. Con snap angular, el tabique sale recto y toca el eje |
| 3 | Acciones de la BPC ocultas a la derecha | Las acciones van primero; sin escala/zoom en modos con contexto propio |
| 4 | El PDF compartido tenía nombre aleatorio | Se copia con nombre legible antes de compartir |
| 5 | Android no deja usar Descargas como carpeta | Aviso antes del selector: crear una carpeta (p. ej. Descargas/PolyLive) |
| 6 | Costuras entre filas de celdas en el PDF | `crispEdges` y solape mínimo |
| 7 | Las caras de muro pintadas no salían dibujadas en el PDF | Un alzado por cara con su avance (lado B en espejo) |
| 8 | El % usaba punto decimal y el resto, coma | Formato es-CO |
| 9 | Hora UTC en las observaciones | Hora local |
| 10 | Número desalineado en el círculo del acta | `line-height` |
| 11 | El acta solo decía "Con foto" | La foto va incrustada en el acta |
| 12 | Teclado de letras en campos de coordenadas | Teclado numérico en Android |
| 13 | El teclado quedaba abierto tras amarrar | Se cierra al amarrar |
| 14 | El rumbo mostraba "S 59°60' E" | Redondeo correcto: "S 60°00' E" |
| 15 | Rótulos de la cuadrícula fuera de pantalla | Líneas recortadas a la vista (Cyrus–Beck): el rótulo queda en el borde visible |

Tests de regresión: `test/qa/qaRegressions.test.ts` y, en el editor, los encuentros en T.

## Pendiente (no probable desde el PC)

- Replanteo con GPS al aire libre.
- Abrir los IFC en Revit (varios recintos y georreferenciado).
- CSV de una estación total real.

---

## QA en tableta — 2026-10-07 (APK `preview`, Expo 57, Lenovo TB370FU 1840×2944)

Instalación limpia (sin datos previos), proyecto `QA-Tablet`, operador `QA`. Solo horizontal (la
tablet estaba girada; no se cambió ningún ajuste del sistema).

| Prueba | Resultado |
|---|---|
| Arranque, migraciones v1–v3, crear operador / proyecto / espacio | ✅ |
| Lienzo Skia 2 + gestos: rectángulo 4 × 5 m, recinto detectado, área neta 18,66 m² | ✅ |
| Hoja de propiedades centrada y limitada de ancho (tableta) | ✅ |
| Medida cara a cara: interior 3,850 / exterior 4,150 / eje 4,000; con interior 3,00 el eje da 3,15, los muros unidos acompañan, área 14,54 | ✅ (la cifra aplicada era la vieja: ver F1) |
| Deshacer la medida: una sola acción restaura todo | ✅ |
| IFC del proyecto (SAF): 4 muros + recinto, validado con ifcopenshell | ✅ |
| Plano PDF (1 página, carta), cuadro de áreas CSV (neta 18,66 · perímetro 17,40 · eje 19,99) | ✅ |
| Paquete `.polylive` (esquema 3, 5 objetos, 7 actividades de avance) | ✅ |
| Ajustes: copia automática, restaurar, esquema v3, "Enviar diagnóstico" | ✅ visible; sin probar el envío |
| Registro fotográfico, cámara, importar `.polylive`, vertical | ⏳ pendiente |

Hallazgos (corregidos en `5cc602e`, entran en la próxima compilación):

- **F1 — "Guardar" de la medida aplicaba el valor anterior** si el teclado se cerraba con Atrás
  (`NumberField` solo confirmaba al salir del campo). Añadido `onDraft` y `MeasureDialog` usa lo tecleado.
- **F2 — Reabrir un espacio duplicaba el recinto** ("Recinto 2", nivel vacío, `bound = 0`): el editor
  detectaba antes de cargar los niveles y no reconocía el recinto guardado. `syncZones` espera al nivel;
  test `reabrir el espacio antes de cargar los niveles no duplica el recinto`. Los duplicados ya
  creados quedan sin ligar (no se ven ni salen en los exportes).
- **F3 — Menú ☰ dibujado abierto tras el selector de carpetas**: la animación de cierre se cortaba al pasar
  la app a segundo plano; mientras tanto los toques caían sobre el lienzo. `SideDrawer` y `BottomSheet`
  fijan su estado al volver a primer plano.

Observaciones menores (sin corregir): en tableta los diálogos y listas se estiran a todo el ancho; el
teclado tapa el campo "Nuevo operador" (el campo está al borde inferior); el encabezado
"ARQUITECTÓNICO" del FAB se parte en dos líneas; el selector de carpetas de Android (app Archivos de la
tablet) se colgó dos veces al listar la raíz (es del sistema).
