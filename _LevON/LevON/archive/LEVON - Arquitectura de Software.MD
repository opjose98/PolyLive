# 📐 LEVON — Arquitectura de Software (Documento Maestro)

## 🧭 1. VISIÓN GENERAL DEL PROYECTO

**Nombre clave:** LevON
**Inspiración base:** MeasureOn de Bosch
**Tipo de software:** Aplicación open source multiplataforma (Android + PC)
**Dominio:** Levantamientos arquitectónicos, generación de planos y modelado BIM ligero

---

## 🎯 2. OBJETIVO DEL PROYECTO

Desarrollar una aplicación open source multiplataforma que permita:

* Realizar levantamientos arquitectónicos de manera eficiente
* Dibujar planos en tiempo real o posterior al levantamiento
* Gestionar elementos constructivos bajo un enfoque BIM (orientado a objetos)
* Documentar espacios mediante imágenes y metadatos
* Exportar información a formatos estándar (PDF, CAD, IFC)

---

## 📦 3. ALCANCE DEL PROYECTO

### ✔ Incluye

* Editor de planos 2D interactivo
* Modelo de datos BIM (orientado a objetos)
* Sistema de medición manual (fase inicial)
* Asociación de fotografías a elementos del modelo
* Exportación a:

  * PDF (planos)
  * DXF (CAD)
  * IFC (BIM interoperable)
* Multiplataforma: Android + Desktop

### ❌ No incluye (fase inicial)

* Integración directa con hardware (láser, LiDAR)
* Modelado estructural avanzado
* Simulación energética
* Renderizado fotorrealista

---

## 🧱 4. PRINCIPIOS DE DISEÑO

* **Open Source First**
* **BIM-Driven Architecture**
* **Offline-first capability**
* **Modularidad estricta**
* **Escalabilidad horizontal (features)**
* **Precisión geométrica controlada**
* **UX orientada a campo (levantamientos rápidos)**

---

## 🏗️ 5. ARQUITECTURA GENERAL DEL SISTEMA

### 5.1 Capas del sistema

```
[ UI (Flutter) ]
        ↓
[ Application Layer ]
        ↓
[ Domain Layer (BIM Model) ]
        ↓
[ Geometry Engine ]
        ↓
[ Persistence Layer ]
        ↓
[ Export Layer ]
```

---

## 📱 6. FRONTEND

### Tecnología

* Flutter (Dart)

### Responsabilidades

* Renderizado de planos 2D
* Interacción táctil (zoom, pan, snap)
* Gestión de proyectos
* Entrada de datos (medidas, objetos)
* Visualización de fotos

### Requisitos clave

* Sistema de snapping (puntos, ejes, intersecciones)
* Soporte de múltiples capas
* Renderizado eficiente (canvas optimizado)

---

## 🧠 7. DOMAIN MODEL (BIM LIGERO)

### 7.1 Principio fundamental

Todo elemento debe ser una **entidad semántica**, no solo geometría.

---

## 7.2 Entidades principales

### 🧱 Wall (Muro)

#### Tipologías geométricas soportadas:

* Rectangular
* Trapecial
* Poligonal irregular
* Curvo (arcos definidos por radio o spline)

#### Propiedades:

* id: UUID
* geometry: Shape
* thickness: float
* height: float
* material: string
* start_point: Vector2
* end_point: Vector2
* curvature (opcional):

  * radius
  * control_points

---

### 🚪 Door (Puerta)

* host_wall: Wall
* width
* height
* position (paramétrica sobre muro)

---

### 🪟 Window (Ventana)

* host_wall
* dimensions
* sill_height

---

### 🏠 Room (Espacio)

* boundary: lista de muros
* area (calculada)
* perimeter
* name

---

### 📸 Photo

* id
* file_path
* associated_element (Wall, Room, etc.)
* metadata:

  * fecha
  * descripción
  * coordenadas

---

## 📐 8. MOTOR GEOMÉTRICO

### Responsabilidades

* Cálculo de intersecciones
* Validación topológica
* Generación de polígonos cerrados
* Manejo de curvas

### Tipos de geometría soportados

* Líneas
* Arcos
* Splines
* Polígonos complejos

---

## 🧮 9. SISTEMA DE COORDENADAS

* Sistema cartesiano 2D (X, Y)
* Unidad base: metros
* Precisión mínima: 0.001 m

---

## 🧩 10. FUNCIONALIDADES CLAVE

### 10.1 Editor de planos

* Dibujo de muros con snapping
* Edición paramétrica
* División y unión de muros
* Soporte de curvas

---

### 10.2 Medición

* Entrada manual
* Restricciones geométricas

---

### 10.3 Gestión de fotos

* Asociación a objetos
* Visualización contextual

---

## 💾 11. PERSISTENCIA

### Formato interno

* JSON estructurado

### Estructura

```
Project
 ├── Elements
 │     ├── Walls
 │     ├── Doors
 │     ├── Windows
 │     └── Rooms
 ├── Photos
 └── Metadata
```

---

## 📤 12. EXPORTACIONES

### 12.1 PDF

* Planos 2D
* Cotas
* Escalas

---

### 12.2 DXF

* Geometría vectorial
* Capas por tipo de objeto

---

### 12.3 IFC

* Entidades BIM
* Compatibilidad con Revit
* Mapeo:

  * Wall → IfcWall
  * Door → IfcDoor
  * Room → IfcSpace

---

## 🔄 13. FLUJO DE USUARIO

1. Crear proyecto
2. Definir espacio
3. Dibujar muros
4. Añadir objetos
5. Insertar fotos
6. Validar geometría
7. Exportar

---

## 🧪 14. VALIDACIONES

* No permitir muros desconectados en espacios cerrados
* Validación de intersecciones
* Control de geometría inválida

---

## ⚙️ 15. EXTENSIBILIDAD

El sistema debe permitir:

* Integración futura con sensores
* Plugins (exportadores, análisis)
* Sincronización en la nube

---

## 🚧 16. ROADMAP

### Fase 1

* Editor básico
* Muros rectos
* Export PDF

### Fase 2

* Curvas y trapecios
* Objetos BIM
* DXF

### Fase 3

* IFC
* Fotos
* Validaciones avanzadas

### Fase 4

* Sensores
* Automatización

---

## ⚠️ 17. RIESGOS TÉCNICOS

* Complejidad geométrica (curvas y topología)
* Consistencia BIM
* Rendimiento en móviles
* Exportación IFC correcta

---

## 🧭 18. DEFINICIÓN FINAL

LevON no es un simple editor de planos.

Es:

> Un sistema híbrido entre levantamiento en campo, modelado BIM ligero y documentación técnica.

Debe comportarse como:

* Simple como una app móvil
* Preciso como un CAD
* Estructurado como un BIM

---

## 🔚 19. DECLARACIÓN FINAL

Este documento define la base técnica absoluta del proyecto LevON.
Ninguna decisión de desarrollo debe contradecir estos principios sin revisión arquitectónica formal.

---
