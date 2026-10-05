// =============================================================================
// ValidationService.test.ts — Implementación de producción de IValidationService
// =============================================================================

import { ValidationService } from '../../src/infrastructure/validation/ValidationService';
import { meters } from '../../src/domain/geometry/types';

describe('ValidationService', () => {
  const service = new ValidationService();

  describe('validateWall', () => {
    it('acepta un muro normal dentro de rangos típicos', () => {
      const result = service.validateWall({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(2.8),
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('rechaza un muro con startPoint === endPoint (longitud cero)', () => {
      const result = service.validateWall({
        startPoint: { x: 1, y: 1 },
        endPoint: { x: 1, y: 1 },
        thickness: meters(0.15),
        height: meters(2.8),
      });
      expect(result.valid).toBe(false);
      expect(result.warnings[0].message).toContain('longitud cero');
    });

    it('rechaza espesor <= 0', () => {
      const result = service.validateWall({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0),
        height: meters(2.8),
      });
      expect(result.valid).toBe(false);
    });

    it('acepta pero advierte sobre espesor fuera del rango típico (0.1–1.0m)', () => {
      const result = service.validateWall({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(1.5),
        height: meters(2.8),
      });
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('inusual');
    });

    it('rechaza altura <= 0', () => {
      const result = service.validateWall({
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 5, y: 0 },
        thickness: meters(0.15),
        height: meters(0),
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateColumn', () => {
    it('acepta una columna con diámetro y altura positivos', () => {
      const result = service.validateColumn({ diameter: meters(0.3), height: meters(3) });
      expect(result.valid).toBe(true);
    });

    it('rechaza diámetro <= 0', () => {
      const result = service.validateColumn({ diameter: meters(0), height: meters(3) });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDoor / validateWindow', () => {
    it('acepta una puerta con ancho/alto positivos y sin contexto de muros', () => {
      const result = service.validateDoor({
        width: meters(0.9),
        height: meters(2.1),
        offsetAlongWall: meters(1),
      });
      expect(result.valid).toBe(true);
    });

    it('rechaza offsetAlongWall negativo', () => {
      const result = service.validateDoor({
        width: meters(0.9),
        height: meters(2.1),
        offsetAlongWall: meters(-1),
      });
      expect(result.valid).toBe(false);
    });

    it('advierte (sin bloquear) cuando la puerta se sale del muro padre', () => {
      const result = service.validateDoor(
        { id: 'door-1', parentWallId: 'wall-1', width: meters(2), height: meters(2.1), offsetAlongWall: meters(4) },
        { walls: [{ id: 'wall-1', length: 5 }] },
      );
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain('más allá del muro');
    });

    it('no advierte cuando la ventana cabe dentro del muro padre', () => {
      const result = service.validateWindow(
        { id: 'win-1', parentWallId: 'wall-1', width: meters(1.2), height: meters(1.2), offsetAlongWall: meters(1) },
        { walls: [{ id: 'wall-1', length: 5 }] },
      );
      expect(result.valid).toBe(true);
      expect(result.warnings).toEqual([]);
    });
  });

  describe('validateRoom', () => {
    it('rechaza un Recinto con menos de 3 vértices', () => {
      const result = service.validateRoom({ geometry: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateExport', () => {
    it('rechaza exportar un Recinto abierto', () => {
      const result = service.validateExport({ isOpen: true, isClosed: false, area: null });
      expect(result.valid).toBe(false);
    });

    it('rechaza exportar un Recinto cerrado sin área calculada', () => {
      const result = service.validateExport({ isOpen: false, isClosed: true, area: null });
      expect(result.valid).toBe(false);
    });

    it('acepta exportar un Recinto cerrado con área', () => {
      const result = service.validateExport({ isOpen: false, isClosed: true, area: 12.5 });
      expect(result.valid).toBe(true);
    });
  });
});
