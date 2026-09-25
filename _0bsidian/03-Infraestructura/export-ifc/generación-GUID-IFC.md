---
name: generación-GUID-IFC
description: UUID v4 comprimido a 22 caracteres para GUIDs de IFC.
type: infraestructura
depends-on: "[[serializador-IFC-general]]"
mentioned-in: "pseudocodigo-step-ifc.md §2"
tags: #ifc #guid #uuid
---

# Generación de GUID para IFC

## Fórmula
1. Generar UUID v4 (36 caracteres)
2. Extraer números y letras (sin guiones)
3. Convertir a base64 comprimido
4. Truncar a 22 caracteres

## Ejemplo
UUID v4: 550e8400-e29b-41d4-a716-446655440000
Comprimido: VQ6EAOKbQdSnFkRlVEAA

Cada objeto BIM obtiene un GUID único para el archivo IFC.

---

*Creada: 2026-09-14*