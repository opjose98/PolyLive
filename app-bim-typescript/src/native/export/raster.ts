// =============================================================================
// raster.ts — Imágenes para la memoria en Excel (Skia fuera de pantalla)
// =============================================================================
//
// Excel no muestra SVG de forma fiable: los dibujos del reporte (planta y
// alzados con lo pintado, que para el PDF son SVG) se rasterizan a PNG con
// Skia en una superficie de CPU. Las fotos se reducen (lado mayor 1280 px,
// JPEG al 80 %): una memoria con veinte fotos de 4 MB no se podría compartir.
// =============================================================================

import { ImageFormat, Skia } from '@shopify/react-native-skia';

export interface RasterImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** El SVG con tamaño fijo en px (los de los reportes traen solo `viewBox` y `width="100%"`). */
function sized(svg: string, widthPx: number): { svg: string; w: number; h: number } | null {
  const vb = /viewBox="([-\d.e]+) ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)"/.exec(svg);
  if (!vb) return null;
  const vw = Number(vb[3]);
  const vh = Number(vb[4]);
  if (!(vw > 0 && vh > 0)) return null;
  const w = Math.round(widthPx);
  const h = Math.max(1, Math.round((widthPx * vh) / vw));
  const out = svg.replace(/<svg ([^>]*?)width="100%"( style="[^"]*")?/, `<svg $1width="${w}" height="${h}"`);
  return { svg: out, w, h };
}

/** Rasteriza un SVG de reporte a PNG de `widthPx` de ancho (fondo blanco). */
export function svgToPng(svg: string, widthPx = 1400): RasterImage | null {
  const s = sized(svg, widthPx);
  if (!s) return null;
  const dom = Skia.SVG.MakeFromString(s.svg, Skia.FontMgr.System());
  const surface = Skia.Surface.Make(s.w, s.h);
  if (!dom || !surface) return null;
  const canvas = surface.getCanvas();
  canvas.drawColor(Skia.Color('#FFFFFF'));
  canvas.drawSvg(dom, s.w, s.h);
  surface.flush();
  const data = surface.makeImageSnapshot().encodeToBytes(ImageFormat.PNG);
  return data.length ? { data, width: s.w, height: s.h } : null;
}

/** Foto JPEG reducida a `maxPx` en su lado mayor (si ya es menor, se re-codifica igual). */
export function downscaleJpeg(bytes: Uint8Array, maxPx = 1280, quality = 80): RasterImage | null {
  const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!img) return null;
  const k = Math.min(1, maxPx / Math.max(img.width(), img.height()));
  const w = Math.max(1, Math.round(img.width() * k));
  const h = Math.max(1, Math.round(img.height() * k));
  const surface = Skia.Surface.Make(w, h);
  if (!surface) return null;
  const canvas = surface.getCanvas();
  canvas.drawImageRect(img, Skia.XYWHRect(0, 0, img.width(), img.height()), Skia.XYWHRect(0, 0, w, h), Skia.Paint());
  surface.flush();
  const data = surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, quality);
  return data.length ? { data, width: w, height: h } : null;
}
