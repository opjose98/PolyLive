// =============================================================================
// draftExport.ts — El dibujo técnico (F6b) hacia DXF e IFC
// =============================================================================
//
// DXF: la PLANTA del dibujo como entidades simples en capas AIA/NCS (líneas,
// polilíneas y textos). Las cotas van "explotadas" (líneas de referencia,
// línea de cota, trazos a 45° y el valor): un DIMENSION de R2000 exige un
// bloque anónimo y un estilo completos, y los lectores lo interpretan distinto;
// las líneas se ven igual en cualquier programa. Todo en coordenadas del
// MODELO (Y abajo); el serializador las pasa a Y arriba.
//
// Los textos tienen su tamaño en el PAPEL: a escala 1:N, h(m) = mm × N / 1000.
//
// IFC: lo estructural (vigas, cerchas y correas) como barras con sección,
// en la vista donde se dibujó: planta (eje en planta) o cara de muro ((u, v)
// del muro). El serializador las lleva a 3D con la geometría de su muro.
// =============================================================================

import type { Point2D } from '../../domain/geometry/types';
import { DraftItem, dimensionLine, itemLength, polygonMetrics, segmentLength, trussParts } from '../../domain/drafting/drafting';
import { DRAFT_DXF_LAYERS, DxfDraftEntity } from '../../infrastructure/export/dxf/DXFSerializer';

import type { IfcMemberInput } from '../../infrastructure/export/ifc/types';

// ---------------------------------------------------------------------------
// DXF
// ---------------------------------------------------------------------------

interface DraftDxfContext {
  /** Escala del plano (1:N): fija el alto de los textos en metros. */
  readonly denominator: number;
  /** Rótulo de una coordenada (N/E reales o X/Y locales). */
  readonly coordText: (p: Point2D) => readonly string[];
  /** Centro del objeto etiquetado, para la línea de referencia. */
  readonly targetCenter?: (id: string) => Point2D | null;
}

/** Alto en metros de un texto de `mm` milímetros en el papel. */
export function paperHeight(mm: number, denominator: number): number {
  return (mm * (denominator > 0 ? denominator : 50)) / 1000;
}

const PT_MM = 0.3528;
const f2 = (v: number) => v.toFixed(2);

/** Entidades DXF de los elementos de PLANTA (los de alzado no van al DXF de planta). */
export function draftDxfEntities(items: readonly DraftItem[], ctx: DraftDxfContext): DxfDraftEntity[] {
  const out: DxfDraftEntity[] = [];
  const h = (mm: number) => paperHeight(mm, ctx.denominator);
  const L = DRAFT_DXF_LAYERS;
  for (const i of items) {
    if (i.view.kind !== 'plan') continue;
    const [a, b] = i.points;
    switch (i.kind) {
      case 'dimension': {
        if (!a || !b) break;
        const off = i.props.offset ?? 0.4;
        const d = dimensionLine(a, b, off);
        const over = Math.sign(off || 1) * h(2); // la línea de referencia pasa 2 mm la de cota
        const ext = (p: Point2D, q: Point2D) => ({ kind: 'line' as const, layer: L.dims, a: p, b: { x: q.x + d.nx * over, y: q.y + d.ny * over } });
        out.push(ext(a, d.a), ext(b, d.b), { kind: 'line', layer: L.dims, a: d.a, b: d.b });
        // Trazos a 45° de 3 mm de papel en cada extremo.
        const len = segmentLength(a, b) || 1;
        const ux = (b.x - a.x) / len;
        const uy = (b.y - a.y) / len;
        const t = h(1.5);
        for (const p of [d.a, d.b]) {
          out.push({ kind: 'line', layer: L.dims, a: { x: p.x - (ux + d.nx) * t, y: p.y - (uy + d.ny) * t }, b: { x: p.x + (ux + d.nx) * t, y: p.y + (uy + d.ny) * t } });
        }
        const mid = { x: (d.a.x + d.b.x) / 2 + d.nx * h(1.5), y: (d.a.y + d.b.y) / 2 + d.ny * h(1.5) };
        out.push({ kind: 'text', layer: L.dims, at: mid, text: f2(itemLength(i)), height: h(2.5), center: true });
        break;
      }
      case 'text':
        if (a && i.text) {
          i.text.split('\n').forEach((line, k) => {
            const ht = h((i.props.size ?? 12) * PT_MM);
            out.push({ kind: 'text', layer: L.text, at: { x: a.x, y: a.y + k * ht * 1.4 }, text: line, height: ht });
          });
        }
        break;
      case 'tag': {
        if (!a) break;
        const from = i.targetId ? ctx.targetCenter?.(i.targetId) : null;
        if (from) out.push({ kind: 'line', layer: L.tags, a: from, b: a });
        i.text.split('\n').forEach((line, k) => out.push({ kind: 'text', layer: L.tags, at: { x: a.x, y: a.y + k * h(2.5) * 1.4 }, text: line, height: h(2.5) }));
        break;
      }
      case 'coordinate': {
        if (!a) break;
        const s = h(2);
        out.push({ kind: 'line', layer: L.coords, a: { x: a.x - s, y: a.y }, b: { x: a.x + s, y: a.y } });
        out.push({ kind: 'line', layer: L.coords, a: { x: a.x, y: a.y - s }, b: { x: a.x, y: a.y + s } });
        ctx.coordText(a).forEach((line, k) =>
          out.push({ kind: 'text', layer: L.coords, at: { x: a.x + s * 1.5, y: a.y + k * h(2) * 1.4 }, text: line, height: h(2) }),
        );
        break;
      }
      case 'line':
        if (a && b) out.push({ kind: 'line', layer: L.lines, a, b });
        break;
      case 'polygon':
        if (i.points.length >= 3) {
          out.push({ kind: 'polyline', layer: L.areas, points: i.points, closed: true });
          const c = centroidOf(i.points);
          out.push({ kind: 'text', layer: L.areas, at: c, text: `${f2(polygonMetrics(i.points).area)} m2`, height: h(2.5), center: true });
        }
        break;
      case 'beam': {
        if (!a || !b) break;
        // Por encima del corte: dos líneas de trazos a ±base/2 y su sección.
        const w = (i.props.width ?? 0.3) / 2;
        const len = segmentLength(a, b) || 1;
        const nx = -(b.y - a.y) / len;
        const ny = (b.x - a.x) / len;
        for (const s of [w, -w]) {
          out.push({ kind: 'line', layer: L.beams, a: { x: a.x + nx * s, y: a.y + ny * s }, b: { x: b.x + nx * s, y: b.y + ny * s }, dashed: true });
        }
        const mid = { x: (a.x + b.x) / 2 - nx * (w + h(1.5)), y: (a.y + b.y) / 2 - ny * (w + h(1.5)) };
        out.push({ kind: 'text', layer: L.beams, at: mid, text: `V ${cm(i.props.width ?? 0.3)}x${cm(i.props.depth ?? 0.4)}`, height: h(2), center: true });
        break;
      }
      case 'truss':
        // En planta, una cercha se ve como su eje.
        if (a && b) out.push({ kind: 'line', layer: L.trusses, a, b, dashed: true });
        break;
      case 'purlin':
        break; // solo en alzado (sección)
    }
  }
  return out;
}

const cm = (m: number) => Math.round(m * 100);

function centroidOf(points: readonly Point2D[]): Point2D {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

// ---------------------------------------------------------------------------
// IFC
// ---------------------------------------------------------------------------

/** Barras IFC de vigas, cerchas y correas (planta y alzado). */
export function draftIfcMembers(items: readonly DraftItem[]): IfcMemberInput[] {
  const out: IfcMemberInput[] = [];
  let beams = 0;
  let trusses = 0;
  let purlins = 0;
  for (const i of items) {
    const [a, b] = i.points;
    if (!a) continue;
    const base = { view: i.view, levelId: i.levelId };
    if (i.kind === 'beam' && b && segmentLength(a, b) > 1e-3) {
      out.push({
        ...base,
        id: i.id,
        name: `Viga ${++beams} (${cm(i.props.width ?? 0.3)}x${cm(i.props.depth ?? 0.4)})`,
        role: 'beam',
        a,
        b,
        width: i.props.width ?? 0.3,
        depth: i.props.depth ?? 0.4,
        topAligned: true,
      });
    } else if (i.kind === 'truss' && b && segmentLength(a, b) > 1e-3) {
      const n = ++trusses;
      const parts = trussParts(a, b, i.props.depth ?? 0.6);
      const bar = 0.1; // sección de cada barra: 10 × 10 cm (no se dibuja en el plano)
      parts.chords.forEach(([p, q], k) =>
        out.push({ ...base, id: `${i.id}:c${k}`, name: `Cercha ${n} · cordón ${k + 1}`, role: 'chord', a: p, b: q, width: bar, depth: bar, topAligned: false }),
      );
      parts.webs.forEach(([p, q], k) =>
        out.push({ ...base, id: `${i.id}:w${k}`, name: `Cercha ${n} · alma ${k + 1}`, role: 'web', a: p, b: q, width: bar, depth: bar, topAligned: false }),
      );
    } else if (i.kind === 'purlin') {
      out.push({
        ...base,
        id: i.id,
        name: `Correa ${++purlins} (${cm(i.props.width ?? 0.1)}x${cm(i.props.depth ?? 0.2)})`,
        role: 'purlin',
        a,
        b: a,
        width: i.props.width ?? 0.1,
        depth: i.props.depth ?? 0.2,
        topAligned: false,
      });
    }
  }
  return out;
}
