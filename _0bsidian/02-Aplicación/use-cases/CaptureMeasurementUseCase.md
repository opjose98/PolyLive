---
name: CaptureMeasurementUseCase
description: UseCase para capturar medición (BLE o manual) — almacena promedio de 7 muestras.
type: aplicación
depends-on: "[[Wall-especificacion]], [[BLEManager]]"
mentioned-in: "Maestro §10, arquitectura-aplicacion-v1.md §5"
tags: #usecase #measurement #ble
---

# CaptureMeasurementUseCase

## Resumen
Captura una medición de distancia (desde BLE o entrada manual), almacena 7 muestras, calcula promedio y descartes outliers.

## Interfaz

```typescript
interface CaptureMeasurementUseCase {
  execute(input: CaptureMeasurementInput): Promise<CaptureMeasurementOutput>
}

interface CaptureMeasurementInput {
  wallId: WallId
  method: 'ble' | 'manual'
  value?: Meters                    // si method='manual'
}

interface CaptureMeasurementOutput {
  measurementId: MeasurementId
  average: Meters
  samples: Meters[]
  outliers: number[]
}
```

## Flujo BLE

```typescript
async execute(input: CaptureMeasurementInput): Promise<CaptureMeasurementOutput> {
  const samples: Meters[] = []
  
  if (input.method === 'ble') {
    // Capturar 7 muestras
    for (let i = 0; i < 7; i++) {
      const distance = await this.bleManager.measure()
      samples.push(distance)
    }
  } else {
    // Manual: 1 muestra
    samples.push(input.value!)
  }
  
  // Descartar outliers (IQR method)
  const sorted = [...samples].sort((a, b) => (a as number) - (b as number))
  const q1 = sorted[Math.floor(samples.length * 0.25)]
  const q3 = sorted[Math.floor(samples.length * 0.75)]
  const iqr = (q3 as number) - (q1 as number)
  
  const outliers: number[] = []
  const validSamples = samples.filter((s, i) => {
    if ((s as number) < (q1 as number) - 1.5 * iqr || (s as number) > (q3 as number) + 1.5 * iqr) {
      outliers.push(i)
      return false
    }
    return true
  })
  
  // Promediar
  const average = meters(validSamples.reduce((a, b) => (a as number) + (b as number), 0) / validSamples.length)
  
  // Persistir
  const measurement = {
    id: generateId(),
    wallId: input.wallId,
    capture_method: input.method,
    values_json: JSON.stringify(samples),
    average: average,
    is_deleted: false,
    created_at: new Date()
  }
  
  const measurementId = await this.objectStore.createMeasurement(measurement)
  
  return { measurementId, average, samples, outliers }
}
```

---

*Creada: 2026-09-14*