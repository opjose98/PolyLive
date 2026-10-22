// =============================================================================
// EditorController.ts — Editor de planta: recintos, medición y fotos (API pública)
//
// EditorController se divide en capas (una por responsabilidad) para que ningún
// archivo concentre todo el editor: EditorCore (estado, vista, consultas,
// ciclo de vida, deshacer) → EditorGestures (toque y arrastre) → EditorCreation
// (muros, vanos, suelos, acciones sobre la selección) → EditorController
// (recintos, medición y fotos). La API pública es la de EditorController.
// =============================================================================

import { Point2D, Meters } from '../../domain/geometry/types';
import { WallId } from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';

import { planMeasureMove } from '../../domain/topology/joints';
import { FaceWall, Side, axisLengthFor, faceLength, interiorSide } from '../../domain/topology/faceMeasure';
import { ClosureCheck, checkClosure, controlDiagonal } from '../../domain/topology/closure';
import type { MeasureReference } from '../../domain/objects/measurement';
import type { MeasurementId, AuditPhotoId } from '../../domain/objects/base';

import type { PhotoFaceAnchor } from '../../domain/objects/audit-photo';
import {
  PhotoMarkerView,
} from './EditorCore';
import { EditorCreation } from './EditorCreation';

export * from './EditorCore';

export class EditorController extends EditorCreation {
  // -------------------------------------------------------------------------
  // Medición
  // -------------------------------------------------------------------------

  /**
   * Persiste una medición contra el muro elegido con la herramienta `measure`.
   *
   * GAP CERRADO: la pantalla llamaba a `HuepaDeviceManager.measure()` y el
   * resultado solo se pintaba y se guardaba en el store de Zustand. Nada
   * llegaba nunca a la tabla `measurements` — la medición se perdía al cerrar
   * la app, aunque CaptureMeasurementUseCase existía desde el principio.
   */
  async captureMeasurement(
    method: 'ble' | 'manual',
    manualValue?: Meters,
    bleSamples?: readonly number[],
    reference: MeasureReference = 'interior',
  ): Promise<Meters | null> {
    const target = this.state.measureTargetId;
    if (!target) {
      this.notify('info', 'Elige primero el muro a medir con la herramienta Medir.');
      return null;
    }

    this.patch({ busy: true });
    try {
      const result = await this.services.useCases.captureMeasurement.execute({
        roomId: this.roomId,
        wallId: target,
        method,
        value: manualValue,
        samples: bleSamples,
        reference,
      });
      this.lastMeasurementId = result.measurementId;
      this.notify(
        'success',
        `Medición guardada: ${Number(result.average).toFixed(3)} m` +
          (result.outliers.length > 0 ? ` (${result.outliers.length} muestra(s) descartada(s))` : ''),
      );
      await this.reload();
      return result.average;
    } catch (err) {
      this.fail(err, 'No se pudo guardar la medición.');
      return null;
    } finally {
      this.patch({ busy: false });
    }
  }

  /** Última medición guardada (para ligarla a la longitud que se aplica). */
  protected lastMeasurementId: MeasurementId | null = null;

  /**
   * Longitudes de cara del muro elegido para medir (interior y exterior), para
   * que la hoja de medida muestre qué se va a corregir. `null` sin muro.
   */
  measureFaces(): { axis: number; interior: number | null; exterior: number | null } | null {
    const wall = this.measureTargetWall();
    if (!wall) return null;
    const ctx = this.faceContext(wall);
    const axis = wall.length as number;
    if (!ctx || ctx.inner === null) return { axis, interior: null, exterior: null };
    return {
      axis,
      interior: faceLength(ctx.me, ctx.inner, ctx.walls),
      exterior: faceLength(ctx.me, ctx.inner === 1 ? -1 : 1, ctx.walls),
    };
  }

  /**
   * Diagonal de control del recinto: la del modelo (a cara interior) y la
   * última medida en obra, con su error de cierre.
   */
  async zoneDiagonal(zoneId: string): Promise<{ model: number; check: ClosureCheck | null } | null> {
    const zone = this.state.rooms.find((r) => r.id === zoneId);
    const d = zone ? controlDiagonal(zone.netPolygon && zone.netPolygon.length >= 4 ? zone.netPolygon : zone.polygon) : null;
    if (!d) return null;
    const last = (await this.services.store.listMeasurementsForWall(zoneId as WallId)).find((m) => m.reference === 'diagonal');
    return { model: d.length, check: last ? checkClosure(d.length, last.average as number) : null };
  }

  /** Registra la diagonal medida en obra (queda en `measurements`, ligada al recinto). */
  async recordZoneDiagonal(zoneId: string, measured: Meters): Promise<ClosureCheck | null> {
    const info = await this.zoneDiagonal(zoneId);
    if (!info) return null;
    try {
      const r = await this.services.useCases.captureMeasurement.execute({
        roomId: this.roomId,
        wallId: zoneId as WallId,
        method: 'manual',
        value: measured,
        reference: 'diagonal',
      });
      await this.services.store.setMeasurementApplied(r.measurementId, info.model);
      const check = checkClosure(info.model, measured as number);
      this.notify(
        check.ok ? 'success' : 'info',
        check.ok
          ? `El recinto cierra: error ${(check.error * 100).toFixed(1)} cm (tolerancia ${(check.tolerance * 100).toFixed(1)} cm).`
          : `Revisa las medidas: la diagonal difiere ${(check.error * 100).toFixed(1)} cm (tolerancia ${(check.tolerance * 100).toFixed(1)} cm).`,
      );
      return check;
    } catch (err) {
      this.fail(err, 'No se pudo guardar la diagonal.');
      return null;
    }
  }

  protected measureTargetWall(): Wall | null {
    const target = this.state.measureTargetId;
    return target ? (this.walls.find((w) => (w.id as string) === (target as string)) ?? null) : null;
  }

  /** Muros unidos (con espesor) y recintos del nivel, para medir de cara a cara. */
  protected faceContext(wall: Wall): { me: FaceWall; walls: FaceWall[]; rooms: Point2D[][]; inner: Side | null } | null {
    const joints = this.jointWalls(wall);
    if (!joints) return null;
    const thickness = new Map(this.walls.map((w) => [w.id as string, w.thickness as number]));
    const walls: FaceWall[] = joints.map((j) => ({ ...j, thickness: thickness.get(j.id) ?? 0.15 }));
    const me = walls.find((w) => w.id === (wall.id as string))!;
    const rooms = this.state.rooms.map((r) => [...(r.netPolygon && r.netPolygon.length >= 3 ? r.netPolygon : r.polygon)]);
    return { me, walls, rooms, inner: interiorSide(me, rooms) };
  }

  /**
   * Aplica una distancia medida al muro destino: mueve su extremo final a lo
   * largo de su dirección (los muros unidos lo acompañan) hasta que la
   * referencia medida (cara interior, cara exterior o eje) mida `distance`.
   * La longitud de EJE resultante queda registrada en la medición.
   */
  async applyMeasurementToWall(distance: Meters, reference: MeasureReference = 'axis'): Promise<void> {
    const target = this.state.measureTargetId;
    const wall = target ? this.walls.find((w) => (w.id as string) === (target as string)) : null;
    if (!wall) {
      this.notify('info', 'Elige primero el muro a corregir con la herramienta Medir.');
      return;
    }

    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) {
      this.notify('error', 'El muro es degenerado: no tiene dirección a lo largo de la cual aplicar la medida.');
      return;
    }

    // Cara → eje con los espesores de los muros de cada extremo.
    const ctx = reference === 'axis' ? null : this.faceContext(wall);
    const solved = ctx ? axisLengthFor(distance as number, reference, ctx.me, ctx.walls, ctx.rooms) : { axis: distance as number, reference: 'axis' as const };
    if (reference !== 'axis' && solved.reference === 'axis') {
      this.notify('info', 'El muro no da a ningún recinto cerrado: la medida se aplicó al eje.');
    }
    const axisLength = solved.axis;
    const newEnd: Point2D = {
      x: wall.startPoint.x + (dx / len) * axisLength,
      y: wall.startPoint.y + (dy / len) * axisLength,
    };

    this.patch({ busy: true });
    try {
      // El extremo final se mueve CON sus uniones: en una esquina en L el vecino se traslada
      // entero (el recinto conserva sus ángulos); en otros casos se arrastra su extremo.
      const joints = this.jointWalls(wall);
      if (joints) {
        await this.services.useCases.reshapeWalls.execute({
          changes: planMeasureMove(joints, wall.id as string, newEnd),
        });
      } else {
        await this.services.useCases.updateObjectProperty.execute({
          objectId: wall.id,
          property: 'endPoint',
          newValue: newEnd,
        });
      }
      if (this.lastMeasurementId) {
        await this.services.store.setMeasurementApplied(this.lastMeasurementId, axisLength).catch(() => undefined);
        this.lastMeasurementId = null;
      }
      await this.reload();
      const label = solved.reference === 'interior' ? 'cara interior' : solved.reference === 'exterior' ? 'cara exterior' : 'eje';
      this.notify(
        'success',
        solved.reference === 'axis'
          ? `Muro ajustado a ${Number(distance).toFixed(3)} m al eje.`
          : `${label[0].toUpperCase()}${label.slice(1)} ${Number(distance).toFixed(3)} m → eje ${axisLength.toFixed(3)} m.`,
      );
    } catch (err) {
      this.fail(err, 'No se pudo aplicar la medición al muro.');
    } finally {
      this.patch({ busy: false });
    }
  }

  // -------------------------------------------------------------------------
  // Fotos de campo (SPDS)
  // -------------------------------------------------------------------------

  /** Relee los marcadores de foto del Recinto. */
  async reloadPhotoMarkers(): Promise<void> {
    try {
      const photos = await this.services.store.listPhotoMarkers(this.roomId);
      this.patch({
        photoMarkers: photos.flatMap((photo) => {
          const marker = photo.metadata.marker;
          if (!marker || marker.visible === false) return [];
          return [
            {
              id: photo.id as string,
              position: marker.position,
              direction: marker.direction,
              label: photo.metadata.bimCode,
              face: marker.face,
            },
          ];
        }),
      });
    } catch {
      // Un fallo leyendo marcadores no debe impedir dibujar la planta: son
      // información añadida, no la geometría del levantamiento.
      this.patch({ photoMarkers: [] });
    }
  }

  /** Descarta el punto de captura pendiente (la vista canceló la cámara). */
  clearPendingPhotoPoint(): void {
    this.patch({ pendingPhotoPoint: null });
  }

  /**
   * Ancla una foto ya capturada al punto pendiente. La vista llama a esto tras
   * guardar la foto, porque es ella quien tiene la cámara.
   */
  async attachPhotoMarker(photoId: AuditPhotoId, direction?: number): Promise<void> {
    const point = this.state.pendingPhotoPoint;
    if (!point) return;

    try {
      const photo = await this.services.store.readAuditPhoto(photoId);
      if (!photo) return;

      photo.patchMetadata({ marker: { position: point, direction, visible: true } });
      await this.services.store.updateAuditPhoto(photoId, { metadata_json: photo.metadata_json });

      this.patch({ pendingPhotoPoint: null });
      // Recarga completa: la captura apiló un comando y Deshacer debe habilitarse.
      await this.reload();
      this.notify('success', 'Foto anclada a la planta.');
    } catch (err) {
      this.fail(err, 'No se pudo anclar la foto a la planta.');
    }
  }

  /**
   * Ancla una foto a la cara de un muro (alzado). En planta queda sobre el eje
   * del muro, a la misma distancia del inicio, para encontrarla desde arriba.
   */
  async attachFacePhoto(photoId: AuditPhotoId, face: PhotoFaceAnchor): Promise<void> {
    try {
      const wall = this.walls.find((w) => (w.id as string) === face.wallId);
      const photo = await this.services.store.readAuditPhoto(photoId);
      if (!photo || !wall) return;
      const len = (wall.length as number) || 1;
      const t = Math.max(0, Math.min(1, face.x / len));
      const position = {
        x: wall.startPoint.x + (wall.endPoint.x - wall.startPoint.x) * t,
        y: wall.startPoint.y + (wall.endPoint.y - wall.startPoint.y) * t,
      };
      photo.patchMetadata({ marker: { position, face, visible: true }, linkedObjectId: face.wallId });
      await this.services.store.updateAuditPhoto(photoId, { metadata_json: photo.metadata_json });
      await this.reload();
      this.notify('success', `Foto anclada al lado ${face.side} del muro.`);
    } catch (err) {
      this.fail(err, 'No se pudo anclar la foto al alzado.');
    }
  }

  /** Marcador de foto bajo un punto de pantalla, o `null`. */
  photoMarkerAt(screenX: number, screenY: number, touchTolerancePx: number): PhotoMarkerView | null {
    const world = this.screenToWorld(screenX, screenY);
    const tol = (touchTolerancePx / this.state.transform.scale) as number;

    let best: PhotoMarkerView | null = null;
    let bestDistance = tol;
    for (const marker of this.state.photoMarkers) {
      const d = Math.hypot(world.x - marker.position.x, world.y - marker.position.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = marker;
      }
    }
    return best;
  }


}
