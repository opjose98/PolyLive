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
