// =============================================================================
// IFCSerializer.test.ts — Tests de serialización IFC
// Basado en: IFC-Compatibility-Gate.md, escritura-objetos-IFC.md
//
// 18+ tests:
//   ✅ Serializar Room simple (4 muros)
//   ✅ Serializar con 1 Door
//   ✅ Serializar con 2 Windows
//   ✅ Serializar con 1 Column
//   ✅ Serializar con Floor
//   ✅ Output contiene IfcSpace
//   ✅ Output contiene IfcWall
//   ✅ Output contiene IfcDoor + IfcOpeningElement
//   ✅ Output contiene IfcColumn
//   ✅ GUID válido (22 chars, alfanuméricos)
//   ✅ Validación: Room abierto → warning
//   ✅ Validación: Wall sin espesor → error
//   ✅ Validación: Door sin Wall padre → error
//   ✅ Validación: Polígono auto-intersectante → error
//   ✅ Room con 20 muros compila sin error
//   ✅ Archivo STEP cumple ISO 10303-21
//   ✅ Puede escribirse a disco
//   ✅ Puedo releer el .ifc generado (formato válido)
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IFCSerializer } from '../../src/infrastructure/export/ifc/IFCSerializer';
import { generateGuid, isValidIfcGuid } from '../../src/infrastructure/export/ifc/guid-generator';
import { validate8Criteria } from '../../src/infrastructure/export/ifc/compatibility-gate';
import { SerializeInput } from '../../src/infrastructure/export/ifc/types';
import { Room } from '../../src/domain/objects/room';
import { Wall } from '../../src/domain/objects/wall';
import { Door } from '../../src/domain/objects/door';
import { Window } from '../../src/domain/objects/window';
import { Column } from '../../src/domain/objects/column';
import { Floor } from '../../src/domain/objects/floor';
import {
  revitObjectId,
  roomId,
  levelId,
  wallId,
} from '../../src/domain/objects/base';
import { meters, squareMeters } from '../../src/domain/geometry/types';

// ---------------------------------------------------------------------------
// Helpers — builders para crear objetos de prueba rápidamente
// ---------------------------------------------------------------------------

function makeRoom(overrides?: Partial<{
  id: string;
  geometry: { x: number; y: number }[];
  isOpen: boolean;
  isClosed: boolean;
  area: number | null;
  levelIdVal: string;
}>): Room {
  const opts = overrides ?? {};
  const rid = opts.id ?? 'room-1';
  return new Room({
    id: revitObjectId(rid),
    roomId: roomId(rid),
    levelId: levelId(opts.levelIdVal ?? 'level-1'),
    geometry: opts.geometry ?? [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 4 },
      { x: 0, y: 4 },
    ],
    isOpen: opts.isOpen ?? false,
    isClosed: opts.isClosed ?? true,
    area: opts.area !== undefined ? (opts.area !== null ? squareMeters(opts.area) : null) : squareMeters(20),
  });
}

function makeWall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
  overrides?: Partial<{
    thickness: number;
    height: number;
    material: string;
    is_deleted: boolean;
  }>
): Wall {
  return new Wall({
    id: revitObjectId(id),
    roomId: roomId('room-1'),
    startPoint: start,
    endPoint: end,
    thickness: meters(overrides?.thickness ?? 0.15),
    height: meters(overrides?.height ?? 3.0),
    material: overrides?.material,
    is_deleted: overrides?.is_deleted,
  });
}

function makeDoor(
  id: string,
  parentWall: string,
  overrides?: Partial<{
    offsetAlongWall: number;
    width: number;
    height: number;
    is_deleted: boolean;
  }>
): Door {
  return new Door({
    id: revitObjectId(id),
    roomId: roomId('room-1'),
    parentWallId: wallId(parentWall),
    offsetAlongWall: meters(overrides?.offsetAlongWall ?? 1.0),
    offsetPerpendicular: meters(0),
    width: meters(overrides?.width ?? 0.9),
    height: meters(overrides?.height ?? 2.1),
    is_deleted: overrides?.is_deleted,
  });
}

function makeWindow(
  id: string,
  parentWall: string,
  overrides?: Partial<{
    offsetAlongWall: number;
    width: number;
    height: number;
  }>
): Window {
  return new Window({
    id: revitObjectId(id),
    roomId: roomId('room-1'),
    parentWallId: wallId(parentWall),
    offsetAlongWall: meters(overrides?.offsetAlongWall ?? 1.5),
    offsetPerpendicular: meters(0),
    width: meters(overrides?.width ?? 1.2),
    height: meters(overrides?.height ?? 1.5),
  });
}

function makeColumn(
  id: string,
  position: { x: number; y: number },
  overrides?: Partial<{
    diameter: number;
    height: number;
    material: string;
  }>
): Column {
  return new Column({
    id: revitObjectId(id),
    roomId: roomId('room-1'),
    position,
    diameter: meters(overrides?.diameter ?? 0.3),
    height: meters(overrides?.height ?? 3.0),
    material: overrides?.material,
  });
}

function makeFloor(overrides?: Partial<{
  thickness: number;
  material: string;
  isImplicit: boolean;
}>): Floor {
  return new Floor({
    id: revitObjectId('floor-1'),
    roomId: roomId('room-1'),
    isImplicit: overrides?.isImplicit ?? true,
    thickness: overrides?.thickness !== undefined ? meters(overrides.thickness) : meters(0.2),
    material: overrides?.material ?? 'hormigón',
  });
}

/** Room rectangular con 4 muros. */
function makeSimpleInput(): SerializeInput {
  const room = makeRoom();
  const walls = [
    makeWall('w1', { x: 0, y: 0 }, { x: 5, y: 0 }),
    makeWall('w2', { x: 5, y: 0 }, { x: 5, y: 4 }),
    makeWall('w3', { x: 5, y: 4 }, { x: 0, y: 4 }),
    makeWall('w4', { x: 0, y: 4 }, { x: 0, y: 0 }),
  ];
  return { room, walls, doors: [], windows: [], columns: [], floor: null };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('IFCSerializer', () => {
  const serializer = new IFCSerializer();

  // -----------------------------------------------------------------------
  // 1. Serializar Room simple (4 muros)
  // -----------------------------------------------------------------------
  test('serializa un Room simple con 4 muros', async () => {
    const input = makeSimpleInput();
    const result = await serializer.serialize(input);

    expect(result.validation.valid).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
    expect(result.entityCount).toBeGreaterThanOrEqual(4 + 4); // project+site+building+space + 4 walls
  });

  // -----------------------------------------------------------------------
  // 2. Serializar con 1 Door
  // -----------------------------------------------------------------------
  test('serializa con 1 Door', async () => {
    const input = makeSimpleInput();
    const door = makeDoor('d1', 'w1');
    const withDoor: SerializeInput = { ...input, doors: [door] };
    const result = await serializer.serialize(withDoor);

    expect(result.validation.valid).toBe(true);
    expect(result.content).toContain('IFCDOOR');
    expect(result.content).toContain('IFCOPENINGELEMENT');
  });

  // -----------------------------------------------------------------------
  // 3. Serializar con 2 Windows
  // -----------------------------------------------------------------------
  test('serializa con 2 Windows', async () => {
    const input = makeSimpleInput();
    const win1 = makeWindow('win1', 'w2', { offsetAlongWall: 0.5 });
    const win2 = makeWindow('win2', 'w3', { offsetAlongWall: 1.0 });
    const withWindows: SerializeInput = { ...input, windows: [win1, win2] };
    const result = await serializer.serialize(withWindows);

    expect(result.validation.valid).toBe(true);
    // Two IFCWINDOW entities
    const windowMatches = result.content.match(/IFCWINDOW\(/g);
    expect(windowMatches).not.toBeNull();
    expect(windowMatches!.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 4. Serializar con 1 Column
  // -----------------------------------------------------------------------
  test('serializa con 1 Column', async () => {
    const input = makeSimpleInput();
    const col = makeColumn('col1', { x: 2.5, y: 2.0 });
    const withCol: SerializeInput = { ...input, columns: [col] };
    const result = await serializer.serialize(withCol);

    expect(result.validation.valid).toBe(true);
    expect(result.content).toContain('IFCCOLUMN');
  });

  // -----------------------------------------------------------------------
  // 5. Serializar con Floor
  // -----------------------------------------------------------------------
  test('serializa con Floor', async () => {
    const input = makeSimpleInput();
    const floor = makeFloor();
    const withFloor: SerializeInput = { ...input, floor };
    const result = await serializer.serialize(withFloor);

    expect(result.validation.valid).toBe(true);
    expect(result.content).toContain('IFCSLAB');
    expect(result.content).toContain('.FLOOR.');
  });

  // -----------------------------------------------------------------------
  // 6. Output contiene IfcSpace
  // -----------------------------------------------------------------------
  test('output contiene IfcSpace', async () => {
    const result = await serializer.serialize(makeSimpleInput());
    expect(result.content).toContain('IFCSPACE');
  });

  // -----------------------------------------------------------------------
  // 7. Output contiene IfcWall
  // -----------------------------------------------------------------------
  test('output contiene IfcWallStandardCase', async () => {
    const result = await serializer.serialize(makeSimpleInput());
    expect(result.content).toContain('IFCWALLSTANDARDCASE');
    const wallMatches = result.content.match(/IFCWALLSTANDARDCASE\(/g);
    expect(wallMatches).not.toBeNull();
    expect(wallMatches!.length).toBe(4); // 4 muros
  });

  // -----------------------------------------------------------------------
  // 8. Output contiene IfcDoor + IfcOpeningElement
  // -----------------------------------------------------------------------
  test('output contiene IfcDoor + IfcOpeningElement juntos', async () => {
    const input = makeSimpleInput();
    const door = makeDoor('d1', 'w1');
    const result = await serializer.serialize({ ...input, doors: [door] });

    expect(result.content).toContain('IFCOPENINGELEMENT');
    expect(result.content).toContain('IFCDOOR');
    expect(result.content).toContain('IFCRELVOIDSELEMENT');
    expect(result.content).toContain('IFCRELFILLSELEMENT');
  });

  // -----------------------------------------------------------------------
  // 9. Output contiene IfcColumn
  // -----------------------------------------------------------------------
  test('output contiene IfcColumn con relación espacial', async () => {
    const input = makeSimpleInput();
    const col = makeColumn('col1', { x: 1, y: 1 });
    const result = await serializer.serialize({ ...input, columns: [col] });

    expect(result.content).toContain('IFCCOLUMN');
    expect(result.content).toContain('IFCRELCONTAINEDINSPATIALSTRUCTURE');
  });

  // -----------------------------------------------------------------------
  // 10. GUID válido (22 chars, alfanuméricos + _ + $)
  // -----------------------------------------------------------------------
  test('generateGuid() produce GUID IFC válido de 22 caracteres', () => {
    const guids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const guid = generateGuid();
      expect(guid).toHaveLength(22);
      expect(isValidIfcGuid(guid)).toBe(true);
      guids.add(guid);
    }
    // Todos únicos
    expect(guids.size).toBe(100);
  });

  // -----------------------------------------------------------------------
  // 11. Validación: Room abierto → warning
  // -----------------------------------------------------------------------
  test('Room abierto genera warning, no error', async () => {
    const room = makeRoom({ isOpen: true });
    const input: SerializeInput = {
      room,
      walls: [
        makeWall('w1', { x: 0, y: 0 }, { x: 5, y: 0 }),
        makeWall('w2', { x: 5, y: 0 }, { x: 5, y: 4 }),
      ],
      doors: [],
      windows: [],
      columns: [],
      floor: null,
    };

    const result = await serializer.serialize(input);

    // Valid (warnings don't block)
    expect(result.validation.valid).toBe(true);
    const roomWarning = result.validation.entries.find((e) => e.criterion === 1);
    expect(roomWarning).toBeDefined();
    expect(roomWarning!.severity).toBe('warning');
  });

  // -----------------------------------------------------------------------
  // 12. Validación: Wall sin espesor → error
  // -----------------------------------------------------------------------
  test('Wall con thickness=0 genera error bloqueante', async () => {
    const room = makeRoom();
    const badWall = makeWall('w-bad', { x: 0, y: 0 }, { x: 5, y: 0 }, { thickness: 0 });
    const input: SerializeInput = {
      room,
      walls: [badWall],
      doors: [],
      windows: [],
      columns: [],
      floor: null,
    };

    const result = await serializer.serialize(input);

    expect(result.validation.valid).toBe(false);
    const thicknessError = result.validation.entries.find((e) => e.criterion === 3);
    expect(thicknessError).toBeDefined();
    expect(thicknessError!.severity).toBe('error');
    expect(result.content).toBe(''); // No content on error
  });

  // -----------------------------------------------------------------------
  // 13. Validación: Door sin Wall padre → error
  // -----------------------------------------------------------------------
  test('Door con parentWallId inexistente genera error', async () => {
    const room = makeRoom();
    const wall = makeWall('w1', { x: 0, y: 0 }, { x: 5, y: 0 });
    const orphanDoor = makeDoor('d-orphan', 'w-nonexistent');
    const input: SerializeInput = {
      room,
      walls: [wall],
      doors: [orphanDoor],
      windows: [],
      columns: [],
      floor: null,
    };

    const result = await serializer.serialize(input);

    expect(result.validation.valid).toBe(false);
    const parentError = result.validation.entries.find((e) => e.criterion === 4);
    expect(parentError).toBeDefined();
    expect(parentError!.severity).toBe('error');
  });

  // -----------------------------------------------------------------------
  // 14. Validación: Polígono auto-intersectante → error
  // -----------------------------------------------------------------------
  test('polígono auto-intersectante genera error', async () => {
    // Bowtie shape: cruza en el centro
    const room = makeRoom({
      geometry: [
        { x: 0, y: 0 },
        { x: 5, y: 4 },  // diagonal cruzada
        { x: 5, y: 0 },
        { x: 0, y: 4 },  // cruza la primera diagonal
      ],
    });
    const input: SerializeInput = {
      room,
      walls: [],
      doors: [],
      windows: [],
      columns: [],
      floor: null,
    };

    const result = await serializer.serialize(input);

    expect(result.validation.valid).toBe(false);
    const geoError = result.validation.entries.find((e) => e.criterion === 2);
    expect(geoError).toBeDefined();
    expect(geoError!.severity).toBe('error');
  });

  // -----------------------------------------------------------------------
  // 15. Room con 20 muros compila sin error
  // -----------------------------------------------------------------------
  test('Room con 20 muros serializa correctamente', async () => {
    // Generar polígono regular de 20 lados
    const n = 20;
    const radius = 10;
    const geometry: { x: number; y: number }[] = [];
    const walls: Wall[] = [];

    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      geometry.push({
        x: radius * Math.cos(angle),
        y: radius * Math.sin(angle),
      });
    }

    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      walls.push(makeWall(`w${i}`, geometry[i], geometry[j]));
    }

    const room = makeRoom({ geometry });
    const input: SerializeInput = {
      room,
      walls,
      doors: [],
      windows: [],
      columns: [],
      floor: null,
    };

    const result = await serializer.serialize(input);

    expect(result.validation.valid).toBe(true);
    const wallMatches = result.content.match(/IFCWALLSTANDARDCASE\(/g);
    expect(wallMatches).not.toBeNull();
    expect(wallMatches!.length).toBe(20);
  });

  // -----------------------------------------------------------------------
  // 16. Archivo STEP cumple ISO 10303-21
  // -----------------------------------------------------------------------
  test('archivo STEP cumple estructura ISO 10303-21', async () => {
    const result = await serializer.serialize(makeSimpleInput());
    const content = result.content;

    // Debe empezar con ISO-10303-21
    expect(content).toMatch(/^ISO-10303-21;/);

    // Debe tener HEADER...ENDSEC
    expect(content).toContain('HEADER;');
    expect(content).toContain("FILE_SCHEMA(('IFC4'));");

    // Debe tener DATA...ENDSEC
    expect(content).toContain('DATA;');

    // Debe terminar con END-ISO-10303-21
    expect(content.trim()).toMatch(/END-ISO-10303-21;$/);

    // Contar ENDSEC (debe haber exactamente 2: header + data)
    const endsecMatches = content.match(/ENDSEC;/g);
    expect(endsecMatches).not.toBeNull();
    expect(endsecMatches!.length).toBe(2);
  });

  // -----------------------------------------------------------------------
  // 17. Puede escribirse a disco
  // -----------------------------------------------------------------------
  test('puede escribirse a disco como archivo .ifc', async () => {
    const result = await serializer.serialize(makeSimpleInput());
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `test-export-${Date.now()}.ifc`);

    try {
      fs.writeFileSync(filePath, result.content, 'utf8');
      expect(fs.existsSync(filePath)).toBe(true);

      const stats = fs.statSync(filePath);
      expect(stats.size).toBeGreaterThan(0);
    } finally {
      // Cleanup
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });

  // -----------------------------------------------------------------------
  // 18. Puede releerse el .ifc generado (formato válido)
  // -----------------------------------------------------------------------
  test('archivo .ifc generado puede releerse y contiene estructura válida', async () => {
    const result = await serializer.serialize(makeSimpleInput());
    const tmpDir = os.tmpdir();
    const filePath = path.join(tmpDir, `test-reread-${Date.now()}.ifc`);

    try {
      fs.writeFileSync(filePath, result.content, 'utf8');
      const reread = fs.readFileSync(filePath, 'utf8');

      // Parsear entidades STEP: líneas que empiezan con #N=ENTITY(...)
      const entityLines = reread.split('\n').filter((line) => /^#\d+=\w+\(/.test(line));
      expect(entityLines.length).toBeGreaterThan(0);

      // Verificar que cada entidad tiene ID secuencial
      const ids = entityLines.map((line) => {
        const match = line.match(/^#(\d+)=/);
        return match ? parseInt(match[1], 10) : 0;
      });
      // IDs deben ser positivos
      for (const id of ids) {
        expect(id).toBeGreaterThan(0);
      }

      // Verificar que hay al menos un IfcProject y un IfcSpace
      expect(reread).toContain('IFCPROJECT');
      expect(reread).toContain('IFCSPACE');
    } finally {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Tests adicionales del Compatibility Gate (validate8Criteria directamente)
// ---------------------------------------------------------------------------

describe('IFC Compatibility Gate', () => {
  test('Room sin levelId genera error (criterio 5)', () => {
    const room = new Room({
      id: revitObjectId('room-nolevel'),
      roomId: roomId('room-nolevel'),
      levelId: levelId(''),  // vacío
      geometry: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }],
      isOpen: false,
      isClosed: true,
    });

    const result = validate8Criteria(room, []);
    const levelError = result.entries.find((e) => e.criterion === 5);
    expect(levelError).toBeDefined();
    expect(levelError!.severity).toBe('error');
  });

  test('SiteCoordinateSystem ausente genera warning (criterio 6)', () => {
    const room = makeRoom();
    const result = validate8Criteria(room, [], { hasGeoreference: false });

    const siteWarning = result.entries.find((e) => e.criterion === 6);
    expect(siteWarning).toBeDefined();
    expect(siteWarning!.severity).toBe('warning');
    expect(result.valid).toBe(true); // warning, no error
  });

  test('objetos is_deleted se reportan como warning (criterio 7)', () => {
    const room = makeRoom();
    const deletedWall = makeWall('w-del', { x: 0, y: 0 }, { x: 1, y: 0 }, { is_deleted: true });

    const result = validate8Criteria(room, [deletedWall]);

    const deletedWarning = result.entries.find((e) => e.criterion === 7);
    expect(deletedWarning).toBeDefined();
    expect(deletedWarning!.severity).toBe('warning');
    expect(result.valid).toBe(true);
  });

  test('archivo no escribible genera error (criterio 8)', () => {
    const room = makeRoom();
    const result = validate8Criteria(room, [], { canWriteFile: false });

    const fileError = result.entries.find((e) => e.criterion === 8);
    expect(fileError).toBeDefined();
    expect(fileError!.severity).toBe('error');
    expect(result.valid).toBe(false);
  });
});
