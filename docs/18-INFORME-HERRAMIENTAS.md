# 18 — Informe de herramientas: estado y capítulos

> **Actualización 2026-10-03:** Suelo, Topografía M2b (inverso, área, replanteo, cuadrícula, CSV/KML,
> IFC georreferenciado), Avance (M3) y Revisión (M4) ya funcionan; recintos con identidad y uniones de muros.
> Ver `docs/20-T0-SUELO-M2b-M3-M4.md`.

> Fecha: 2026-10-01 · Base: `main` + PR #11 (tema, fluidez, dibujo).
> Fuente: el catálogo real (`application/workspace/catalog.ts`), las pantallas y el código que responde a
> cada control. Nada de este informe sale de la memoria: cada estado se verificó en el código y, donde se
> indica, en el teléfono.

**Leyenda**

| Marca | Significado |
|---|---|
| ✅ | Funciona de punta a punta (con pruebas y probado en el teléfono) |
| 🟡 | Funciona con limitaciones (ver nota) |
| ⬜ | Visible y **deshabilitada** a propósito: espera su fase |
| ⚠️ | **Incoherente:** se ve activa y cambia de estado, pero no hace nada todavía |

---

## 1. Capítulos (cómo se agrupa la app)

La app se entiende en **11 capítulos**. Los 8 primeros existen; 9 a 11 son las fases que siguen. El orden es
el del flujo de trabajo en obra: entrar → ubicarse en el lienzo → levantar → organizar en niveles → detallar
en alzado → amarrar → documentar → entregar → reportar avance → revisar.

| Cap. | Nombre | Qué cubre | Estado |
|---|---|---|---|
| 1 | **Entrada y organización** | Operador, proyectos, espacios, ajustes y respaldos | ✅ |
| 2 | **Lienzo y navegación** | Gestos, cámara, ejes y norte, zoom, tema, cuadrícula, snaps, escala | ✅ (con ⚠️ en toggles) |
| 3 | **Levantamiento en planta** | Muro, columna, puerta, ventana, medición, selección, propiedades | ✅ |
| 4 | **Niveles y fases** | Selectores de rango, base/tope de muros y columnas, existente | ✅ |
| 5 | **Alzado** | Vanos, puertas, ventanas en la cara del muro, lados A/B, minimapa | ✅ |
| 6 | **Topografía** | Sistema de coordenadas, amarre, mojones, GPS, coordenadas | ✅ núcleo (M2) · ⬜ M2b |
| 7 | **Fotos y auditoría** | Foto anclada a la planta, galería, vínculo a objetos | ✅ |
| 8 | **Exportación** | IFC para Revit, IFC y DXF del recinto | ✅ (IFC sin georreferencia aún) |
| 9 | **Avance de obra** | Pincel sobre suelos y caras de muro, cortes, reportes | ⬜ M3 (requiere F6a Suelo) |
| 10 | **Revisión** | Marcas, comentarios, exportar y compartir | ⬜ M4 |
| 11 | **Herramientas de dibujo** | Cota, Texto, Etiqueta, Coordenada, Línea, Polígono, Vano, Viga, Cercha, Correa | ⬜ F6b |

---

## 2. Capítulo 1 — Entrada y organización

| Herramienta | Dónde | Estado | Nota |
|---|---|---|---|
| Selector de operador (crear, elegir) | Primera pantalla | ✅ | Trazabilidad: queda como autor en mojones y amarres |
| Perfil del operador | ☰ → Operador | ✅ | Renombrar, cambiar de operador |
| Proyectos: crear, editar, eliminar, buscar | Pantalla Proyectos | ✅ | Código BIM automático (BIM001…) |
| Espacios: crear, renombrar, quitar, vista previa | Pantalla del proyecto | ✅ | Miniatura del recinto, área y estado (cerrado/abierto) |
| Ajustes y respaldos | ☰ → Ajustes | ✅ | Respaldo/restauración de la base (variante Expo) |
| Cambiar de proyecto / otros espacios | ☰ | ✅ | |

## 3. Capítulo 2 — Lienzo y navegación

### Gestos

| Gesto | Qué hace | Estado |
|---|---|---|
| Un dedo (Seleccionar) | Pan con inercia; arrastra un handle si lo tocas | ✅ |
| Un dedo (Muro) | Traza el muro; dos dedos mueven la vista | ✅ |
| Pellizco | Zoom alrededor de los dedos | ✅ (fluidez nueva: probar a mano) |
| Giro con dos dedos | Gira la vista; engancha a 0/90/180/270° y al norte | ✅ (probar a mano) |
| Toque | Selecciona (inmediato desde PR #11) | ✅ |
| Doble toque sobre un muro | Abre su alzado | ✅ (no en Topografía) |
| Toque largo | Propiedades (solo Levantamiento) | ✅ |
| Atrás de Android | Cierra hoja → panel → herramienta → sale del espacio | ✅ |

### Cromo

| Herramienta | Dónde | Estado | Nota |
|---|---|---|---|
| Barra de estado (proyecto · espacio, deshacer/rehacer, ⋮) | Arriba | ✅ | |
| Deshacer al pulgar | Junto al FAB + | ✅ | Toque = deshacer, largo = rehacer (PR #11) |
| BPC (barra de contexto) | Bajo la barra | ✅ | Lienzo / herramienta / selección; píldoras arrastrables |
| FAB de modo | Arriba a la derecha | ✅ | Levantamiento · Topografía · Avance · Revisión |
| Filtros y capas | Bajo el FAB de modo | ✅ / ⚠️ | Ver abajo |
| Ejes XYZ y norte | Abajo a la izquierda | ✅ | Tocar endereza la vista; aguja N con amarre |
| Chip de nivel y fase | Bajo la BPC | ✅ | |
| Herramientas de esquina | Abajo a la izquierda | ✅ / ⚠️ | Ver abajo |
| Drawer ⋮ (configuración del proyecto) | Barra → ⋮ | ✅ | Contextual al modo |
| Menú ☰ (app) | Barra → ☰ | ✅ | Espacio, Exportar, Proyecto, App |
| Tema claro / oscuro / alto contraste | Esquina → Tema, o ⋮ | ✅ | Toda la interfaz + color del modo (PR #11) |

### Herramientas de esquina (detalle)

| Fila | Ítem | Estado | Nota |
|---|---|---|---|
| Zoom | Encuadre, Acercar, Alejar, Zoom a selección | ✅ | |
| Snap | **Nodo** | ✅ | Extremos de muro |
| Snap | **Ángulo** | ✅ | 15° respecto al inicio |
| Snap | Vértice | ⚠️ | Se enciende, el editor no lo usa |
| Snap | Punto medio | ⚠️ | Ídem |
| Tema | Claro, Oscuro, Contraste | ✅ | |
| Cuadrícula | Líneas, Puntos | ✅ | Rejilla en GPU |
| Cuadrícula | Rotación | ⚠️ | El giro de la vista ya existe por gesto; este toggle no hace nada |
| Escala | Personalizada (1:50…) | 🟡 | Solo se muestra en la BPC; no cambia el dibujo |
| Escala | Acotado, Anotativa | ⚠️ | Sin efecto |

### Filtros y capas

| Modo | Filtro | Estado |
|---|---|---|
| Levantamiento | Muros, Columnas, Cotas, Fotos | ✅ |
| Topografía | Muros, Columnas, Vértices, Mojones, Rótulos de coordenadas, Norte | ✅ |
| Topografía | Cuadrícula de coordenadas, Mapa de fondo | ⚠️ (M2b) |
| Alzado | Vanos, Puertas, Ventanas, Cotas, Fotos | ✅ |
| Alzado | Vigas | ⚠️ (F6b) |
| Avance / Revisión | (sus filtros) | ⬜ (M3/M4) |
| Capas | Arquitectónico, Estructural | ✅ |
| Capas | Topografía, Coordinación | ⚠️ |

## 4. Capítulo 3 — Levantamiento en planta (FAB +)

| Categoría | Herramienta | Estado | Nota |
|---|---|---|---|
| Arquitectónico | **Muro** — arrastre libre / punto a punto | ✅ | Snap a nodo y ángulo; longitud y ángulo en vivo; espesor en píldora |
| Arquitectónico | **Columna** — rectangular / circular | ✅ | Base/tope por niveles |
| Arquitectónico | **Puerta** | ✅ | Toca el muro; hoja + arco; ancho en píldora |
| Arquitectónico | **Ventana** | ✅ | Vidrio doble |
| Arquitectónico | Suelo | ⬜ | F6a (base de Avance en planta) |
| Estructural | **Columna** | ✅ | Misma herramienta, en la categoría estructural |
| Estructural | Viga | ⬜ | F6b |
| Acotado | **Medición** | 🟡 | Manual ("Ingresar medida") ✅; láser Huepa por BLE sin interfaz (requiere Dev Client) |
| Acotado | Cota, Texto, Etiqueta | ⬜ | F6b |
| Dibujo | Coordenada, Línea, Polígono | ⬜ | F6b |
| Auditoría | **Foto** | ✅ | Ancla la foto al punto tocado; GPS si hay señal |

Edición del levantamiento:

| Herramienta | Estado | Nota |
|---|---|---|
| Seleccionar / arrastrar extremos y centro | ✅ | Arrastre en vivo en la capa viva (PR #11) |
| Panel de propiedades | ✅ | Espesor, material, portante, alturas, borrar, ver fotos, alzado |
| Píldoras de la BPC (espesor, ancho…) | ✅ | Arrastrar para ajustar |
| Recintos | ✅ | Se detectan solos al cerrar muros; área y nombre |
| Aviso de encuentro agudo | ✅ | |
| Deshacer/rehacer (historia única con el alzado) | ✅ | |

Representación (PR #11): cortes gruesos, poché según material (sólido / trama 45° / contorno), existente en
medio tono, cotas con trazos a 45° por fuera del recinto.

## 5. Capítulo 4 — Niveles y fases

| Herramienta | Estado | Nota |
|---|---|---|
| Selector de niveles (inferior · nivel · superior, candados) | ✅ | Calco atenuado del rango |
| Selector de fases | ✅ | Fases anteriores como "existente" |
| Crear, renombrar, borrar, cambiar cota | ✅ | Validado en base de datos (cotas únicas, base protegida) |
| Selector base/tope de muro (por extremo) y columna | ✅ | Restricciones tipo Revit |

## 6. Capítulo 5 — Alzado

| Herramienta | Estado | Nota |
|---|---|---|
| Abrir (doble toque en el muro) / volver | ✅ | Transición más corta (PR #11) |
| Vano, Puerta, Ventana en la cara | ✅ | Con antepecho y alto |
| Arrastrar y editar vanos (píldoras y hoja de detalles) | ✅ | Solo en Levantamiento |
| Lado A / B (espejo) | ✅ | |
| Minimapa | ✅ | |
| Igualar niveles con muros conectados | ✅ | |
| Perfil trapezoidal (extremos a distinto nivel) | ✅ | |
| Foto en alzado | ⬜ | Deshabilitada (no se ancla a la cara todavía) |
| Cota, Texto, Etiqueta, Coordenada, Línea, Polígono, Viga, Cercha, Correa | ⬜ | F6b |

## 7. Capítulo 6 — Topografía

| Herramienta | Estado | Nota |
|---|---|---|
| Asistente de amarre (sistema + método) | ✅ | MAGNA-SIRGAS: Origen Nacional, 5 Gauss-Krüger, lat/long |
| Sugerir sistema con GPS | ✅ | |
| Amarre por origen conocido + azimut | ✅ | Verificado a mano en el teléfono |
| Amarre por GPS (parado en un punto) | 🟡 | Funciona; precisión de celular (3–15 m). Promedio al aire libre sin probar en campo |
| Amarre por mojones (mínimos cuadrados, RMSE) | ✅ | |
| Ubicar solo un espacio | ✅ | |
| Mojón: tocar / Punto GPS / Coordenada digitada | ✅ | |
| Biblioteca de mojones (agregar, quitar, colocar) | ✅ | |
| Rótulos, sonda al tocar, tabla N/E y lat/long | ✅ | |
| Norte y enganche "norte arriba" | ✅ | |
| Inverso, Área, Replanteo | ⬜ | M2b |
| Mapa de fondo offline, cuadrícula de coordenadas | ⬜ | M2b (falta decidir licencia del mapa) |
| Importar CSV / exportar CSV-KML | ⬜ | M2b |

## 8. Capítulo 7 — Fotos y auditoría

| Herramienta | Estado | Nota |
|---|---|---|
| Foto anclada (herramienta Foto) | ✅ | Código FOT001…, GPS opcional |
| Tocar el marcador abre la foto | ✅ | (auditoría post-M2) |
| Galería del espacio | ✅ | Solo fotos de ese espacio (corregido en la auditoría) |
| Vincular foto a objeto BIM / ver fotos del objeto | ✅ | |
| Ocultar marcador, borrar | ✅ | |

## 9. Capítulo 8 — Exportación

| Herramienta | Estado | Nota |
|---|---|---|
| IFC para Revit (☰) | ✅ | Pisos por nivel, restricciones, GUIDs estables, guardado vía SAF |
| IFC y DXF del recinto (pantalla Exportar) | ✅ | DXF R2000 |
| IFC georreferenciado (IfcMapConversion) | ⬜ | M2b: el amarre ya existe; falta escribirlo |

## 10. Capítulos 9–11 — Lo que viene

| Cap. | Fase | Herramientas (hoy ⬜ en el FAB) |
|---|---|---|
| 9 Avance | F6a Suelo → M3 | Pincel, Borrador, Relleno, Rectángulo; catálogo de actividades; cortes; PDF/CSV |
| 10 Revisión | M4 | Trazo, Flecha, Rectángulo, Texto, Nube; estados, foto; exportar y compartir |
| 11 Dibujo | F6b | Cota, Texto, Etiqueta, Coordenada, Línea, Polígono, Vano en planta, Viga, Cercha, Correa |

---

## 11. Resumen numérico

| | Funcionan ✅ | Parcial 🟡 | Deshabilitadas ⬜ | Incoherentes ⚠️ |
|---|---|---|---|---|
| FAB + (todas las vistas y modos) | 12 | 1 | 39 | 0 |
| Herramientas de esquina (ítems) | 11 | 1 | 0 | 5 |
| Filtros y capas | 17 | 0 | 6 | 5 |

## 12. Recomendaciones (en orden)

1. **Corregir los ⚠️** (1 PR corto): implementar los snaps de vértice y punto medio (el `SnapHandler` ya
   calcula nodos; agregar punto medio es directo) y **deshabilitar** con "próximamente" lo demás (rotación de
   la cuadrícula —redundante con el gesto—, escala acotada/anotativa, capas Topografía/Coordinación, filtros
   de M2b). Regla del proyecto: sin función, visible pero deshabilitado.
2. **Guardar el tema** elegido entre sesiones (hoy vuelve a claro).
3. **M2b** con IFC georreferenciado primero (es lo que más aporta a Revit); decidir la licencia del mapa.
4. **F6a Suelo** → **M3 Avance** → **M4 Revisión** → **F6b** herramienta por herramienta.
5. Prueba de campo de pinch/giro y del promedio GPS al aire libre.
