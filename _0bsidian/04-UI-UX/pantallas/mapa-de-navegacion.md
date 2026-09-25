---
name: mapa-de-navegacion
description: Todas las pantallas de PolyLive y cómo se llega a cada funcionalidad.
type: ui-ux
depends-on: "[[Project-especificacion]], [[EditorController]], [[Canvas2D-interacción]]"
mentioned-in: "[[trazabilidad-nota-codigo-test]], [[sistema-de-diseño]]"
tags: #ui-ux #navegacion #mapa
---

# Mapa de navegación

## Flujo

```
OperatorSelector
      │
      ▼
   Proyectos ─────────────────────────────► Ajustes (modal)
      │                                        │
      ▼                                        ├─► Perfil de operador
 Espacios del proyecto                         ├─► Topografía
      │                                        └─► Restaurar copia → reinicio
      ▼
 ┌────────────────── pestañas del espacio ──────────────────┐
 │ Levantamiento   │  Galería  │  Exportar  │   Ajustes     │
 └─────────┬───────────────────────────────────────────────┘
           │
           ├─► Panel de propiedades (modal)
           │        └─► Elevación del muro (modal)
           ├─► Cámara anclada a la planta (modal)
           └─► Medida manual (modal)
```

## Qué cambió

El flujo anterior era `OperatorSelector → Dashboard (lista plana de Recintos) → pestañas`.

Ahora hay un nivel de **Proyecto** por encima (ver [[Project-especificacion]] sobre por qué). Al
arrancar se adoptan los Recintos que existían sin proyecto, para que el trabajo hecho con la versión
anterior no quede inalcanzable.

## Dónde está cada funcionalidad

| Funcionalidad | Cómo se llega |
|---|---|
| Crear / editar / borrar proyecto | Proyectos → `+ Nuevo` / `Editar` / `Eliminar` |
| Buscar proyecto | Proyectos → campo de búsqueda (nombre, código, autor, disciplina) |
| Crear espacio | Proyecto → `+ Nuevo espacio` |
| Renombrar / quitar espacio | Proyecto → tarjeta del espacio |
| **Trazar muros** | Levantamiento → herramienta `Muro` |
| **Puerta / Ventana** | Levantamiento → herramienta `Puerta` / `Ventana` → tocar sobre un muro |
| **Columna** | Levantamiento → herramienta `Columna` |
| **Seleccionar** | Levantamiento → herramienta `Seleccionar` |
| **Mover** | Seleccionar → arrastrar un handle |
| **Editar propiedades** | Seleccionar → banner `Propiedades ›` (o botón Propiedades) |
| **Eliminar objeto** | Panel de propiedades → `Eliminar` |
| **Deshacer / Rehacer** | Levantamiento → barra rápida `↶` `↷` |
| Paneo / zoom / encuadrar | Arrastrar / pinch / `⤢` |
| Snaps y rejilla | Barra rápida: `Ángulo`, `Nodos`, `Rejilla`, `Cotas` |
| Cerrar Recinto | Levantamiento → `Cerrar Recinto` |
| **Detectar recintos** | Levantamiento → `Detectar recintos` → adoptar una sugerencia |
| **Medición BLE** | Herramienta `Medir` → tocar muro → `Medir` en el panel BLE |
| **Medida manual** | Herramienta `Medir` → tocar muro → `Medida manual` |
| Historial de mediciones | Panel de propiedades de un muro |
| **Elevación de muro (MEM)** | Panel de propiedades de un muro → `Elevación` |
| Culata / coronación | Elevación → `Alturas del muro` |
| Propagar coronación | Elevación → `Propagar coronación a muros conectados` |
| Cuantificación bruta/neta | Elevación → tarjeta `Cuantificación` |
| **Foto anclada a la planta** | Levantamiento → herramienta `Foto` → tocar el punto |
| Foto suelta | Galería → botón de captura |
| Ver foto + metadata | Galería → tocar una foto |
| Vincular foto a objeto | Galería → pulsación larga, o visor → `Vincular` |
| Ocultar marcador en planta | Visor → `Ocultar en planta` |
| **Exportar IFC** | Exportar → `Exportar a IFC` (requiere Recinto cerrado) |
| **Exportar DXF** | Exportar → `Exportar a DXF` (funciona a medias) |
| **Copia de seguridad** | Ajustes → `Crear copia ahora` |
| **Restaurar copia** | Ajustes → tocar una copia de la lista |
| **Topografía** | Ajustes → `Abrir topografía` |
| Sistema de coordenadas de Sede | Topografía → `Definir sistema` (irreversible) |
| Punto de control (mojón) | Topografía → `Capturar GPS` → `Guardar punto` |
| Perfil / cambiar operador | Ajustes → `Ver perfil / cambiar operador` |

## Pantallas modales

Se abren **por encima** del navegador de pestañas, no como una pestaña más, porque son tareas con
principio y fin que devuelven al sitio del que salieron:

- Perfil de operador
- Topografía
- Elevación de muro
- Panel de propiedades
- Cámara
- Medida manual

## Reglas de UX que el mapa respeta

- **Toda herramienta lleva su ayuda contextual.** "Toca sobre un muro para colocar una puerta" es
  una regla invisible que el usuario solo descubriría fallando.
- **Tocar un objeto con `Seleccionar` abre el panel.** Es lo que el usuario quiere el 100% de las
  veces que selecciona algo.
- **Los objetivos táctiles miden al menos 44 px.** Ver [[sistema-de-diseño]].
- **Las acciones destructivas confirman y explican qué NO se borra.** Borrar un proyecto no borra
  los Recintos; quitar un espacio no borra el levantamiento.

## Código

`src/ui/App.tsx` y `src/ui/screens/`.
