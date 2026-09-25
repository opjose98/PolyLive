---
name: ValidationWarning-tipos
description: Enumeración de todos los tipos de warnings/errores de validación en el sistema.
type: dominio
depends-on: "[[RevitObjectBase]]"
mentioned-in: "Maestro §3, [[matriz-reglas-de-negocio]]"
tags: #validación #tipos #enumeración
---

# ValidationWarning — Tipos y Severidad

## Definición

```typescript
interface ValidationWarning {
  type: string                         // tipo único
  severity: 'warning' | 'error'        // severidad
  message: string                      // mensaje humanizado
  object_id?: RevitObjectId            // objeto afectado (opcional)
}

interface ValidationResult {
  valid: boolean                       // ¿pasó la validación?
  warnings: ValidationWarning[]        // lista de warnings/errores
}
```

## Catálogo completo de tipos

### Wall

| Tipo | Severidad | Significado |
|---|---|---|
| `wall_cross_unexpected` | error | Cruce no-limpio con otro muro |
| `acute_angle` | warning | Ángulo < 10° en encuentro |
| `invalid_thickness` | error | Espesor <= 0 |
| `invalid_height` | error | Alto <= 0 |
| `degenerate_wall` | error | Muro sin longitud (mismo punto inicio/fin) |

### Door / Window

| Tipo | Severidad | Significado |
|---|---|---|
| `orphan_vano` | error | Muro padre no existe |
| `vano_outside_wall` | warning | Vano sobresale del muro |
| `vano_perpendicular_outside` | warning | Offset perpendicular fuera de espesor |
| `invalid_width` | error | Ancho <= 0 |
| `invalid_height` | error | Alto <= 0 |

### Room

| Tipo | Severidad | Significado |
|---|---|---|
| `insufficient_vertices` | error | Menos de 3 vértices |
| `self_intersecting_polygon` | error | Polígono se cruza a sí mismo |
| `triangulation_failed` | error | CDT falló |
| `degenerate_triangles` | warning | Triángulos con área muy pequeña |
| `object_limit_exceeded` | error | >= 500 objetos |
| `object_limit_warning` | warning | >= 400 objetos |

### Export

| Tipo | Severidad | Significado |
|---|---|---|
| `room_open_export` | warning | Room aún abierto |
| `site_coordinate_system_missing` | warning | SiteCoordinateSystem no definido |
| `filesystem_access_denied` | error | No se puede escribir el archivo |

## Uso en código

```typescript
const result = wallValidationService.validate(newWall, context)

if (!result.valid) {
  // Hay errores bloqueantes
  showDialog("Validación fallida", result.warnings.map(w => w.message).join("\n"))
} else if (result.warnings.length > 0) {
  // Hay warnings (permitir continuar)
  showToast("Validación: " + result.warnings[0].message, "warning")
}
```

---

## Relacionado con

- Todos los servicios de validación (usan estos tipos)
- [[matriz-reglas-de-negocio]] — define qué es error vs warning
- Maestro §3 — define tipos como branded types

---

*Creada: 2026-09-14*