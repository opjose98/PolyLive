---
name: mapa-de-navegacion
description: Todas las pantallas de PolyLive y cómo se llega a cada funcionalidad (sin pestañas; ☰ y ⋮).
type: ui-ux
depends-on: "[[Project-especificacion]], [[EditorController]], [[ElevationEditor]], [[modos-de-trabajo]]"
mentioned-in: "[[trazabilidad-nota-codigo-test]], [[sistema-de-diseño]], [[estado-y-capitulos]]"
tags: #ui-ux #navegacion #mapa
---

# Mapa de navegación

Código: `ui/App.tsx` (flujo y pantallas del ☰), `ui/screens/SurveyScreen.tsx` (espacio de trabajo),
`ui/screens/ElevationView.tsx` (alzado como capa). Actualizado tras F5 (sin pestañas) y M1–M2.

## Flujo

```
Operador → Proyectos → Espacios del proyecto → Espacio de trabajo (planta)
                                                 ├─ FAB de modo → Levantamiento · Topografía · Avance · Revisión
                                                 ├─ doble toque en un muro → Alzado (capa encima; volver = flecha o Atrás)
                                                 ├─ ☰ (app) → Galería · Exportar · Operador · Ajustes y respaldos
                                                 └─ ⋮ (proyecto, contextual al modo) → Topografía, datos, tema, snap…
Atrás (Android): hoja → panel → herramienta → alzado → pantalla del ☰ → espacios
```

## Dónde está cada funcionalidad

| Quiero… | Dónde |
|---|---|
| dibujar muros, columnas, puertas, ventanas | FAB + → Arquitectónico (Levantamiento) |
| medir un muro | FAB + → Acotado → Medición, luego "Ingresar medida" en la BPC |
| foto anclada | FAB + → Auditoría → Foto; tocar el marcador la abre |
| propiedades / borrar | toque largo sobre el objeto (solo Levantamiento) |
| niveles y fases | selectores de rango (lado derecho) |
| base/tope del muro | selector B/T que aparece con Muro/Columna o con uno seleccionado |
| vanos en la cara | alzado → FAB + |
| coordenadas reales | modo Topografía → BPC "Coordenadas" / "Amarre", o ⋮ |
| tema claro/oscuro/contraste | esquina → Tema, o ⋮ |
| deshacer con una mano | botón junto al FAB + (largo = rehacer) |
| exportar a Revit | ☰ → IFC para Revit |
| IFC y DXF del recinto | ☰ → IFC y DXF del recinto |

## Reglas de UX

- Un solo panel abierto a la vez; tocar el lienzo cierra lo abierto.
- Solo Levantamiento edita el modelo ([[modos-de-trabajo]]).
- Herramienta sin función: visible y deshabilitada ([[catalogo-herramientas]]).
- Lo frecuente, al alcance del pulgar ([[uso-a-una-mano]]).
