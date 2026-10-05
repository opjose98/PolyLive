# 19 — Plan: topología persistente, Topografía de apoyo (M2b), Avance (M3) y Revisión (M4)

Fecha: 2026-10-03. Punto de partida: `main` @ 6c3ff6b (PR #11), auditoría `AUDITORIA_INTEGRAL_POLYLIVE.md`.

## Decisión de prioridad

La prioridad es **funcionalidad nueva** (M2b, M3, M4), no subir la nota de la auditoría. La auditoría se usa
como lista de riesgos a no empeorar. La única corrección de fondo que entra es la que bloquea todo lo
demás: **la topología y los recintos dejan de ser derivados y pasan a ser un modelo persistido con
identidad**. Suelo, Avance por recinto, áreas, IfcSpace y Rooms de Revit dependen de eso.

## Estado al empezar

| Capítulo | Estado |
|---|---|
| Levantamiento (muros, vanos, columnas, niveles, fases, alzado) | ✅ |
| Topografía M2 (amarre, mojones, coordenadas) | ✅ |
| Recintos | 🟡 derivados en cada recarga, sin id; solo el mayor se guarda y exporta |
| Uniones de muros | 🟡 implícitas; mover un extremo deja la esquina abierta |
| Suelo (F6a) | ⬜ |
| Topografía M2b | ⬜ |
| Avance M3 | ⬜ |
| Revisión M4 | ⬜ |

## Orden de ejecución (una rama y un PR por fase, apiladas)

### T0 — Topología persistente (`feat/t0-topologia-persistente`)
1. **Uniones.** Dos extremos que coinciden son una unión. Mover un extremo o el muro entero arrastra los
   extremos unidos y re-proyecta los encuentros en T. Todo en **un** paso de deshacer y con vista
   previa en vivo.
2. **Recintos con identidad.** Tabla `zones`: id estable, número, nombre, uso, nivel, polígono, punto
   semilla, área al eje, **área neta** (a cara interior) y perímetro. En cada recarga, una
   **reconciliación** asigna cada contorno detectado al recinto cuya semilla contiene:
   - dividir un recinto conserva la identidad del lado que tiene la semilla;
   - fusionar recintos conserva el más antiguo;
   - un recinto que deja de cerrarse queda "desligado", no se borra, así que deshacer lo recupera.
3. Seleccionar un recinto (tocar dentro), renombrarlo y asignarle un uso.
4. **IFC: un `IfcSpace` por recinto** en el piso de su nivel, a cara interior, con
   `Qto_SpaceBaseQuantities`. **DXF:** contorno y rótulo por recinto.

### F6a — Suelo (`feat/f6a-suelo`)
Herramienta Suelo: tocar un recinto crea un suelo ligado a él. El suelo sigue su contorno neto.
Se dibuja en planta y se exporta como `IfcSlab` por suelo. Es la base del Avance en planta.

### M2b — Topografía de apoyo (`feat/m2b-topografia`)
- Inverso (distancia, azimut, ΔN/ΔE/ΔZ entre dos puntos).
- Área y perímetro reales (recinto o polígono tocado).
- Cuadrícula de coordenadas.
- Replanteo GPS al punto elegido.
- Importar puntos CSV (estación total) y exportar CSV/KML.
- **IFC georreferenciado** (`IfcMapConversion` + `IfcProjectedCRS`).
- *Mapa de fondo offline:* sigue bloqueado hasta decidir la licencia de teselas. El filtro queda
  deshabilitado.

### M3 — Avance de obra (`feat/m3-avance`)
- Catálogo de actividades editable (nombre, color, unidad).
- Cortes por fecha.
- Pincel, borrador, relleno y rectángulo sobre suelos/recintos (planta) y caras de muro (alzado).
- Cuantificación por actividad y corte (muestreo en malla recortado al soporte).
- Cortes anteriores tenues.
- Reporte CSV y PDF.

### M4 — Revisión (`feat/m4-revision`)
- Marcas: trazo libre, flecha, rectángulo, texto y nube, con color; en planta y alzado.
- Comentario con autor, fecha, estado (abierto/resuelto) y foto opcional; lista de comentarios.
- Exportar a PDF y compartir.

### Infraestructura compartida (entra con la primera fase que la necesite)
- Capa viva genérica de trazos (pincel y marcas) en el lienzo de planta y en el de alzado.
- Plano a SVG, para los PDF de M3 y M4.
- Guardado de archivos binarios.
- Dependencias Expo: `expo-print`, `expo-sharing`, `expo-document-picker`.

## Riesgos que se aceptan conscientemente (de la auditoría)
- Las ediciones de recinto (nombre, uso) **no** entran al historial de deshacer: son metadatos.
- La medida sigue aplicándose al eje. Ahora mueve también los muros unidos, pero la semántica
  cara-a-cara queda para después.
- Sin migraciones versionadas: las tablas nuevas son aditivas (`CREATE TABLE IF NOT EXISTS`), como
  hasta ahora.
