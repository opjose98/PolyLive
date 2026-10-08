// =============================================================================
// DXFSerializer.ts — Genera DXF R2000 (AC1015) válido
// Portado de LevON: export/dxf_exporter.dart
// =============================================================================
//
// POR QUÉ DXF ADEMÁS DE IFC: IFC es el intercambio BIM, pero la delineación
// diaria en estudios y constructoras sigue pasando por AutoCAD. Un
// levantamiento que solo sale en IFC obliga al receptor a tener un visor BIM
// para algo tan básico como acotar una planta.
//
// ESTRUCTURA OBLIGATORIA DE AC1015 (el orden NO es negociable):
//   HEADER → CLASSES → TABLES → BLOCKS → ENTITIES → OBJECTS → EOF
//
// HANDLES: AC1015 exige un handle hexadecimal único en cada entidad y cada
// registro de tabla. Los handles "well-known" que AutoCAD espera en posiciones
// fijas se declaran como constantes; los dinámicos empiezan en 0x100 para no
// colisionar con ellos. Un handle repetido o ausente hace que AutoCAD rechace
// el archivo entero sin decir por qué, así que esto es la parte del formato que
// más cuidado exige y la que más tests tiene.
//
// SALTOS DE LÍNEA: LF puro. Algunos parsers toleran CRLF y otros no; LF los pasa
// todos.
// =============================================================================

import { columnForExport, roomForExport, toLocal, wallForExport } from '../../../domain/geometry/handedness';
import { Point2D } from '../../../domain/geometry/types';
import { Wall } from '../../../domain/objects/wall';
import { Column } from '../../../domain/objects/column';
import { Room } from '../../../domain/objects/room';
import type { WallElevation } from '../../../domain/objects/wall-elevation';
import { openingEnd } from '../../../domain/objects/wall-elevation';

// ---------------------------------------------------------------------------
// Handles fijos — NO modificar: AutoCAD R2000 los espera en estas posiciones
// ---------------------------------------------------------------------------

const H_BLK_REC_TABLE = '1';
const H_LAYER_TABLE = '2';
const H_STYLE_TABLE = '3';
const H_LTYPE_TABLE = '5';
const H_VIEW_TABLE = '6';
const H_UCS_TABLE = '7';
const H_VPORT_TABLE = '8';
const H_APPID_TABLE = '9';
const H_DIM_TABLE = 'A';
const H_APPID_ACAD = 'B';
const H_ROOT_DICT = 'C';
const H_GROUP_DICT = 'D';
const H_PAPER_BLK_REC = '1B';
const H_PAPER_BLK_BEGIN = '1C';
const H_PAPER_BLK_END = '1D';
const H_CONTINUOUS_LTYPE = '1E';
const H_MODEL_BLK_REC = '1F';
const H_MODEL_BLK_BEGIN = '20';
const H_MODEL_BLK_END = '21';

/**
 * Capas, con nombres de la convención AIA/NCS que los estudios reconocen.
 * Un archivo con todo en la capa 0 es tan inútil como no tener capas.
 */
export const DXF_LAYERS = {
  wallStructural: 'S-WALL-FULL',
  wallPartition: 'S-WALL-PRTN',
  columns: 'S-COLS',
  roomBoundary: 'S-ROOM-BNDY',
  openings: 'S-OPEN',
  annotation: 'A-ANNO-TEXT',
} as const;

// ---------------------------------------------------------------------------
// Entrada
// ---------------------------------------------------------------------------

/** Capas del dibujo técnico (AIA/NCS). */
export const DRAFT_DXF_LAYERS = {
  dims: 'A-ANNO-DIMS',
  text: 'A-ANNO-TEXT',
  tags: 'A-ANNO-TAGS',
  coords: 'V-ANNO-COOR',
  lines: 'A-DETL-GENF',
  areas: 'A-AREA',
  beams: 'S-BEAM',
  trusses: 'S-TRUS',
} as const;

export type DxfDraftEntity =
  | { readonly kind: 'line'; readonly layer: string; readonly a: Point2D; readonly b: Point2D; readonly dashed?: boolean }
  | { readonly kind: 'polyline'; readonly layer: string; readonly points: readonly Point2D[]; readonly closed: boolean }
  | { readonly kind: 'text'; readonly layer: string; readonly at: Point2D; readonly text: string; readonly height: number; readonly center?: boolean };

export interface DXFExportData {
  /** Nombre que va al encabezado y al nombre de archivo. */
  readonly title: string;
  readonly room: Room | null;
  readonly walls: readonly Wall[];
  readonly columns: readonly Column[];
  /** Elevaciones, para proyectar los huecos en planta. Opcional. */
  readonly elevations?: readonly WallElevation[];
  /** Decimales de las coordenadas. 4 = décima de milímetro. */
  readonly precision?: number;
  /**
   * Recintos con identidad (T0): contorno a cara interior y rótulo por cada
   * uno. Con recintos no se dibuja el contorno único del espacio.
   */
  readonly zones?: readonly DXFZone[];
  /** Dibujo técnico de la planta (F6b): cotas, textos, etiquetas, líneas, vigas… En coordenadas del modelo. */
  readonly drafting?: readonly DxfDraftEntity[];
}

export interface DXFZone {
  readonly code: string;
  readonly name: string;
  readonly polygon: readonly { x: number; y: number }[];
  readonly netArea: number;
  /** Dónde va el rótulo (un punto interior). */
  readonly label: { x: number; y: number };
}

export class DXFExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DXFExportError';
  }
}

// ---------------------------------------------------------------------------
// Serializador
// ---------------------------------------------------------------------------

export class DXFSerializer {
  private lines: string[] = [];
  private handleCounter = 0x100;
  private precision = 4;

  serialize(data: DXFExportData): string {
    // DXF usa Y hacia arriba; el modelo, Y hacia abajo (ver handedness.ts).
    // Sin esto AutoCAD recibía la planta espejada norte-sur.
    data = {
      ...data,
      room: data.room ? roomForExport(data.room) : null,
      walls: data.walls.map(wallForExport),
      columns: data.columns.map(columnForExport),
      // Los recintos también: antes salían espejados norte-sur respecto a los muros.
      zones: data.zones?.map((z) => ({ ...z, polygon: z.polygon.map(toLocal), label: toLocal(z.label) })),
      drafting: data.drafting?.map(draftForExport),
    };
    if (!data.title || data.title.trim().length === 0) {
      throw new DXFExportError('El título del dibujo no puede estar vacío.');
    }

    this.lines = [];
    this.handleCounter = 0x100;
    this.precision = data.precision ?? 4;

    this.writeHeader(data);
    this.writeClasses();
    this.writeTables();
    this.writeBlocks();
    this.writeEntities(data);
    this.writeObjects();
    this.pair('0', 'EOF');

    return this.lines.join('\n') + '\n';
  }

  // -------------------------------------------------------------------------
  // HEADER
  // -------------------------------------------------------------------------

  private writeHeader(data: DXFExportData): void {
    this.pair('0', 'SECTION');
    this.pair('2', 'HEADER');

    this.pair('9', '$ACADVER');
    this.pair('1', 'AC1015');

    this.pair('9', '$ACADMAINTVER');
    this.pair('70', '6');

    // HANDSEED debe ser mayor que cualquier handle usado, o AutoCAD puede
    // reasignar handles al abrir y romper las referencias de propiedad.
    this.pair('9', '$HANDSEED');
    this.pair('5', 'FFFF');

    this.pair('9', '$INSUNITS');
    this.pair('70', '6'); // 6 = metros

    this.pair('9', '$LUNITS');
    this.pair('70', '2'); // 2 = decimal

    this.pair('9', '$LUPREC');
    this.pair('70', String(this.precision));

    const bounds = computeBounds(data);
    this.pair('9', '$EXTMIN');
    this.pair('10', this.num(bounds.minX));
    this.pair('20', this.num(bounds.minY));
    this.pair('30', '0.0'); // Z requerido: omitirlo corrompe el header

    this.pair('9', '$EXTMAX');
    this.pair('10', this.num(bounds.maxX));
    this.pair('20', this.num(bounds.maxY));
    this.pair('30', '0.0');

    this.pair('9', '$LIMMIN');
    this.pair('10', '0.0');
    this.pair('20', '0.0');

    this.pair('9', '$LIMMAX');
    this.pair('10', this.num(bounds.maxX + 1));
    this.pair('20', this.num(bounds.maxY + 1));

    this.pair('0', 'ENDSEC');
  }

  // -------------------------------------------------------------------------
  // CLASSES — vacía pero obligatoria
  // -------------------------------------------------------------------------

  private writeClasses(): void {
    this.pair('0', 'SECTION');
    this.pair('2', 'CLASSES');
    this.pair('0', 'ENDSEC');
  }

  // -------------------------------------------------------------------------
  // TABLES
  // -------------------------------------------------------------------------

  private writeTables(): void {
    this.pair('0', 'SECTION');
    this.pair('2', 'TABLES');

    // El ORDEN de las tablas importa: AutoCAD las espera así.
    this.tableHeader('VPORT', H_VPORT_TABLE, 0);
    this.pair('0', 'ENDTAB');

    this.writeLtypeTable();
    this.writeLayerTable();
    this.writeStyleTable();

    this.tableHeader('VIEW', H_VIEW_TABLE, 0);
    this.pair('0', 'ENDTAB');

    this.tableHeader('UCS', H_UCS_TABLE, 0);
    this.pair('0', 'ENDTAB');

    this.writeAppidTable();
    this.writeDimstyleTable();
    this.writeBlockRecordTable();

    this.pair('0', 'ENDSEC');
  }

  private writeLtypeTable(): void {
    this.tableHeader('LTYPE', H_LTYPE_TABLE, 4);
    this.writeLtypeRecord('CONTINUOUS', 'Solid line', H_CONTINUOUS_LTYPE);
    this.writeLtypeRecord('ByLayer', '', this.nextHandle());
    this.writeLtypeRecord('ByBlock', '', this.nextHandle());
    // Trazos para lo que está por encima del corte (vigas): 0,20 m de trazo y 0,10 m de hueco.
    this.writeLtypeRecord('DASHED', 'Dashed __ __ __', this.nextHandle(), [0.2, -0.1]);
    this.pair('0', 'ENDTAB');
  }

  private writeLtypeRecord(name: string, description: string, handle: string, pattern: readonly number[] = []): void {
    this.pair('0', 'LTYPE');
    this.pair('5', handle);
    this.pair('330', H_LTYPE_TABLE);
    this.pair('100', 'AcDbSymbolTableRecord');
    this.pair('100', 'AcDbLinetypeTableRecord');
    this.pair('2', name);
    this.pair('70', '0');
    this.pair('3', description);
    this.pair('72', '65');
    this.pair('73', String(pattern.length));
    this.pair('40', this.num(pattern.reduce((s, v) => s + Math.abs(v), 0)));
    for (const dash of pattern) {
      this.pair('49', this.num(dash));
      this.pair('74', '0');
    }
  }

  private writeLayerTable(): void {
    const layers: [string, number][] = [
      ['0', 7],
      [DXF_LAYERS.wallStructural, 7],
      [DXF_LAYERS.wallPartition, 8],
      [DXF_LAYERS.columns, 3],
      [DXF_LAYERS.roomBoundary, 4],
      [DXF_LAYERS.openings, 5],
      [DXF_LAYERS.annotation, 2],
      // Dibujo técnico (F6b)
      [DRAFT_DXF_LAYERS.dims, 1],
      [DRAFT_DXF_LAYERS.tags, 2],
      [DRAFT_DXF_LAYERS.coords, 6],
      [DRAFT_DXF_LAYERS.lines, 7],
      [DRAFT_DXF_LAYERS.areas, 4],
      [DRAFT_DXF_LAYERS.beams, 30],
      [DRAFT_DXF_LAYERS.trusses, 30],
    ];

    this.tableHeader('LAYER', H_LAYER_TABLE, layers.length);
    for (const [name, color] of layers) {
      this.pair('0', 'LAYER');
      this.pair('5', this.nextHandle());
      this.pair('330', H_LAYER_TABLE);
      this.pair('100', 'AcDbSymbolTableRecord');
      this.pair('100', 'AcDbLayerTableRecord');
      this.pair('2', name);
      this.pair('70', '0');
      this.pair('62', String(color));
      this.pair('6', 'CONTINUOUS');
      this.pair('390', H_STYLE_TABLE);
    }
    this.pair('0', 'ENDTAB');
  }

  private writeStyleTable(): void {
    this.tableHeader('STYLE', H_STYLE_TABLE, 1);
    this.pair('0', 'STYLE');
    this.pair('5', this.nextHandle());
    this.pair('330', H_STYLE_TABLE);
    this.pair('100', 'AcDbSymbolTableRecord');
    this.pair('100', 'AcDbTextStyleTableRecord');
    this.pair('2', 'Standard');
    this.pair('70', '0');
    this.pair('40', '0.0');
    this.pair('41', '1.0');
    this.pair('50', '0.0');
    this.pair('71', '0');
    this.pair('42', '2.5');
    this.pair('3', 'txt');
    this.pair('4', '');
    this.pair('0', 'ENDTAB');
  }

  private writeAppidTable(): void {
    this.tableHeader('APPID', H_APPID_TABLE, 1);
    this.pair('0', 'APPID');
    this.pair('5', H_APPID_ACAD);
    this.pair('330', H_APPID_TABLE);
    this.pair('100', 'AcDbSymbolTableRecord');
    this.pair('100', 'AcDbRegAppTableRecord');
    this.pair('2', 'ACAD');
    this.pair('70', '0');
    this.pair('0', 'ENDTAB');
  }

  private writeDimstyleTable(): void {
    this.tableHeader('DIMSTYLE', H_DIM_TABLE, 0);
    this.pair('100', 'AcDbDimStyleTable');
    this.pair('0', 'ENDTAB');
  }

  private writeBlockRecordTable(): void {
    this.tableHeader('BLOCK_RECORD', H_BLK_REC_TABLE, 2);

    for (const [handle, name] of [
      [H_MODEL_BLK_REC, '*Model_Space'],
      [H_PAPER_BLK_REC, '*Paper_Space'],
    ] as const) {
      this.pair('0', 'BLOCK_RECORD');
      this.pair('5', handle);
      this.pair('330', H_BLK_REC_TABLE);
      this.pair('100', 'AcDbSymbolTableRecord');
      this.pair('100', 'AcDbBlockTableRecord');
      this.pair('2', name);
    }

    this.pair('0', 'ENDTAB');
  }

  private tableHeader(name: string, handle: string, count: number): void {
    this.pair('0', 'TABLE');
    this.pair('2', name);
    this.pair('5', handle);
    this.pair('330', '0'); // owner = base de datos raíz
    this.pair('100', 'AcDbSymbolTable');
    this.pair('70', String(count));
  }

  // -------------------------------------------------------------------------
  // BLOCKS
  // -------------------------------------------------------------------------

  private writeBlocks(): void {
    this.pair('0', 'SECTION');
    this.pair('2', 'BLOCKS');

    this.writeBlock('*Model_Space', H_MODEL_BLK_BEGIN, H_MODEL_BLK_END, H_MODEL_BLK_REC, false);
    this.writeBlock('*Paper_Space', H_PAPER_BLK_BEGIN, H_PAPER_BLK_END, H_PAPER_BLK_REC, true);

    this.pair('0', 'ENDSEC');
  }

  private writeBlock(
    name: string,
    beginHandle: string,
    endHandle: string,
    recordHandle: string,
    paperSpace: boolean,
  ): void {
    this.pair('0', 'BLOCK');
    this.pair('5', beginHandle);
    this.pair('330', recordHandle);
    this.pair('100', 'AcDbEntity');
    if (paperSpace) this.pair('67', '1');
    this.pair('8', '0');
    this.pair('100', 'AcDbBlockBegin');
    this.pair('2', name);
    this.pair('70', '0');
    this.pair('10', '0.0');
    this.pair('20', '0.0');
    this.pair('30', '0.0');
    this.pair('3', name);
    this.pair('1', '');

    this.pair('0', 'ENDBLK');
    this.pair('5', endHandle);
    this.pair('330', recordHandle);
    this.pair('100', 'AcDbEntity');
    if (paperSpace) this.pair('67', '1');
    this.pair('8', '0');
    this.pair('100', 'AcDbBlockEnd');
  }

  // -------------------------------------------------------------------------
  // ENTITIES
  // -------------------------------------------------------------------------

  private writeEntities(data: DXFExportData): void {
    this.pair('0', 'SECTION');
    this.pair('2', 'ENTITIES');

    // Los contornos de recinto primero: son la referencia de todo lo demás.
    const zones = (data.zones ?? []).filter((z) => z.polygon.length >= 3);
    for (const z of zones) {
      this.lwPolyline(DXF_LAYERS.roomBoundary, z.polygon, true);
      this.text(DXF_LAYERS.annotation, z.label, `${z.code} ${z.name}`, 0.25);
      this.text(DXF_LAYERS.annotation, { x: z.label.x, y: z.label.y + 0.35 }, `${z.netArea.toFixed(2)} m2`, 0.2);
    }
    if (zones.length === 0 && data.room && data.room.geometry.length >= 3) {
      this.lwPolyline(DXF_LAYERS.roomBoundary, data.room.geometry, true);
      if (data.room.area != null) {
        const label = `${(data.room.properties.name as string | undefined) ?? 'Recinto'} — ${Number(
          data.room.area,
        ).toFixed(2)} m2`;
        this.text(DXF_LAYERS.annotation, centroidOf(data.room.geometry), label, 0.25);
      }
    }

    for (const wall of data.walls) this.writeWall(wall);
    for (const column of data.columns) this.writeColumn(column);
    if (data.elevations?.length) this.writeOpenings(data.walls, data.elevations);

    for (const e of data.drafting ?? []) {
      if (e.kind === 'line') this.line(e.layer, e.a, e.b, e.dashed ? 'DASHED' : undefined);
      else if (e.kind === 'polyline') this.lwPolyline(e.layer, e.points, e.closed);
      else this.text(e.layer, e.at, e.text, e.height, e.center);
    }

    this.pair('0', 'ENDSEC');
  }

  /**
   * Un muro se dibuja como su CONTORNO real (polilínea cerrada de 4 vértices),
   * no como su eje. Un eje no se puede acotar ni sombrear: el delineante
   * necesita las dos caras del muro, que es lo que se mide en obra.
   */
  private writeWall(wall: Wall): void {
    const layer = wall.isStructural ? DXF_LAYERS.wallStructural : DXF_LAYERS.wallPartition;

    const dx = wall.endPoint.x - wall.startPoint.x;
    const dy = wall.endPoint.y - wall.startPoint.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-9) return; // muro degenerado: no se exporta

    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const half = (wall.thickness as number) / 2;

    this.lwPolyline(
      layer,
      [
        { x: wall.startPoint.x + nx * half, y: wall.startPoint.y + ny * half },
        { x: wall.endPoint.x + nx * half, y: wall.endPoint.y + ny * half },
        { x: wall.endPoint.x - nx * half, y: wall.endPoint.y - ny * half },
        { x: wall.startPoint.x - nx * half, y: wall.startPoint.y - ny * half },
      ],
      true,
    );
  }

  private writeColumn(column: Column): void {
    if (column.isCircular) {
      this.circle(DXF_LAYERS.columns, column.position, (column.dimensionX as number) / 2);
      return;
    }
    const footprint = column.footprint();
    if (footprint) this.lwPolyline(DXF_LAYERS.columns, footprint, true);
  }

  /**
   * Proyecta los huecos de la elevación como símbolos de planta: la puerta con
   * su hoja y su arco de barrido, la ventana con marco y vidrio. Es lo que
   * LevON llamaba "Plan Projection System" y tenía pendiente.
   */
  private writeOpenings(
    walls: readonly Wall[],
    elevations: readonly WallElevation[],
  ): void {
    const wallsById = new Map(walls.map((w) => [w.id as string, w]));

    for (const elevation of elevations) {
      const wall = wallsById.get(elevation.wallId);
      if (!wall) continue;

      const dx = wall.endPoint.x - wall.startPoint.x;
      const dy = wall.endPoint.y - wall.startPoint.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-9) continue;

      const ux = dx / length;
      const uy = dy / length;
      const px = -uy;
      const py = ux;

      for (const opening of elevation.openings) {
        const start = {
          x: wall.startPoint.x + ux * opening.xOffset,
          y: wall.startPoint.y + uy * opening.xOffset,
        };
        const end = {
          x: wall.startPoint.x + ux * openingEnd(opening),
          y: wall.startPoint.y + uy * openingEnd(opening),
        };

        if (opening.type === 'door') {
          const side = opening.isFlipped ? -1 : 1;
          const leafEnd = {
            x: start.x + px * opening.width * side,
            y: start.y + py * opening.width * side,
          };
          this.line(DXF_LAYERS.openings, start, leafEnd);

          const baseAngle = Math.atan2(py * side, px * side);
          this.arc(DXF_LAYERS.openings, start, opening.width, baseAngle, (-Math.PI / 2) * side);
        } else if (opening.type === 'window') {
          const offset = (wall.thickness as number) * 0.35;
          for (const sign of [-1, 1]) {
            this.line(
              DXF_LAYERS.openings,
              { x: start.x + px * offset * sign, y: start.y + py * offset * sign },
              { x: end.x + px * offset * sign, y: end.y + py * offset * sign },
            );
          }
          this.line(DXF_LAYERS.openings, start, end);
        } else {
          // Hueco genérico: solo los dos cantos, sin símbolo de carpintería.
          this.line(DXF_LAYERS.openings, start, end);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // OBJECTS
  // -------------------------------------------------------------------------

  private writeObjects(): void {
    this.pair('0', 'SECTION');
    this.pair('2', 'OBJECTS');

    // Diccionario raíz: obligatorio en AC1015 aunque esté casi vacío.
    this.pair('0', 'DICTIONARY');
    this.pair('5', H_ROOT_DICT);
    this.pair('330', '0');
    this.pair('100', 'AcDbDictionary');
    this.pair('281', '1');
    this.pair('3', 'ACAD_GROUP');
    this.pair('350', H_GROUP_DICT);

    this.pair('0', 'DICTIONARY');
    this.pair('5', H_GROUP_DICT);
    this.pair('330', H_ROOT_DICT);
    this.pair('100', 'AcDbDictionary');
    this.pair('281', '1');

    this.pair('0', 'ENDSEC');
  }

  // -------------------------------------------------------------------------
  // Primitivas de entidad
  // -------------------------------------------------------------------------

  private entityHeader(type: string, layer: string): void {
    this.pair('0', type);
    this.pair('5', this.nextHandle());
    this.pair('330', H_MODEL_BLK_REC); // owner = *Model_Space
    this.pair('100', 'AcDbEntity');
    this.pair('8', layer);
  }

  private lwPolyline(layer: string, points: readonly Point2D[], closed: boolean): void {
    if (points.length === 0) return;
    this.entityHeader('LWPOLYLINE', layer);
    this.pair('100', 'AcDbPolyline');
    this.pair('90', String(points.length));
    this.pair('70', closed ? '1' : '0');
    this.pair('43', '0.0');
    for (const point of points) {
      this.pair('10', this.num(point.x));
      this.pair('20', this.num(point.y));
    }
  }

  private line(layer: string, a: Point2D, b: Point2D, linetype?: string): void {
    this.entityHeader('LINE', layer);
    if (linetype) this.pair('6', linetype);
    this.pair('100', 'AcDbLine');
    this.pair('10', this.num(a.x));
    this.pair('20', this.num(a.y));
    this.pair('30', '0.0');
    this.pair('11', this.num(b.x));
    this.pair('21', this.num(b.y));
    this.pair('31', '0.0');
  }

  private circle(layer: string, center: Point2D, radius: number): void {
    if (!(radius > 0) || !Number.isFinite(radius)) return;
    this.entityHeader('CIRCLE', layer);
    this.pair('100', 'AcDbCircle');
    this.pair('10', this.num(center.x));
    this.pair('20', this.num(center.y));
    this.pair('30', '0.0');
    this.pair('40', this.num(radius));
  }

  private arc(
    layer: string,
    center: Point2D,
    radius: number,
    startRad: number,
    sweepRad: number,
  ): void {
    if (!(radius > 0) || !Number.isFinite(radius)) return;

    // DXF solo sabe dibujar arcos en sentido ANTIHORARIO de `50` a `51`. Un
    // barrido negativo se expresa intercambiando los dos ángulos, no con un
    // signo — no existe un campo para el sentido.
    const startDeg = normalizeDegrees(toDegrees(startRad));
    const endDeg = normalizeDegrees(toDegrees(startRad + sweepRad));

    this.entityHeader('ARC', layer);
    this.pair('100', 'AcDbCircle');
    this.pair('10', this.num(center.x));
    this.pair('20', this.num(center.y));
    this.pair('30', '0.0');
    this.pair('40', this.num(radius));
    this.pair('100', 'AcDbArc');
    this.pair('50', this.num(sweepRad >= 0 ? startDeg : endDeg));
    this.pair('51', this.num(sweepRad >= 0 ? endDeg : startDeg));
  }

  private text(layer: string, position: Point2D, value: string, height: number, center = false): void {
    this.entityHeader('TEXT', layer);
    this.pair('100', 'AcDbText');
    this.pair('10', this.num(position.x));
    this.pair('20', this.num(position.y));
    this.pair('30', '0.0');
    this.pair('40', this.num(height));
    this.pair('1', sanitizeDxfText(value));
    this.pair('7', 'Standard');
    if (center) {
      // Centrado (72=1) y al medio (73=2) del punto de alineación (11/21).
      this.pair('72', '1');
      this.pair('11', this.num(position.x));
      this.pair('21', this.num(position.y));
      this.pair('31', '0.0');
    }
    this.pair('100', 'AcDbText');
    this.pair('73', center ? '2' : '0');
  }

  // -------------------------------------------------------------------------
  // Utilidades
  // -------------------------------------------------------------------------

  /** Par grupo/valor: el código y el valor, cada uno en su propia línea. */
  private pair(code: string, value: string): void {
    this.lines.push(code, value);
  }

  private nextHandle(): string {
    const handle = this.handleCounter.toString(16).toUpperCase();
    this.handleCounter++;
    return handle;
  }

  private num(value: number): string {
    if (!Number.isFinite(value)) return '0.0';
    const text = value.toFixed(this.precision);
    // "-0.0000" confunde a algunos parsers: se normaliza a "0.0000".
    return /^-0\.0+$/.test(text) ? text.slice(1) : text;
  }
}

// ---------------------------------------------------------------------------
// Funciones auxiliares (exportadas para poder probarlas)
// ---------------------------------------------------------------------------

interface DXFBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Extensión del dibujo, con un margen de 1 m. Sin `$EXTMIN`/`$EXTMAX`
 * coherentes, AutoCAD abre el archivo con un zoom arbitrario y el usuario cree
 * que está vacío.
 */
export function computeBounds(data: DXFExportData): DXFBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const expand = (p: Point2D) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  };

  for (const wall of data.walls) {
    expand(wall.startPoint);
    expand(wall.endPoint);
  }
  for (const column of data.columns) {
    const r = Math.max(column.dimensionX as number, column.dimensionY as number) / 2;
    expand({ x: column.position.x - r, y: column.position.y - r });
    expand({ x: column.position.x + r, y: column.position.y + r });
  }
  for (const vertex of data.room?.geometry ?? []) expand(vertex);

  // Dibujo vacío: un cuadrado de referencia en lugar de infinitos, que
  // producirían un header ilegible.
  if (minX === Infinity) return { minX: -1, minY: -1, maxX: 1, maxY: 1 };

  const margin = 1;
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

function centroidOf(points: readonly Point2D[]): Point2D {
  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function normalizeDegrees(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Sanea un texto para DXF. Los saltos de línea son el problema real: el formato
 * es "una línea por valor", así que un `\n` dentro de un texto desplazaría todo
 * lo que viene detrás y rompería el archivo completo.
 */
export function sanitizeDxfText(value: string): string {
  // R2000 lee el archivo en la página de códigos de Windows, no en UTF-8: "·", "ñ" u
  // "ó" escritos tal cual salían como "Â·", "Ã±"… Fuera de ASCII se escribe \U+XXXX,
  // que AutoCAD y los demás lectores decodifican.
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .replace(/[^\x20-\x7E]/gu, (ch) => `\\U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`);
}

/** Nombre de archivo seguro en cualquier sistema. */
export function sanitizeDxfFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'dibujo';
}

/** Entidad del dibujo técnico en coordenadas de intercambio (Y arriba). */
function draftForExport(e: DxfDraftEntity): DxfDraftEntity {
  if (e.kind === 'line') return { ...e, a: toLocal(e.a), b: toLocal(e.b) };
  if (e.kind === 'polyline') return { ...e, points: e.points.map(toLocal) };
  return { ...e, at: toLocal(e.at) };
}
