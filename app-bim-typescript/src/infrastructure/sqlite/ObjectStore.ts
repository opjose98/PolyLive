// =============================================================================
// ObjectStore.ts — Implementación de IObjectStore con SQLite puro
// Basado en: RevitObjectBase.md, DeleteObjectUseCase.md, matriz-reglas-de-negocio.md
//            SiteCoordinateSystem.md, SurveyControlPoint.md (Spike #7)
// =============================================================================

import { IDatabase } from './database';
import { RevitObjectRow, MeasurementRow, AuditPhotoRow, OperatorRow } from './types';
import {
  RevitObjectBase,
  RevitObjectId,
  RoomId,
  WallId,
  IObjectStore,
  revitObjectId,
  roomId as toRoomId,
  wallId as toWallId,
  RevitObjectType,
} from '../../domain/objects/base';
import { Wall } from '../../domain/objects/wall';
import { Door } from '../../domain/objects/door';
import { Window } from '../../domain/objects/window';
import { Column } from '../../domain/objects/column';
import { Floor } from '../../domain/objects/floor';
import { Room } from '../../domain/objects/room';
import { parseExtent, parseWallVertical } from '../../domain/objects/vertical';
import { Measurement, CaptureMethod } from '../../domain/objects/measurement';
import { AuditPhoto } from '../../domain/objects/audit-photo';
import { meters, squareMeters } from '../../domain/geometry/types';
import { MeasurementId, AuditPhotoId, measurementId, auditPhotoId, levelId } from '../../domain/objects/base';
import { Operator, operatorId, OperatorId } from '../../domain/objects/operator';

/**
 * Implementación de IObjectStore usando SQLite puro (sin ORM).
 *
 * INVARIANTES:
 * - Todas las operaciones son transaccionales (ACID)
 * - deleteObject() hace soft-delete (is_deleted = 1)
 * - listObjects() excluye objetos con is_deleted = 1
 * - createObject() valida foreign keys:
 *   - Door/Window: parentWallId debe existir y no estar borrado
 * - Cascade: si un Wall se borra, sus Doors y Windows también (soft-delete)
 */
export class ObjectStore implements IObjectStore {
  constructor(private readonly db: IDatabase) {}

  // -------------------------------------------------------------------------
  // createObject — Insertar un nuevo objeto BIM
  // -------------------------------------------------------------------------

  /**
   * Crea un objeto BIM en la tabla revit_objects.
   *
   * VALIDACIONES:
   * - Door/Window: parentWallId debe existir y no estar borrado
   *
   * @returns El id del objeto creado
   * @throws Error si la validación de FK falla
   */
  async createObject(obj: RevitObjectBase): Promise<RevitObjectId> {
    return this.db.transaction(async () => {
      // Validar foreign keys para vanos (Door/Window)
      if (obj instanceof Door || obj instanceof Window) {
        await this.validateParentWall(obj.parentWallId);
      }

      const propertiesJson = this.serializeProperties(obj);
      const now = new Date().toISOString();

      await this.db.run(
        `INSERT INTO revit_objects (id, object_type, room_id, geometry_json, properties_json, is_deleted, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          obj.id as string,
          obj.type,
          obj.roomId as string,
          obj.geometry_json,
          propertiesJson,
          now,
          now,
        ]
      );

      return obj.id;
    });
  }

  // -------------------------------------------------------------------------
  // readObject — Leer un objeto por id
  // -------------------------------------------------------------------------

  /**
   * Lee un objeto BIM por su id.
   * Retorna null si no existe o está soft-deleted.
   */
  async readObject(id: RevitObjectId): Promise<RevitObjectBase | null> {
    const row = await this.db.get<RevitObjectRow>(
      `SELECT * FROM revit_objects WHERE id = ? AND is_deleted = 0`,
      [id as string]
    );
    if (!row) return null;
    return this.rowToObject(row);
  }

  // -------------------------------------------------------------------------
  // updateObject — Actualizar propiedades de un objeto
  // -------------------------------------------------------------------------

  /**
   * Actualiza un objeto BIM.
   *
   * @throws Error si el objeto no existe o está borrado
   */
  async updateObject(id: RevitObjectId, updates: Partial<RevitObjectBase>): Promise<void> {
    return this.db.transaction(async () => {
      const existing = await this.db.get<RevitObjectRow>(
        `SELECT * FROM revit_objects WHERE id = ? AND is_deleted = 0`,
        [id as string]
      );
      if (!existing) {
        throw new Error(`Object ${id} not found or is deleted`);
      }

      // Mergear propiedades existentes con updates
      const currentProps = JSON.parse(existing.properties_json);
      const updatedProps = { ...currentProps };

      // Aplicar updates de propiedades específicas del tipo
      if (updates.properties) {
        Object.assign(updatedProps, updates.properties);
      }

      // Campos directos que pueden actualizarse
      const geometryJson = updates.geometry_json ?? existing.geometry_json;
      const now = new Date().toISOString();

      // Mergear los campos tipados que llegan en `updates`.
      //
      // BUG CORREGIDO: esta lista se escribía a mano y estaba INCOMPLETA. No
      // incluía `offsetAlongWall`, `offsetPerpendicular`, `width`,
      // `parentWallId`, `doorType`, `windowType`, `frameType`, `glazing` ni
      // `embeddedInWallId`, así que mover o redimensionar una puerta o una
      // ventana —desde el panel de propiedades o desde la vista de elevación—
      // no persistía NADA: la operación decía que había funcionado y al releer
      // el vano seguía igual. Ahora la lista es la misma que
      // `SERIALIZED_FIELD_KEYS`, que es la que describe qué se persiste, con lo
      // que añadir un campo al dominio no puede volver a dejar este punto atrás.
      for (const key of ObjectStore.SERIALIZED_FIELD_KEYS) {
        if (key in updates) updatedProps[key] = (updates as Record<string, unknown>)[key];
      }

      // `dimensionX` se persiste bajo el nombre histórico `diameter` (ver
      // serializeProperties): es la única traducción de nombre que hay, y tiene
      // que aplicarse también aquí.
      if ('dimensionX' in updates) updatedProps.diameter = (updates as any).dimensionX;

      // Mover un muro reescribe sus extremos. Si el eje guardado era un arco o
      // una polilínea y NO se manda un `shape` nuevo, ese eje quedaría obsoleto
      // y la rehidratación lo preferiría sobre los extremos recién escritos,
      // descartando el movimiento en silencio. Ante esa contradicción se
      // descarta el eje viejo y el muro se rehidrata recto entre sus extremos:
      // se pierde la curvatura, pero no la posición, que es lo que el usuario
      // acaba de cambiar. MoveObjectUseCase traslada el `shape` explícitamente
      // para que este descarte no llegue a hacer falta.
      const movedEndpoints = 'startPoint' in updates || 'endPoint' in updates;
      if (movedEndpoints && !('shape' in updates)) delete updatedProps.shape;

      await this.db.run(
        `UPDATE revit_objects
         SET geometry_json = ?, properties_json = ?, updated_at = ?
         WHERE id = ?`,
        [geometryJson, JSON.stringify(updatedProps), now, id as string]
      );
    });
  }

  // -------------------------------------------------------------------------
  // deleteObject — Soft-delete con cascada
  // -------------------------------------------------------------------------

  /**
   * Soft-delete: marca is_deleted = 1.
   *
   * CASCADA (matriz-reglas-de-negocio.md):
   * - Si es un Wall, también soft-delete de Doors y Windows que lo referencian
   *
   * @throws Error si el objeto no existe
   */
  async deleteObject(id: RevitObjectId): Promise<void> {
    return this.db.transaction(async () => {
      const existing = await this.db.get<RevitObjectRow>(
        `SELECT * FROM revit_objects WHERE id = ? AND is_deleted = 0`,
        [id as string]
      );
      if (!existing) {
        throw new Error(`Object ${id} not found or already deleted`);
      }

      const now = new Date().toISOString();

      // Cascada: si es Wall, borrar Doors y Windows hijas
      if (existing.object_type === 'Wall') {
        await this.cascadeDeleteVanos(id, now);
      }

      // Soft-delete del objeto
      await this.db.run(
        `UPDATE revit_objects SET is_deleted = 1, updated_at = ? WHERE id = ?`,
        [now, id as string]
      );
    });
  }

  // -------------------------------------------------------------------------
  // restoreObject — Inversa exacta de deleteObject (habilita el REDO)
  // -------------------------------------------------------------------------

  /**
   * Revierte el soft-delete de UN objeto. Deliberadamente NO cascadea.
   *
   * IDEMPOTENTE a propósito: restaurar algo que no estaba borrado no cambia
   * nada. Los `Create*Command` la llaman tanto en su primera ejecución (donde
   * el objeto ya existe vivo) como en el redo (donde está borrado), y no
   * tienen forma de distinguir un caso del otro.
   *
   * POR QUÉ SIN CASCADA: `DeleteObjectUseCase` ya registra la lista EXACTA de
   * ids que borró (muro + vanos) y `DeleteObjectCommand.undo()` los restaura
   * uno a uno. Deducir la cascada aquí exigiría adivinar qué vanos se
   * borraron "con" el muro y qué vanos ya estaban borrados de antes — el
   * primer intento lo hacía comparando `updated_at`, y dos operaciones dentro
   * del mismo milisegundo la volvían indistinguibles. Registrar la lista en el
   * comando es exacto; inferirla aquí, no.
   *
   * Consecuencia documentada: llamar a `deleteObject(wall)` directamente
   * (saltándose el UseCase) cascadea los vanos sin dejar registro, y un
   * `restoreObject(wall)` posterior los dejará borrados. La ruta soportada es
   * el UseCase.
   */
  async restoreObject(id: RevitObjectId): Promise<void> {
    const existing = await this.db.get<RevitObjectRow>(
      `SELECT id, is_deleted FROM revit_objects WHERE id = ?`,
      [id as string],
    );
    if (!existing) {
      throw new Error(`Object ${id} not found`);
    }
    if (existing.is_deleted === 0) return; // ya vivo: nada que hacer

    await this.db.run(
      `UPDATE revit_objects SET is_deleted = 0, updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), id as string],
    );
  }

  // -------------------------------------------------------------------------
  // listObjects — Listar objetos de un Recinto
  // -------------------------------------------------------------------------

  /**
   * Lista todos los objetos BIM de un Recinto (excluyendo soft-deleted).
   */
  async listObjects(roomId: RoomId): Promise<RevitObjectBase[]> {
    const rows = await this.db.all<RevitObjectRow>(
      `SELECT * FROM revit_objects WHERE room_id = ? AND is_deleted = 0 ORDER BY created_at`,
      [roomId as string]
    );
    return rows.map((row) => this.rowToObject(row));
  }

  // -------------------------------------------------------------------------
  // Measurement operations
  // -------------------------------------------------------------------------

  async createMeasurement(m: Measurement): Promise<MeasurementId> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO measurements (id, room_id, wall_id, capture_method, values_json, average, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        m.id as string,
        m.roomId as string,
        m.wallId as string,
        m.capture_method,
        m.values_json,
        m.average as number,
        now,
        now,
      ]
    );
    return m.id;
  }

  // GAP CERRADO: existía createMeasurement() pero ningún método de lectura —
  // las mediciones eran de SOLO ESCRITURA. CaptureMeasurementUseCase llenaba
  // la tabla `measurements` y nada en todo el sistema podía volver a leerla:
  // ni la UI para mostrar el historial de un muro, ni el exportador IFC, ni
  // un informe. Una medición tomada en campo con el láser desaparecía de la
  // vista en cuanto se capturaba. Mismo patrón que readAuditPhoto/
  // listAuditPhotos, que cerraron este mismo hueco para las fotos.

  /** Lee una Measurement por id. Retorna null si no existe o está soft-deleted. */
  async readMeasurement(id: MeasurementId): Promise<Measurement | null> {
    const row = await this.db.get<MeasurementRow>(
      `SELECT * FROM measurements WHERE id = ? AND is_deleted = 0`,
      [id as string],
    );
    return row ? this.measurementRowToObject(row) : null;
  }

  /** Mediciones de un Recinto (excluye soft-deleted), más recientes primero. */
  async listMeasurements(room: RoomId): Promise<Measurement[]> {
    const rows = await this.db.all<MeasurementRow>(
      `SELECT * FROM measurements WHERE room_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
      [room as string],
    );
    return rows.map((row) => this.measurementRowToObject(row));
  }

  /** Mediciones tomadas contra un muro concreto, más recientes primero. */
  async listMeasurementsForWall(wall: WallId): Promise<Measurement[]> {
    const rows = await this.db.all<MeasurementRow>(
      `SELECT * FROM measurements WHERE wall_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
      [wall as string],
    );
    return rows.map((row) => this.measurementRowToObject(row));
  }

  /** Soft-delete de una Measurement (una lectura errónea no se borra, se marca). */
  async deleteMeasurement(id: MeasurementId): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(`UPDATE measurements SET is_deleted = 1, updated_at = ? WHERE id = ?`, [now, id as string]);
  }

  private measurementRowToObject(row: MeasurementRow): Measurement {
    return new Measurement({
      id: measurementId(row.id),
      roomId: toRoomId(row.room_id),
      wallId: toWallId(row.wall_id),
      capture_method: row.capture_method as CaptureMethod,
      values_json: row.values_json,
      average: meters(row.average),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: row.is_deleted === 1,
    });
  }

  // -------------------------------------------------------------------------
  // AuditPhoto operations
  // -------------------------------------------------------------------------

  async createAuditPhoto(photo: AuditPhoto): Promise<AuditPhotoId> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO audit_photos (id, room_id, foto, metadata_json, linked_object_id, is_deleted, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      [
        photo.id as string,
        photo.roomId as string,
        photo.foto,
        photo.metadata_json,
        photo.linkedObjectId as string | null ?? null,
        now,
        now,
      ]
    );
    return photo.id;
  }

  // GAP CERRADO: existía createAuditPhoto() pero ningún método para leer una
  // AuditPhoto de vuelta — CapturePhotoUseCase podía escribir en audit_photos
  // pero nada en src/ podía listarlas ni leerlas, así que una foto capturada
  // no tenía forma programática de volver a mostrarse o exportarse.

  /** Lee una AuditPhoto por id. Retorna null si no existe o está soft-deleted. */
  async readAuditPhoto(id: AuditPhotoId): Promise<AuditPhoto | null> {
    const row = await this.db.get<AuditPhotoRow>(
      `SELECT * FROM audit_photos WHERE id = ? AND is_deleted = 0`,
      [id as string],
    );
    if (!row) return null;
    return this.auditPhotoRowToObject(row);
  }

  /** Lista las AuditPhotos de un Recinto (excluye soft-deleted), más recientes primero. */
  async listAuditPhotos(room: RoomId): Promise<AuditPhoto[]> {
    const rows = await this.db.all<AuditPhotoRow>(
      `SELECT * FROM audit_photos WHERE room_id = ? AND is_deleted = 0 ORDER BY created_at DESC`,
      [room as string],
    );
    return rows.map((row) => this.auditPhotoRowToObject(row));
  }

  /**
   * Reescribe la metadata de una foto (marcador en planta, código BIM, notas,
   * geolocalización).
   *
   * GAP CERRADO: `audit_photos` tenía create/read/list/delete pero ningún
   * UPDATE, así que la metadata era inmutable una vez escrita. Colocar el
   * marcador de una foto ya tomada, corregir una nota o vincularla a un objeto
   * después de capturarla era imposible sin borrarla y volver a hacerla.
   */
  async updateAuditPhoto(
    id: AuditPhotoId,
    updates: { metadata_json?: string; linkedObjectId?: RevitObjectId | null },
  ): Promise<void> {
    const existing = await this.db.get<AuditPhotoRow>(
      `SELECT * FROM audit_photos WHERE id = ? AND is_deleted = 0`,
      [id as string],
    );
    if (!existing) {
      throw new Error(`AuditPhoto ${id} not found or is deleted`);
    }

    await this.db.run(
      `UPDATE audit_photos SET metadata_json = ?, linked_object_id = ?, updated_at = ? WHERE id = ?`,
      [
        updates.metadata_json ?? existing.metadata_json,
        updates.linkedObjectId === undefined
          ? existing.linked_object_id
          : (updates.linkedObjectId as string | null),
        new Date().toISOString(),
        id as string,
      ],
    );
  }

  /** Fotos de un Recinto que tienen marcador colocado en la planta. */
  async listPhotoMarkers(room: RoomId): Promise<AuditPhoto[]> {
    const photos = await this.listAuditPhotos(room);
    return photos.filter((photo) => photo.metadata.marker != null);
  }

  /** Soft-delete de una AuditPhoto. */
  async deleteAuditPhoto(id: AuditPhotoId): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(`UPDATE audit_photos SET is_deleted = 1, updated_at = ? WHERE id = ?`, [now, id as string]);
  }

  /** Revierte el soft-delete de una AuditPhoto (redo de su captura). Idempotente. */
  async restoreAuditPhoto(id: AuditPhotoId): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(`UPDATE audit_photos SET is_deleted = 0, updated_at = ? WHERE id = ?`, [now, id as string]);
  }

  private auditPhotoRowToObject(row: AuditPhotoRow): AuditPhoto {
    return new AuditPhoto({
      id: auditPhotoId(row.id),
      roomId: toRoomId(row.room_id),
      foto: row.foto,
      metadata_json: row.metadata_json,
      linkedObjectId: row.linked_object_id ? revitObjectId(row.linked_object_id) : undefined,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: row.is_deleted === 1,
    });
  }

  // -------------------------------------------------------------------------
  // Operator operations — ver domain/objects/operator.ts para el alcance
  // (solo nombre, sin autenticación). No forman parte de IObjectStore —
  // mismo patrón de acceso que las operaciones de Sede arriba.
  // -------------------------------------------------------------------------

  async createOperator(operator: Operator): Promise<OperatorId> {
    const now = new Date().toISOString();
    await this.db.run(
      `INSERT INTO operators (id, name, is_deleted, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`,
      [operator.id as string, operator.name, now, now],
    );
    return operator.id;
  }

  /** Lista los Operadores no borrados, más recientes primero. */
  async listOperators(): Promise<Operator[]> {
    const rows = await this.db.all<OperatorRow>(
      `SELECT * FROM operators WHERE is_deleted = 0 ORDER BY created_at DESC`,
    );
    return rows.map((row) => this.operatorRowToObject(row));
  }

  async readOperator(id: OperatorId): Promise<Operator | null> {
    const row = await this.db.get<OperatorRow>(
      `SELECT * FROM operators WHERE id = ? AND is_deleted = 0`,
      [id as string],
    );
    return row ? this.operatorRowToObject(row) : null;
  }

  /** Renombra un Operador existente. */
  async updateOperatorName(id: OperatorId, name: string): Promise<void> {
    const trimmed = name.trim();
    if (trimmed.length === 0) throw new Error('Operator.name no puede estar vacío');
    const now = new Date().toISOString();
    const result = await this.db.run(
      `UPDATE operators SET name = ?, updated_at = ? WHERE id = ? AND is_deleted = 0`,
      [trimmed, now, id as string],
    );
    if (result.changes === 0) throw new Error(`Operator ${id} no existe o está borrado`);
  }

  async deleteOperator(id: OperatorId): Promise<void> {
    const now = new Date().toISOString();
    await this.db.run(`UPDATE operators SET is_deleted = 1, updated_at = ? WHERE id = ?`, [now, id as string]);
  }

  private operatorRowToObject(row: OperatorRow): Operator {
    return new Operator({
      id: operatorId(row.id),
      name: row.name,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      is_deleted: row.is_deleted === 1,
    });
  }

  // -------------------------------------------------------------------------
  // listAllRooms — Recorrido de Recintos a través de TODA la base
  //
  // GAP CERRADO: `listObjects(roomId)` (IObjectStore) requiere conocer de
  // antemano el roomId — es la operación correcta para "dame los objetos de
  // ESTE Recinto", pero no existía ninguna forma de responder "¿qué Recintos
  // existen en total?", que es justo lo que necesita un selector de tipo
  // Dashboard/ProjectNavigator. El esquema YA soportaba múltiples Recintos
  // (room_id es una columna libre, no una FK a una tabla "projects" que no
  // existe) — simplemente ninguna consulta ni pantalla lo exponía nunca,
  // porque la UI actual fija un único ACTIVE_ROOM_ID (ver src/ui/App.tsx).
  // -------------------------------------------------------------------------

  /** Lista todos los objetos Room no borrados de toda la base, más recientes primero. */
  async listAllRooms(): Promise<Room[]> {
    const rows = await this.db.all<RevitObjectRow>(
      `SELECT * FROM revit_objects WHERE object_type = 'Room' AND is_deleted = 0 ORDER BY created_at DESC`,
    );
    return rows.map((row) => this.rowToObject(row) as Room);
  }

  // =========================================================================
  // Métodos privados
  // =========================================================================

  /**
   * Valida que un parentWallId referencia un Wall existente y no borrado.
   * @throws Error si el Wall no existe o está borrado
   */
  private async validateParentWall(parentWallId: WallId): Promise<void> {
    const wall = await this.db.get<RevitObjectRow>(
      `SELECT id, object_type FROM revit_objects WHERE id = ? AND is_deleted = 0`,
      [parentWallId as string]
    );
    if (!wall) {
      throw new Error(`Parent wall ${parentWallId} does not exist or is deleted`);
    }
    if (wall.object_type !== 'Wall') {
      throw new Error(`Parent ${parentWallId} is not a Wall (found ${wall.object_type})`);
    }
  }

  /**
   * Soft-delete de todas las Doors y Windows cuyo parentWallId === wallId.
   * Usa la propiedad parentWallId almacenada en properties_json.
   */
  private async cascadeDeleteVanos(wallId: RevitObjectId, now: string): Promise<void> {
    // Buscar vanos hijos (Door/Window) que referencian este Wall
    const vanos = await this.db.all<RevitObjectRow>(
      `SELECT id, properties_json FROM revit_objects
       WHERE room_id = (SELECT room_id FROM revit_objects WHERE id = ?)
         AND object_type IN ('Door', 'Window')
         AND is_deleted = 0`,
      [wallId as string]
    );

    for (const vano of vanos) {
      const props = JSON.parse(vano.properties_json);
      if (props.parentWallId === (wallId as string)) {
        await this.db.run(
          `UPDATE revit_objects SET is_deleted = 1, updated_at = ? WHERE id = ?`,
          [now, vano.id]
        );
      }
    }
  }

  /**
   * Claves de `properties_json` que `serializeProperties` escribe a partir de
   * campos propios de cada clase. Todo lo demás en ese JSON son propiedades
   * LIBRES del usuario (`name`, `notes` y cualquier clave extra que la UI
   * añada) y hay que devolverlas a `RevitObjectBase.properties`.
   *
   * BUG CORREGIDO: `serializeProperties` empieza con `{ ...obj.properties }`,
   * así que el nombre y las notas SÍ se guardaban — pero `rowToObject` no
   * pasaba `properties` a ningún constructor, de modo que al releer el objeto
   * volvían vacías. Renombrar un muro desde el panel de propiedades parecía
   * funcionar y el nombre desaparecía al recargar el Recinto.
   */
  private static readonly SERIALIZED_FIELD_KEYS: ReadonlySet<string> = new Set([
    // RevitObjectBase
    'linkedPhotos', 'notes',
    // Wall
    'startPoint', 'endPoint', 'thickness', 'height', 'material', 'isStructural', 'shape', 'vertical',
    // Door / Window
    'parentWallId', 'offsetAlongWall', 'offsetPerpendicular', 'width',
    'doorType', 'windowType', 'frameType', 'glazing',
    // Column
    'position', 'diameter', 'embeddedInWallId', 'sectionShape', 'dimensionY', 'rotation',
    // Floor
    'isImplicit',
    // Room
    'levelId', 'geometry', 'isClosed', 'isOpen', 'area', 'localOrigin',
  ]);

  /** Propiedades libres del usuario, separadas de los campos de la clase. */
  private static userProperties(props: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (!ObjectStore.SERIALIZED_FIELD_KEYS.has(key)) out[key] = value;
    }
    return out;
  }

  /**
   * Convierte una fila SQL a un objeto BIM del tipo correcto.
   */
  private rowToObject(row: RevitObjectRow): RevitObjectBase {
    const props = JSON.parse(row.properties_json);
    const id = revitObjectId(row.id);
    const rId = toRoomId(row.room_id);
    const createdAt = new Date(row.created_at);
    const updatedAt = new Date(row.updated_at);
    const isDeleted = row.is_deleted === 1;
    const properties = ObjectStore.userProperties(props);

    switch (row.object_type as RevitObjectType) {
      case 'Wall':
        return new Wall({
          id,
          roomId: rId,
          startPoint: props.startPoint ?? { x: 0, y: 0 },
          endPoint: props.endPoint ?? { x: 1, y: 0 },
          // Solo los ejes no rectos se persisten; si no hay `shape`, el
          // constructor lo deriva de startPoint/endPoint.
          shape: props.shape,
          thickness: meters(props.thickness ?? 0.15),
          height: meters(props.height ?? 3.0),
          material: props.material,
          // Las filas anteriores a este campo no lo traen: un muro sin marca
          // explícita es portante, que es el valor por defecto del dominio.
          isStructural: props.isStructural ?? true,
          vertical: parseWallVertical(props.vertical),
          properties,
          notes: props.notes,
          geometry_json: row.geometry_json,
          created_at: createdAt,
          updated_at: updatedAt,
          is_deleted: isDeleted,
          linkedPhotos: (props.linkedPhotos ?? []) as AuditPhotoId[],
        });

      case 'Door':
        return new Door({
          id,
          roomId: rId,
          parentWallId: toWallId(props.parentWallId ?? ''),
          offsetAlongWall: meters(props.offsetAlongWall ?? 0),
          offsetPerpendicular: meters(props.offsetPerpendicular ?? 0),
          width: meters(props.width ?? 0.9),
          height: meters(props.height ?? 2.1),
          doorType: props.doorType,
          material: props.material,
          properties,
          notes: props.notes,
          geometry_json: row.geometry_json,
          created_at: createdAt,
          updated_at: updatedAt,
          is_deleted: isDeleted,
          linkedPhotos: (props.linkedPhotos ?? []) as AuditPhotoId[],
        });

      case 'Window':
        return new Window({
          id,
          roomId: rId,
          parentWallId: toWallId(props.parentWallId ?? ''),
          offsetAlongWall: meters(props.offsetAlongWall ?? 0),
          offsetPerpendicular: meters(props.offsetPerpendicular ?? 0),
          width: meters(props.width ?? 1.2),
          height: meters(props.height ?? 1.2),
          windowType: props.windowType,
          frameType: props.frameType,
          glazing: props.glazing,
          properties,
          notes: props.notes,
          geometry_json: row.geometry_json,
          created_at: createdAt,
          updated_at: updatedAt,
          is_deleted: isDeleted,
          linkedPhotos: (props.linkedPhotos ?? []) as AuditPhotoId[],
        });

      case 'Column':
        return new Column({
          id,
          roomId: rId,
          position: props.position ?? { x: 0, y: 0 },
          diameter: meters(props.diameter ?? 0.3),
          height: meters(props.height ?? 3.0),
          embeddedInWallId: props.embeddedInWallId ? toWallId(props.embeddedInWallId) : undefined,
          material: props.material,
          // Las filas anteriores a la sección rectangular no traen estos
          // campos: sin `sectionShape` la columna es circular, como siempre.
          sectionShape: props.sectionShape ?? 'circular',
          dimensionY: props.dimensionY != null ? meters(props.dimensionY) : undefined,
          rotation: props.rotation ?? 0,
          vertical: parseExtent(props.vertical),
          properties,
          notes: props.notes,
          geometry_json: row.geometry_json,
          created_at: createdAt,
          updated_at: updatedAt,
          is_deleted: isDeleted,
          linkedPhotos: (props.linkedPhotos ?? []) as AuditPhotoId[],
        });

      case 'Floor':
        return new Floor({
          id,
          roomId: rId,
          isImplicit: props.isImplicit ?? true,
          material: props.material,
          thickness: props.thickness != null ? meters(props.thickness) : undefined,
          properties,
          notes: props.notes,
          geometry_json: row.geometry_json,
          created_at: createdAt,
          updated_at: updatedAt,
          is_deleted: isDeleted,
          linkedPhotos: (props.linkedPhotos ?? []) as AuditPhotoId[],
        });

      case 'Room':
        return new Room({
          id,
          roomId: rId,
          levelId: levelId(props.levelId ?? 'level-1'),
          geometry: props.geometry ?? [],
          isClosed: props.isClosed ?? false,
          isOpen: props.isOpen ?? true,
          area: props.area != null ? squareMeters(props.area) : null,
          localOrigin: props.localOrigin ?? { x: 0, y: 0 },
          properties,
          notes: props.notes,
          geometry_json: row.geometry_json,
          created_at: createdAt,
          updated_at: updatedAt,
          is_deleted: isDeleted,
          linkedPhotos: (props.linkedPhotos ?? []) as AuditPhotoId[],
        });

      default:
        throw new Error(`Unknown object type: ${row.object_type}`);
    }
  }

  /**
   * Serializa las propiedades específicas del tipo de objeto a JSON.
   */
  private serializeProperties(obj: RevitObjectBase): string {
    const props: Record<string, unknown> = { ...obj.properties };

    // linkedPhotos y notes viven en RevitObjectBase — se serializan para todos
    // los tipos. `notes` estaba antes dentro de las ramas de Wall y Column, así
    // que una nota escrita sobre una puerta o un recinto se perdía al guardar.
    props.linkedPhotos = obj.linkedPhotos;
    props.notes = obj.notes;

    if (obj instanceof Wall) {
      props.startPoint = obj.startPoint;
      props.endPoint = obj.endPoint;
      props.thickness = obj.thickness;
      props.height = obj.height;
      props.material = obj.material;
      props.isStructural = obj.isStructural;
      if (obj.vertical) props.vertical = obj.vertical;
      // Solo se persiste el eje cuando NO es recto. Un muro recto queda
      // descrito por startPoint/endPoint, así que guardar además su `shape`
      // duplicaría la misma información en dos sitios que podrían divergir
      // (por ejemplo, tras un MoveObject que solo tocase los extremos).
      if (obj.shape.kind !== 'line') props.shape = obj.shape;
    } else if (obj instanceof Door) {
      props.parentWallId = obj.parentWallId;
      props.offsetAlongWall = obj.offsetAlongWall;
      props.offsetPerpendicular = obj.offsetPerpendicular;
      props.width = obj.width;
      props.height = obj.height;
      props.doorType = obj.doorType;
      props.material = obj.material;
    } else if (obj instanceof Window) {
      props.parentWallId = obj.parentWallId;
      props.offsetAlongWall = obj.offsetAlongWall;
      props.offsetPerpendicular = obj.offsetPerpendicular;
      props.width = obj.width;
      props.height = obj.height;
      props.windowType = obj.windowType;
      props.frameType = obj.frameType;
      props.glazing = obj.glazing;
    } else if (obj instanceof Column) {
      props.position = obj.position;
      // `diameter` se mantiene como nombre persistido para que las filas
      // escritas antes de la sección rectangular se sigan leyendo igual.
      props.diameter = obj.dimensionX;
      props.height = obj.height;
      props.embeddedInWallId = obj.embeddedInWallId;
      props.material = obj.material;
      props.sectionShape = obj.sectionShape;
      props.dimensionY = obj.dimensionY;
      props.rotation = obj.rotation;
      if (obj.vertical) props.vertical = obj.vertical;
    } else if (obj instanceof Floor) {
      props.isImplicit = obj.isImplicit;
      props.material = obj.material;
      props.thickness = obj.thickness;
    } else if (obj instanceof Room) {
      props.levelId = obj.levelId;
      props.geometry = obj.geometry;
      props.isClosed = obj.isClosed;
      props.isOpen = obj.isOpen;
      props.area = obj.area;
      props.localOrigin = obj.localOrigin;
    }

    return JSON.stringify(props);
  }
}
