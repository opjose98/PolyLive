---
name: serializador-IFC-general
description: Cómo se genera un archivo .ifc válido — STEP format, GUIDs, entidades BIM.
type: infraestructura
depends-on: "[[Room-especificacion]], [[Wall-especificacion]], [[Door-especificacion]]"
mentioned-in: "pseudocodigo-step-ifc.md, Maestro §9"
tags: #ifc #export #serialización
---

# Serializador IFC — Formato General

## Resumen
Un archivo IFC es texto STEP (ISO 10303-21) que describe objetos BIM como IfcWall, IfcDoor, IfcSpace, etc.

Estructura básica:

ISO-10303-21
HEADER
FILE_DESCRIPTION(...)
FILE_NAME(...)
FILE_SCHEMA('IFC4')
ENDSEC
DATA
#1=IfcProject(...)
#2=IfcSite(...)
#3=IfcBuilding(...)
#4=IfcSpace(...)
#5=IfcWall(...)
ENDSEC
END-ISO-10303-21

## GUIDs
Cada entidad requiere un GUID único (36 caracteres, UUID v4 comprimido a 22 chars en IFC).

## Paso a paso
1. Crear IfcProject (raíz)
2. Crear IfcSite (ubicación)
3. Crear IfcBuilding (edificio)
4. Para cada Recinto: IfcSpace
5. Para cada Muro: IfcWall (child de Space)
6. Para cada vano: IfcOpeningElement (child de Wall)
7. Para cada Columna: IfcColumn

---

*Creada: 2026-09-14*