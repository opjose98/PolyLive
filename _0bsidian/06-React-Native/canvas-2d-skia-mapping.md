---
name: canvas-2d-skia-mapping
description: Mapeo de métodos Canvas2D a API Skia para renderizado móvil
type: technical
depends-on: "[[Canvas2D-interacción]]"
tags: #skia #canvas #graphics #mapping
---

# Canvas2D → Skia Mapping

## Métodos a Mapear

| Canvas2D | Skia | Notas |
|---|---|---|
| ctx.fillRect(x,y,w,h) | canvas.drawRect(rect, paint) | usa Paint.setColor() |
| ctx.strokeRect(x,y,w,h) | canvas.drawRect(rect, paint) | paint.setStroke() |
| ctx.fillPolygon(points) | canvas.drawPath(path, paint) | Path.addPoly(points) |
| ctx.drawLine(x1,y1,x2,y2) | canvas.drawLine(x1,y1,x2,y2, paint) | directo |
| ctx.fillCircle(x,y,r) | canvas.drawCircle(x,y,r, paint) | directo |
| ctx.fillStyle = color | paint.setColor(color) | antes de draw |
| ctx.strokeStyle = color | paint.setColor(color) | con setStroke() |
| ctx.lineWidth = w | paint.setStrokeWidth(w) | antes de draw |
| ctx.save() / restore() | canvas.save() / restore() | state stack |

## Adapter Pattern

```typescript
class SkiaCanvasAdapter {
  constructor(private canvas: Canvas) {}
  
  fillRect(x, y, w, h, color) {
    const paint = new Paint()
    paint.setColor(color)
    this.canvas.drawRect(Rect.MakeXYWH(x, y, w, h), paint)
  }
  
  // ...otros métodos
}
```

*Creada: 2026-09-16*