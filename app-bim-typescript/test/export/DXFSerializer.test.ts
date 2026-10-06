// =============================================================================
// DXFSerializer.test.ts — DXF R2000 (AC1015)
// =============================================================================
//
// DXF es un formato que falla ENTERO y en silencio: AutoCAD rechaza el archivo
// sin decir por qué si falta una sección, si el orden no es el esperado o si un
// handle está repetido. No se puede comprobar "a ojo" abriendo el resultado, y
// por eso la estructura se verifica aquí par por par.
// =============================================================================

import {
  DXFSerializer,
  DXFExportError,
  DXF_LAYERS,
  computeBounds,
  sanitizeDxfText,
  sanitizeDxfFilename,
  DXFExportData,
} from '../../src/infrastructure/export/dxf/DXFSerializer';
import { Wall } from '../../src/domain/objects/wall';
import { Column } from '../../src/domain/objects/column';
import { Room } from '../../src/domain/objects/room';
import { revitObjectId, roomId, levelId } from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';
import { wallOpeningId, WallElevation } from '../../src/domain/objects/wall-elevation';

const ROOM_ID = roomId('dxf-room');

// ---------------------------------------------------------------------------
// Ayudas
// ---------------------------------------------------------------------------

function makeWall(id: string, ax: number, ay: number, bx: number, by: number, structural = true): Wall {
  return new Wall({
    id: revitObjectId(id),
    roomId: ROOM_ID,
    startPoint: { x: ax, y: ay },
    endPoint: { x: bx, y: by },
    thickness: meters(0.2),
    height: meters(2.8),
    isStructural: structural,
  });
}

function data(overrides: Partial<DXFExportData> = {}): DXFExportData {
  return { title: 'Prueba', room: null, walls: [], columns: [], ...overrides };
}

/** Los pares grupo/valor del archivo, como lista de [código, valor]. */
function pairs(dxf: string): [string, string][] {
  const lines = dxf.split('\n');
  const out: [string, string][] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) out.push([lines[i], lines[i + 1]]);
  return out;
}

/** Valores de todos los pares con el código dado. */
function valuesOf(dxf: string, code: string): string[] {
  return pairs(dxf)
    .filter(([c]) => c === code)
    .map(([, v]) => v);
}

/** Nombres de las secciones, en orden de aparición. */
function sectionNames(dxf: string): string[] {
  const all = pairs(dxf);
  const names: string[] = [];
  for (let i = 0; i < all.length; i++) {
    if (all[i][0] === '0' && all[i][1] === 'SECTION' && all[i + 1]?.[0] === '2') {
      names.push(all[i + 1][1]);
    }
  }
  return names;
}

/** Tipos de entidad dentro de la sección ENTITIES. */
function entityTypes(dxf: string): string[] {
  const all = pairs(dxf);
  const start = all.findIndex(([c, v], i) => c === '0' && v === 'SECTION' && all[i + 1]?.[1] === 'ENTITIES');
  if (start < 0) return [];

  const types: string[] = [];
  for (let i = start + 2; i < all.length; i++) {
    const [code, value] = all[i];
    if (code === '0' && value === 'ENDSEC') break;
    if (code === '0') types.push(value);
  }
  return types;
}

// ---------------------------------------------------------------------------
// Estructura del archivo
// ---------------------------------------------------------------------------

describe('DXFSerializer — estructura AC1015', () => {
  const dxf = new DXFSerializer().serialize(data({ walls: [makeWall('w1', 0, 0, 4, 0)] }));

  it('declara la versión AC1015', () => {
    const p = pairs(dxf);
    const index = p.findIndex(([c, v]) => c === '9' && v === '$ACADVER');
    expect(p[index + 1]).toEqual(['1', 'AC1015']);
  });

  it('emite las seis secciones en el orden obligatorio', () => {
    // El orden no es negociable: AutoCAD rechaza el archivo si cambia.
    expect(sectionNames(dxf)).toEqual([
      'HEADER',
      'CLASSES',
      'TABLES',
      'BLOCKS',
      'ENTITIES',
      'OBJECTS',
    ]);
  });

  it('termina en EOF', () => {
    expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
  });

  it('usa saltos LF, nunca CRLF', () => {
    // Algunos parsers DXF toleran CRLF y otros no; LF los pasa todos.
    expect(dxf).not.toContain('\r');
  });

  it('cada par ocupa exactamente dos líneas', () => {
    const lines = dxf.split('\n').filter((l, i, arr) => !(i === arr.length - 1 && l === ''));
    expect(lines.length % 2).toBe(0);
  });

  it('todos los códigos de grupo son numéricos', () => {
    // Un valor que se colara en la posición de un código (por un salto de línea
    // dentro de un texto, por ejemplo) desplazaría el archivo entero.
    for (const [code] of pairs(dxf)) {
      expect(code).toMatch(/^\d+$/);
    }
  });

  it('declara todas las capas que luego usa', () => {
    const declared = new Set(valuesOf(dxf, '2'));
    for (const layer of Object.values(DXF_LAYERS)) {
      expect(declared.has(layer)).toBe(true);
    }
  });

  it('declara el bloque *Model_Space y *Paper_Space', () => {
    const names = valuesOf(dxf, '2');
    expect(names).toContain('*Model_Space');
    expect(names).toContain('*Paper_Space');
  });
});

// ---------------------------------------------------------------------------
// Handles
// ---------------------------------------------------------------------------

describe('DXFSerializer — handles', () => {
  it('no repite ningún handle', () => {
    // Un handle duplicado hace que AutoCAD rechace el archivo entero sin
    // explicar por qué.
    const dxf = new DXFSerializer().serialize(
      data({
        walls: [makeWall('w1', 0, 0, 4, 0), makeWall('w2', 4, 0, 4, 3)],
        columns: [
          new Column({
            id: revitObjectId('c1'),
            roomId: ROOM_ID,
            position: { x: 2, y: 1 },
            diameter: meters(0.4),
            height: meters(3),
          }),
        ],
      }),
    );

    const handles = valuesOf(dxf, '5');
    expect(new Set(handles).size).toBe(handles.length);
  });

  it('todos los handles son hexadecimales en mayúsculas', () => {
    const dxf = new DXFSerializer().serialize(data({ walls: [makeWall('w1', 0, 0, 4, 0)] }));
    for (const handle of valuesOf(dxf, '5')) {
      expect(handle).toMatch(/^[0-9A-F]+$/);
    }
  });

  it('los handles dinámicos no invaden el rango de los fijos (< 0x100)', () => {
    // Los fijos ocupan 0x1–0x21 y AutoCAD los espera exactamente ahí.
    const dxf = new DXFSerializer().serialize(data({ walls: [makeWall('w1', 0, 0, 4, 0)] }));
    const entityHandles = entityHandlesOf(dxf);
    for (const handle of entityHandles) {
      expect(parseInt(handle, 16)).toBeGreaterThanOrEqual(0x100);
    }
  });

  it('el contador de handles se reinicia entre exportaciones', () => {
    // Si no, dos exportaciones seguidas darían archivos distintos y los handles
    // crecerían sin límite durante la sesión.
    const serializer = new DXFSerializer();
    const scene = data({ walls: [makeWall('w1', 0, 0, 4, 0)] });
    expect(serializer.serialize(scene)).toBe(serializer.serialize(scene));
  });
});

/** Valores de un código dentro de la sección ENTITIES. */
function entityValuesOf(dxf: string, code: string): string[] {
  const all = pairs(dxf);
  const start = all.findIndex(([c, v], i) => c === '0' && v === 'SECTION' && all[i + 1]?.[1] === 'ENTITIES');
  const values: string[] = [];
  for (let i = start + 2; i < all.length; i++) {
    if (all[i][0] === '0' && all[i][1] === 'ENDSEC') break;
    if (all[i][0] === code) values.push(all[i][1]);
  }
  return values;
}

/** Handles de las entidades de ENTITIES (los que siguen a un tipo de entidad). */
function entityHandlesOf(dxf: string): string[] {
  const all = pairs(dxf);
  const start = all.findIndex(([c, v], i) => c === '0' && v === 'SECTION' && all[i + 1]?.[1] === 'ENTITIES');
  const handles: string[] = [];
  for (let i = start + 2; i < all.length; i++) {
    if (all[i][0] === '0' && all[i][1] === 'ENDSEC') break;
    if (all[i][0] === '5') handles.push(all[i][1]);
  }
  return handles;
}

// ---------------------------------------------------------------------------
// Entidades
// ---------------------------------------------------------------------------

describe('DXFSerializer — muros', () => {
  it('dibuja el CONTORNO del muro, no su eje', () => {
    // Un eje no se puede acotar ni sombrear: el delineante necesita las dos
    // caras del muro, que es lo que se mide en obra.
    const dxf = new DXFSerializer().serialize(data({ walls: [makeWall('w1', 0, 0, 4, 0)] }));

    expect(entityTypes(dxf)).toEqual(['LWPOLYLINE']);
    expect(valuesOf(dxf, '90')).toEqual(['4']); // 4 vértices
    expect(valuesOf(dxf, '70')).toContain('1'); // cerrada
  });

  it('el contorno respeta el espesor real del muro', () => {
    const dxf = new DXFSerializer().serialize(data({ walls: [makeWall('w1', 0, 0, 4, 0)] }));

    // Muro de 0.2 m horizontal → caras en y = ±0.1.
    const ys = valuesOf(dxf, '20').map(Number);
    expect(ys).toContain(0.1);
    expect(ys).toContain(-0.1);
  });

  it('separa muros portantes y particiones en capas distintas', () => {
    const dxf = new DXFSerializer().serialize(
      data({ walls: [makeWall('w1', 0, 0, 4, 0, true), makeWall('w2', 0, 1, 4, 1, false)] }),
    );

    const entityLayers = valuesOf(dxf, '8');
    expect(entityLayers).toContain(DXF_LAYERS.wallStructural);
    expect(entityLayers).toContain(DXF_LAYERS.wallPartition);
  });

  it('omite un muro degenerado en vez de emitir geometría inválida', () => {
    const dxf = new DXFSerializer().serialize(data({ walls: [makeWall('w1', 2, 2, 2, 2)] }));
    expect(entityTypes(dxf)).toEqual([]);
  });
});

describe('DXFSerializer — columnas', () => {
  it('una columna circular se exporta como CIRCLE con su radio', () => {
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 2, y: 1 },
      diameter: meters(0.5),
      height: meters(3),
    });
    const dxf = new DXFSerializer().serialize(data({ columns: [column] }));

    expect(entityTypes(dxf)).toEqual(['CIRCLE']);
    expect(valuesOf(dxf, '40').map(Number)).toContain(0.25);
  });

  it('una columna rectangular se exporta como polilínea de su huella rotada', () => {
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 0, y: 0 },
      sectionShape: 'rectangular',
      dimensionX: meters(0.4),
      dimensionY: meters(0.6),
      rotation: Math.PI / 4,
      height: meters(3),
    });
    const dxf = new DXFSerializer().serialize(data({ columns: [column] }));

    expect(entityTypes(dxf)).toEqual(['LWPOLYLINE']);
    expect(valuesOf(dxf, '90')).toEqual(['4']);
  });
});

describe('DXFSerializer — recinto', () => {
  const room = new Room({
    id: revitObjectId('dxf-room'),
    roomId: ROOM_ID,
    levelId: levelId('level-1'),
    geometry: [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 3 },
      { x: 0, y: 3 },
    ],
    area: squareMeters(12),
    properties: { name: 'Salón' },
  });

  it('exporta el contorno del recinto en su propia capa', () => {
    const dxf = new DXFSerializer().serialize(data({ room }));
    expect(valuesOf(dxf, '8')).toContain(DXF_LAYERS.roomBoundary);
  });

  it('rotula nombre y superficie del recinto cerrado', () => {
    const dxf = new DXFSerializer().serialize(data({ room }));

    expect(entityTypes(dxf)).toContain('TEXT');
    // R2000: lo no ASCII va como \U+XXXX (ó = U+00F3).
    expect(valuesOf(dxf, '1').join(' ')).toContain('Sal\\U+00F3n');
    expect(valuesOf(dxf, '1').join(' ')).toContain('12.00 m2');
  });

  it('no rotula un recinto sin área calculada', () => {
    const open = new Room({
      id: revitObjectId('dxf-room'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: room.geometry,
    });
    const dxf = new DXFSerializer().serialize(data({ room: open }));
    expect(entityTypes(dxf)).not.toContain('TEXT');
  });

  it('ignora un recinto con menos de 3 vértices', () => {
    const partial = new Room({
      id: revitObjectId('dxf-room'),
      roomId: ROOM_ID,
      levelId: levelId('level-1'),
      geometry: [{ x: 0, y: 0 }, { x: 4, y: 0 }],
    });
    const dxf = new DXFSerializer().serialize(data({ room: partial }));
    expect(entityTypes(dxf)).toEqual([]);
  });
});

describe('DXFSerializer — huecos proyectados en planta', () => {
  const wall = makeWall('w1', 0, 0, 4, 0);

  function elevationWithOpening(type: 'door' | 'window' | 'opening'): WallElevation {
    return {
      wallId: 'w1',
      roomId: ROOM_ID as string,
      levels: { base: 0, coronacion: 2.8 },
      openings: [
        {
          id: wallOpeningId('o1'),
          type,
          xOffset: 1,
          width: 0.9,
          sillHeight: type === 'window' ? 0.9 : 0,
          height: 2.1,
          isFlipped: false,
        },
      ],
      chainModeEnabled: false,
    };
  }

  it('una puerta proyecta su hoja y su arco de barrido', () => {
    const dxf = new DXFSerializer().serialize(
      data({ walls: [wall], elevations: [elevationWithOpening('door')] }),
    );

    const types = entityTypes(dxf);
    expect(types).toContain('LINE'); // la hoja
    expect(types).toContain('ARC'); // el barrido
  });

  it('una ventana proyecta marco y vidrio: tres líneas paralelas', () => {
    const dxf = new DXFSerializer().serialize(
      data({ walls: [wall], elevations: [elevationWithOpening('window')] }),
    );

    expect(entityTypes(dxf).filter((t) => t === 'LINE')).toHaveLength(3);
    expect(entityTypes(dxf)).not.toContain('ARC');
  });

  it('un hueco genérico solo marca sus dos cantos, sin carpintería', () => {
    const dxf = new DXFSerializer().serialize(
      data({ walls: [wall], elevations: [elevationWithOpening('opening')] }),
    );

    expect(entityTypes(dxf).filter((t) => t === 'LINE')).toHaveLength(1);
  });

  it('ignora la elevación de un muro que no está en el dibujo', () => {
    const orphan: WallElevation = { ...elevationWithOpening('door'), wallId: 'w-inexistente' };
    const dxf = new DXFSerializer().serialize(data({ walls: [wall], elevations: [orphan] }));

    expect(entityTypes(dxf)).toEqual(['LWPOLYLINE']); // solo el muro
  });

  it('los ángulos del arco quedan normalizados a [0, 360)', () => {
    // DXF solo dibuja arcos en sentido antihorario de 50 a 51; un ángulo
    // negativo se interpreta de forma impredecible.
    const dxf = new DXFSerializer().serialize(
      data({ walls: [wall], elevations: [elevationWithOpening('door')] }),
    );

    for (const code of ['50', '51']) {
      for (const value of valuesOf(dxf, code).map(Number)) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(360);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bounds y saneado
// ---------------------------------------------------------------------------

describe('computeBounds', () => {
  it('encierra todos los muros con un margen de 1 m', () => {
    const bounds = computeBounds(data({ walls: [makeWall('w1', 0, 0, 4, 3)] }));
    expect(bounds).toEqual({ minX: -1, minY: -1, maxX: 5, maxY: 4 });
  });

  it('tiene en cuenta el radio de las columnas', () => {
    const column = new Column({
      id: revitObjectId('c1'),
      roomId: ROOM_ID,
      position: { x: 10, y: 10 },
      diameter: meters(2),
      height: meters(3),
    });
    const bounds = computeBounds(data({ columns: [column] }));
    expect(bounds.maxX).toBeCloseTo(12);
  });

  it('un dibujo vacío da un cuadrado de referencia, no infinitos', () => {
    // Sin esto el header saldría con "Infinity" y AutoCAD no abriría el archivo.
    expect(computeBounds(data())).toEqual({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
  });

  it('ignora coordenadas no finitas en vez de propagarlas al header', () => {
    const broken = makeWall('w1', 0, 0, 4, 0);
    broken.endPoint = { x: NaN, y: NaN };
    const bounds = computeBounds(data({ walls: [broken] }));
    expect(Number.isFinite(bounds.maxX)).toBe(true);
  });
});

describe('Saneado', () => {
  it('sanitizeDxfText elimina los saltos de línea', () => {
    // Un \n dentro de un texto desplazaría todos los pares siguientes y
    // rompería el archivo entero.
    expect(sanitizeDxfText('Salon\nprincipal')).toBe('Salon principal');
    expect(sanitizeDxfText('a\r\nb')).toBe('a b');
  });

  it('sanitizeDxfText escribe lo que no es ASCII como \\U+XXXX (R2000 no lee UTF-8)', () => {
    expect(sanitizeDxfText('Salón')).toBe('Sal\\U+00F3n');
    expect(sanitizeDxfText('Muro · 15 cm')).toBe('Muro \\U+00B7 15 cm');
    expect(sanitizeDxfText('Baño m²')).toBe('Ba\\U+00F1o m\\U+00B2');
  });

  it('sanitizeDxfFilename sustituye los caracteres prohibidos', () => {
    expect(sanitizeDxfFilename('Obra: nave/2')).toBe('Obra_ nave_2');
  });

  it('sanitizeDxfFilename da un nombre por defecto si queda vacío', () => {
    expect(sanitizeDxfFilename('///')).toBe('___');
    expect(sanitizeDxfFilename('   ')).toBe('dibujo');
  });
});

describe('DXFSerializer — validación de entrada', () => {
  it('rechaza un título vacío', () => {
    expect(() => new DXFSerializer().serialize(data({ title: '  ' }))).toThrow(DXFExportError);
  });

  it('exporta un dibujo vacío sin romperse: es un DXF válido y sin entidades', () => {
    const dxf = new DXFSerializer().serialize(data());
    expect(sectionNames(dxf)).toHaveLength(6);
    expect(entityTypes(dxf)).toEqual([]);
  });

  it('respeta la precisión pedida en las coordenadas de las entidades', () => {
    // Solo la sección ENTITIES: las constantes estructurales del HEADER y de
    // los bloques (`$LIMMIN`, el origen de *Model_Space*) son literales "0.0"
    // fijados por el formato, no coordenadas del dibujo.
    const dxf = new DXFSerializer().serialize(
      data({ walls: [makeWall('w1', 0, 0, 1.23456789, 0)], precision: 2 }),
    );

    for (const value of entityValuesOf(dxf, '10')) {
      expect(value).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it('nunca emite "-0.0000", que confunde a algunos parsers', () => {
    const dxf = new DXFSerializer().serialize(data({ walls: [makeWall('w1', 0, 0, -4, 0)] }));
    for (const [, value] of pairs(dxf)) {
      expect(value).not.toMatch(/^-0\.0+$/);
    }
  });
});
