// =============================================================================
// useProgressReport — Lo que el reporte de avance necesita de la pantalla
// =============================================================================
//
// El modelo del reporte es puro (progressReport.ts, progressMemoria.ts); aquí
// se le da lo que vive en la pantalla y en el teléfono:
//   · dibujos de un corte (planta con los suelos, caras de muro, columnas
//     desdobladas), solo con el alcance y las actividades elegidas;
//   · las fotos de avance (de la base) y su imagen (reducida);
//   · el PDF (HTML) y la memoria en Excel (con dibujos rasterizados y fotos).
// =============================================================================

import { useCallback } from 'react';
import type { AppServices } from '../../../application/AppServices';
import type { EditorController, DetectedRoom } from '../../../application/editor/EditorController';
import { buildReport, reportCsvBlocks, reportHtmlBlocks, ReportCutBlock, ReportDrawing, ReportOptions, ReportPhoto } from '../../../application/progress/progressReport';
import { buildMemoria, MemoriaHeader, MemoriaImage, MemoriaItem } from '../../../application/progress/progressMemoria';
import { reportPhotosOf } from '../../../application/progress/progressPhotos';
import { planSvg, faceSvg } from '../../../application/report/planSvg';
import { targetOfKey } from '../../../domain/progress/progress';
import { centroid } from '../../../domain/geometry/polygon-utils';
import type { RoomId } from '../../../domain/objects/base';
import { downscaleJpeg, svgToPng } from '../../../native/export/raster';
import { uint8ArrayToBase64 } from '../../../shared/encoding/base64';
import { record } from '../../../shared/diagnostics';
import type { Progress } from './useProgress';

interface ReportInput {
  readonly services: AppServices;
  readonly roomId: RoomId;
  readonly editor: EditorController;
  readonly rooms: readonly DetectedRoom[];
  readonly progress: Progress;
  readonly supportLabel: (key: string) => string;
  readonly project: string;
  readonly space: string;
  readonly operator: string;
}

export function useProgressReport({ services, roomId, editor, rooms, progress, supportLabel, project, space, operator }: ReportInput) {
  const { ctl } = progress;

  /** Fotos de avance del espacio (sin la imagen). */
  const loadPhotos = useCallback(async (): Promise<ReportPhoto[]> => reportPhotosOf(await services.store.listAuditPhotos(roomId)), [services, roomId]);

  /** Imagen de una foto, reducida (JPEG). */
  const photoJpeg = useCallback(
    async (id: string) => {
      try {
        const p = await services.store.readAuditPhoto(id as never);
        if (!p?.foto) return null;
        return downscaleJpeg(p.foto as Uint8Array) ?? { data: p.foto as Uint8Array, width: 1280, height: 960 };
      } catch (err) {
        // Sin la foto el reporte igual sale (dice «Foto no disponible»).
        record('warn', 'progress-report', `Foto ${id} no disponible`, err);
        return null;
      }
    },
    [services],
  );

  /** Marcas de las actividades elegidas. */
  const marksOf = useCallback(
    (activityIds: readonly string[] | null) => ctl.getState().marks.filter((m) => !activityIds || activityIds.includes(m.activityId)),
    [ctl],
  );

  /** Planta con los suelos pintados (solo los del alcance). */
  const planDrawing = useCallback(
    (cutId: string, keys: readonly string[] | null, activityIds: readonly string[] | null): ReportDrawing | null => {
      const floorKeys = (keys ?? progress.supportKeysOfKind('floor')).filter((k) => k.startsWith('floor:'));
      if (!floorKeys.length) return null;
      const layers = ctl.layersFor(cutId, true, marksOf(activityIds), new Set(floorKeys));
      const freeFloors = progress.floors.filter((f) => f.zoneId.startsWith('floor:') && floorKeys.includes(`floor:${f.zoneId}`));
      const svg = planSvg({
        walls: editor.walls.map((w) => ({ start: w.startPoint, end: w.endPoint, thickness: w.thickness as number })),
        zones: [
          ...rooms
            .filter((r) => (r.netPolygon?.length ?? 0) >= 3)
            .map((r) => ({ polygon: r.netPolygon!, label: r.name ?? 'Recinto', sublabel: `${(r.netArea ?? r.area).toFixed(2)} m²`, at: r.centroid })),
          ...freeFloors.map((f) => ({ polygon: f.polygon, label: supportLabel(`floor:${f.zoneId}`), at: centroid(f.polygon) })),
        ],
        layers,
        scaleBar: true,
      });
      return { title: keys?.length === 1 ? `Planta · ${supportLabel(keys[0])}` : 'Planta · suelos', svg };
    },
    [ctl, progress, editor, rooms, marksOf, supportLabel],
  );

  /** Alzado de un soporte vertical (cara de muro o columna) con lo pintado. */
  const verticalDrawing = useCallback(
    (cutId: string, key: string, activityIds: readonly string[] | null): ReportDrawing | null => {
      const support = progress.supports.get(key);
      const t = targetOfKey(key);
      if (!support || !t || t.kind === 'floor') return null;
      const layers = ctl.layersFor(cutId, true, marksOf(activityIds), new Set([key]));
      if (!layers.length) return null;
      return {
        title: `${t.kind === 'column' ? 'Columna desdoblada' : 'Alzado'} · ${supportLabel(key)}`,
        svg: faceSvg(support, t.kind === 'wallFace' && t.side === 'B', [], layers),
      };
    },
    [ctl, progress, marksOf, supportLabel],
  );

  /** Dibujos de un corte para el PDF: la planta (si hay suelos) y cada alzado con avance. */
  const drawings = useCallback(
    (cutId: string, opt: ReportOptions): ReportDrawing[] => {
      const out: ReportDrawing[] = [];
      const plan = planDrawing(cutId, opt.scopeKeys, opt.activityIds);
      if (plan) out.push(plan);
      const keys = (opt.scopeKeys ?? progress.supportKeysOfKind('vertical')).filter((k) => !k.startsWith('floor:'));
      for (const k of keys) {
        const d = verticalDrawing(cutId, k, opt.activityIds);
        if (d) out.push(d);
      }
      return out;
    },
    [planDrawing, verticalDrawing, progress],
  );

  const blocksFor = useCallback(
    async (opt: ReportOptions): Promise<ReportCutBlock[]> => {
      const s = ctl.getState();
      const photos = opt.includePhotos ? await loadPhotos() : [];
      return buildReport(
        {
          cuts: s.cuts,
          activities: s.allActivities,
          supportKeys: ctl.supportKeys,
          supportArea: (k) => ctl.supportAreaOf(k),
          supportLabel,
          quantities: (c) => ctl.quantities(c),
          parts: (c) => ctl.parts(c),
          photos,
        },
        opt,
      );
    },
    [ctl, loadPhotos, supportLabel],
  );

  const meta = useCallback(() => ({ project, space, operator, generatedAt: new Date() }), [project, space, operator]);

  /** HTML del PDF (lee y reduce las fotos). */
  const pdfHtml = useCallback(
    async (opt: ReportOptions): Promise<string> => {
      const blocks = await blocksFor(opt);
      const data = new Map<string, string>();
      for (const p of blocks.flatMap((b) => b.photos)) {
        const img = await photoJpeg(p.id);
        if (img) data.set(p.id, `data:image/jpeg;base64,${uint8ArrayToBase64(img.data)}`);
      }
      return reportHtmlBlocks(meta(), opt, blocks, (c) => drawings(c, opt), data, supportLabel);
    },
    [blocksFor, photoJpeg, meta, drawings, supportLabel],
  );

  const csv = useCallback(async (opt: ReportOptions) => reportCsvBlocks(meta(), await blocksFor(opt)), [blocksFor, meta]);

  /** Memoria de cantidades en Excel: dibujos de cada elemento con avance y fotos del corte, junto a sus medidas. */
  const xlsx = useCallback(
    async (opt: ReportOptions, header: MemoriaHeader, items: ReadonlyMap<string, MemoriaItem>): Promise<Uint8Array> => {
      const blocks = await blocksFor(opt);
      const images = new Map<string, MemoriaImage[]>();
      for (const b of blocks) {
        for (const actId of [...new Set(b.parts.map((p) => p.activityId))]) {
          const list: MemoriaImage[] = [];
          const keys = [...new Set(b.parts.filter((p) => p.activityId === actId).map((p) => p.targetKey))];
          // Un dibujo por elemento con solo esta actividad pintada; los suelos, en una sola planta.
          const floorKeys = keys.filter((k) => k.startsWith('floor:'));
          const drawn = [
            ...(floorKeys.length ? [planDrawing(b.cut.id, floorKeys, [actId])] : []),
            ...keys.filter((k) => !k.startsWith('floor:')).map((k) => verticalDrawing(b.cut.id, k, [actId])),
          ];
          for (const d of drawn) {
            const png = d ? svgToPng(d.svg) : null;
            if (png && d) list.push({ data: png.data, format: 'png', width: png.width, height: png.height, caption: d.title });
          }
          const photos = b.photos.filter((p) => p.activityId === actId || (p.targetKey !== undefined && keys.includes(p.targetKey) && !p.activityId));
          for (const p of photos) {
            const img = await photoJpeg(p.id);
            if (img) {
              const caption = [p.code, p.takenAt.toLocaleDateString('es-CO'), p.targetKey ? supportLabel(p.targetKey) : 'Foto libre', p.notes ?? ''].filter(Boolean).join(' · ');
              list.push({ data: img.data, format: 'jpeg', width: img.width, height: img.height, caption });
            }
          }
          images.set(`${b.cut.id}|${actId}`, list);
        }
      }
      const wb = buildMemoria({
        header,
        project,
        space,
        activities: ctl.getState().allActivities,
        blocks,
        items,
        images: (cutId, actId) => images.get(`${cutId}|${actId}`) ?? [],
      });
      return wb.toBytes();
    },
    [blocksFor, planDrawing, verticalDrawing, photoJpeg, supportLabel, project, space, ctl],
  );

  return { blocksFor, pdfHtml, csv, xlsx, loadPhotos };
}

export type ProgressReportIO = ReturnType<typeof useProgressReport>;
