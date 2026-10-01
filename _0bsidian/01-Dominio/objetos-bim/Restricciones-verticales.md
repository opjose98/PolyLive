---
name: Restricciones-verticales
description: Base y tope de muros (por extremo) y columnas atados a niveles, como en Revit.
type: dominio
depends-on: "[[Wall-especificacion]], [[Column-especificación]], [[Niveles-y-fases]]"
mentioned-in: "[[EditorController]], [[ElevationEditor]], [[serializador-IFC-general]], [[MOC-PolyLive]]"
tags: #dominio #niveles #revit #F3b
---

# Restricciones verticales (base / tope)

Código: `src/domain/objects/vertical.ts` · UI: `ui/workspace/ConstraintSelector.tsx`

- Cada **extremo** de un muro tiene su base y su tope: nivel + desplazamiento, o altura libre ("sin
  conexión"). Con extremos distintos, el alzado se dibuja **trapezoidal**.
- Columnas: una sola extensión base/tope.
- La altura del objeto se **deriva** de las cotas de los niveles (`resolveWallProfile`, `resolveExtent`).
- `hostLevelOf`: nivel al que pertenece un muro (el de la base más baja).
- Por defecto, lo nuevo nace desde el nivel activo hasta el de arriba.
- Exportación: `PolyLive_RevitConstraints` (pset) y pisos IFC por nivel, para que Revit reconstruya las
  restricciones.
