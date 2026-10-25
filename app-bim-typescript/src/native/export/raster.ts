// =============================================================================
// raster.ts — Imágenes para la memoria en Excel (Skia fuera de pantalla)
// =============================================================================
//
// Excel no muestra SVG de forma fiable: los dibujos del reporte (planta y
// alzados con lo pintado, que para el PDF son SVG) se rasterizan a PNG con
// Skia en una superficie de CPU. Las fotos se reducen (lado mayor 1280 px,
// JPEG al 80 %): una memoria con veinte fotos de 4 MB no se podría compartir.
//
// Memoria nativa: una foto de 12 MP decodificada ocupa ~48 MB RGBA que Hermes
// no ve (el GC no corre a tiempo). Por eso cada imagen, superficie y snapshot
// se libera con dispose() apenas se codifica, y el lado mayor de un dibujo
// tiene tope (una planta angosta y alta pediría una superficie enorme).
// =============================================================================

import { ImageFormat, Skia } from '@shopify/react-native-skia';

export interface RasterImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** Lado mayor máximo de un dibujo rasterizado (px). */
const MAX_SIDE_PX = 2400;

/** Libera un objeto JSI de Skia sin romper si ya no existe. */
function free(o: { dispose?: () => void } | null | undefined): void {
  try {
    o?.dispose?.();
  } catch {
    // ya liberado: nada que hacer
  }
}

/** El SVG con tamaño fijo en px (los de los reportes traen solo `viewBox` y `width="100%"`). */
function sized(svg: string, widthPx: number): { svg: string; w: number; h: number } | null {
  const vb = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(svg);
  if (!vb) return null;
  const vw = Number(vb[3]);
  const vh = Number(vb[4]);
  if (!(vw > 0 && vh > 0)) return null;
  // Tope al lado mayor: conserva la proporción.
  const k = Math.min(1, MAX_SIDE_PX / Math.max(widthPx, (widthPx * vh) / vw));
  const w = Math.max(1, Math.round(widthPx * k));
  const h = Math.max(1, Math.round(((widthPx * vh) / vw) * k));
  const out = svg.replace(/<svg ([^>]*?)width="100%"( style="[^"]*")?/, `<svg $1width="${w}" height="${h}"`);
  return { svg: out, w, h };
}

/** Rasteriza un SVG de reporte a PNG de `widthPx` de ancho (fondo blanco). */
export function svgToPng(svg: string, widthPx = 1400): RasterImage | null {
  const s = sized(svg, widthPx);
  if (!s) return null;
  const dom = Skia.SVG.MakeFromString(s.svg, Skia.FontMgr.System());
  const surface = dom ? Skia.Surface.Make(s.w, s.h) : null;
  let snapshot: ReturnType<NonNullable<typeof surface>['makeImageSnapshot']> | null = null;
  try {
    if (!dom || !surface) return null;
    const canvas = surface.getCanvas();
    canvas.drawColor(Skia.Color('#FFFFFF'));
    canvas.drawSvg(dom, s.w, s.h);
    surface.flush();
    snapshot = surface.makeImageSnapshot();
    const data = snapshot.encodeToBytes(ImageFormat.PNG);
    return data.length ? { data, width: s.w, height: s.h } : null;
  } finally {
    free(snapshot);
    free(surface);
    free(dom);
  }
}

/** ¿Los bytes son un JPEG (FF D8 FF)? */
export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/** Foto JPEG reducida a `maxPx` en su lado mayor (si ya es menor, se re-codifica igual). */
export function downscaleJpeg(bytes: Uint8Array, maxPx = 1280, quality = 80): RasterImage | null {
  const encoded = Skia.Data.fromBytes(bytes);
  const img = Skia.Image.MakeImageFromEncoded(encoded);
  const k = img ? Math.min(1, maxPx / Math.max(img.width(), img.height())) : 1;
  const w = img ? Math.max(1, Math.round(img.width() * k)) : 1;
  const h = img ? Math.max(1, Math.round(img.height() * k)) : 1;
  const surface = img ? Skia.Surface.Make(w, h) : null;
  let snapshot: ReturnType<NonNullable<typeof surface>['makeImageSnapshot']> | null = null;
  try {
    if (!img || !surface) return null;
    const canvas = surface.getCanvas();
    canvas.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
    surface.flush();
    snapshot = surface.makeImageSnapshot();
    const data = snapshot.encodeToBytes(ImageFormat.JPEG, quality);
    return data.length ? { data, width: w, height: h } : null;
  } finally {
    free(snapshot);
    free(surface);
    free(img);
    free(encoded);
  }
}
