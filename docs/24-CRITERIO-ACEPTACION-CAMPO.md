# 24 — Criterio de aceptación de campo (medida)

Responde al hallazgo U17 de la auditoría: "no hay un criterio de aceptación de campo escrito". Sin él,
la calidad de la medida nunca se validó. Desde B3 (2026-10-06) la medida se aplica **de cara a cara** y
este documento fija qué significa "el levantamiento está bien medido".

## Qué se mide y cómo se aplica

| Referencia | Qué es | Cómo se aplica al modelo |
|---|---|---|
| **Cara interior** (por defecto) | De esquina interior a esquina interior del recinto: lo que mide un láser apoyado en un muro y apuntando al de enfrente | La longitud de **eje** se calcula con los espesores de los muros de cada extremo (L, T o X) |
| Cara exterior | De esquina exterior a esquina exterior (fachadas) | Igual, por la otra cara |
| Eje | Entre ejes (planos de diseño) | Directa |

- Al aplicar una medida, el extremo final del muro se desplaza a lo largo de su dirección. En una
  esquina en L el muro vecino **se traslada paralelo** (y estira al siguiente), así que un rectángulo
  medido sigue siendo rectángulo. En T o con varios vecinos se mueve el extremo con sus uniones.
- Cada medida queda en `measurements` con su referencia y la **longitud de eje aplicada**
  (trazabilidad medida → geometría).
- Si el muro no da a ningún recinto cerrado no hay "cara interior": la medida se aplica al eje y la app
  lo avisa.

## Control de cierre

Medir los lados no basta: un cuadrilátero con los lados correctos puede quedar torcido. En la hoja del
recinto, **"Diagonal medida en obra"** compara la diagonal más larga del modelo (a cara interior) con
la medida:

**Tolerancia = 1 cm + 1 mm por metro de diagonal.** Por ejemplo, ±1,5 cm en una diagonal de 5 m.

## Criterio de aceptación

Un recinto se acepta como medido cuando:

1. Cada cara medida queda a **< 1 cm** de lo ingresado.
2. El **área neta** queda a **±0,5 %** del producto de las medidas (en recintos rectangulares).
3. La **diagonal de control** cierra dentro de la tolerancia.

Los dos primeros se verifican automáticamente en `test/editor/EditorController.test.ts`
("criterio de campo"): un rectángulo dibujado a ojo y medido 3,70 × 2,60 m de cara interior cumple
con cara < 1 cm y área ±0,5 %. El tercero, en "diagonal de control". Las tolerancias geométricas del
dominio, en `test/topology/faceMeasure.test.ts` y `test/topology/closure.test.ts`.

## Prueba de campo pendiente (con láser)

Recinto real de unos 4 × 5 m: dibujar a ojo, medir con láser las cuatro caras interiores y la
diagonal, aplicar y registrar el error de cierre en este documento. Sin láser BLE conectado
(fuera del MVP), las medidas se ingresan a mano.
