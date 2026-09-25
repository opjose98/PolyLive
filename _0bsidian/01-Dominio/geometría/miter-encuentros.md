---
name: miter-encuentros
description: Algoritmo de encuentros limpios Wall vs Wall — cálculo de ángulos y líneas de encuentro.
type: dominio
depends-on: "[[tipos-geométricos]], [[snap-angular]]"
mentioned-in: "Maestro §5.2, pseudocodigo-cdt.md"
tags: #geometría #core #validation
---

# Miter — Encuentros Limpios de Muros

## Resumen
Cuando dos muros se encuentran en una esquina, Miter calcula la línea de encuentro exacta, garantizando que:
1. Los muros se unen sin grietas ni solapamientos
2. El ángulo de encuentro es preciso (validación de ángulos agudos)
3. Los vértices de ambos muros coinciden exactamente

## El problema

Si el usuario traza dos muros que casi se tocan, pero no exactamente:
- Wall A: termina en `{x: 5.00, y: 3.00}`
- Wall B: comienza en `{x: 4.99, y: 3.01}`

Sin Miter, la triangulación genera triángulos feos en la grieta. **Miter resuelve exactamente dónde debe ir el vértice compartido.**

## Algoritmo

### Entrada
- `wall1: Wall` — primer muro
- `wall2: Wall` — segundo muro
- `tolerance: Meters` — tolerancia de "cercania" (típicamente 0.05m = 5cm)

### Proceso

1. **Detectar encuentro esperado:**
   - ¿El final de wall1 está cerca del inicio de wall2?
   - ¿El final de wall1 está cerca del final de wall2?
   - (etc., todas las combinaciones posibles)

2. **Calcular líneas infinitas:**
   - Extender wall1 y wall2 como líneas infinitas
   - Encontrar su intersección (si existen)

3. **Validar ángulo:**
   - Calcular ángulo de intersección
   - Si < 10°: warning "ángulo muy agudo", pero permitido (ver [[matriz-reglas-de-negocio]])
   - Si está dentro de snap angular (ver [[snap-angular]]): ajustar al snap más cercano

4. **Determinar punto de encuentro:**
   - Si las líneas se intersectan: usar el punto de intersección
   - Si son paralelas: reportar error

### Salida

```typescript
interface MiterResult {
  meetPoint: Point2D        // punto exacto de encuentro
  wall1EndPoint: Point2D    // vértice final corregido de wall1
  wall2StartPoint: Point2D  // vértice inicial corregido de wall2
  angle: Degrees            // ángulo de encuentro
  isValid: boolean          // ¿encuentro válido (ángulo OK)?
  warning?: string          // "acute_angle" si < 10°
}
```

## Casos especiales

1. **Muros paralelos:** No hay intersección. Error bloqueante.
2. **Muros colineales (mismo ángulo):** Intersección al infinito. Error bloqueante.
3. **Ángulo muy agudo (<5°):** Warning, pero permitido. El usuario podría estar modelando un detalle válido.

## Invariante

- El punto de encuentro es **la misma coordenada exacta** para ambos muros (simetría garantizada)
- Después de aplicar Miter, ningún triángulo debe tener arista cruzando una línea de encuentro

---

## Relacionado con

- [[tipos-geométricos]] — usa Point2D, Degrees
- [[snap-angular]] — ajusta el resultado a snap si aplica
- [[CDT-algoritmo]] — Miter se aplica **antes** de triangular
- [[matriz-reglas-de-negocio]] — define qué ángulos son warning vs bloqueo
- [[Wall-especificación]] — propiedades del muro

---

*Creada: 2026-09-14*