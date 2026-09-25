// =============================================================================
// PermissionsManager.test.ts — Solicitud unificada de permisos
// =============================================================================
//
// No existía ningún test para esta clase (gap preexistente, encontrado al
// diagnosticar por qué la app se quedaba congelada en "Iniciando PolyLive").
// El foco de esta suite es requestAll(): GAP CORREGIDO — antes usaba
// `Promise.all([...])` para disparar las tres solicitudes nativas de permiso
// a la vez. Android solo procesa una solicitud de permiso a la vez por
// Activity; una segunda llamada nativa concurrente puede dejar la primera
// sin resolver NUNCA, colgando la app entera (ver App.tsx, que solo marca
// `permissionsReady = true` después de que requestAll() resuelva o lance).
// =============================================================================

import { PermissionsManager, createPermissionsManager } from '../../../src/native/permissions/PermissionsManager';

describe('PermissionsManager', () => {
  describe('requestAll — secuencial, no concurrente', () => {
    it('espera a que cada solicitud termine antes de empezar la siguiente', async () => {
      const manager = new PermissionsManager();
      const events: string[] = [];

      // Cada mock registra su propio inicio y fin, con un microtask de por
      // medio (Promise.resolve().then(...)) para que, si requestAll() las
      // disparara en paralelo (Promise.all, el bug original), los tres
      // "start" aparecerían consecutivos ANTES que cualquier "end".
      jest.spyOn(manager, 'requestCamera').mockImplementation(async () => {
        events.push('camera:start');
        await Promise.resolve();
        events.push('camera:end');
        return { type: 'camera', status: 'granted', canAskAgain: true };
      });
      jest.spyOn(manager, 'requestLocation').mockImplementation(async () => {
        events.push('location:start');
        await Promise.resolve();
        events.push('location:end');
        return { type: 'location', status: 'granted', canAskAgain: true };
      });
      jest.spyOn(manager, 'requestBluetooth').mockImplementation(async () => {
        events.push('bluetooth:start');
        await Promise.resolve();
        events.push('bluetooth:end');
        return { type: 'bluetooth', status: 'granted', canAskAgain: true };
      });

      await manager.requestAll();

      // Secuencial: cada "end" ocurre antes del siguiente "start". Si fuera
      // Promise.all (el bug original), veríamos los tres "start" seguidos
      // antes de cualquier "end".
      expect(events).toEqual([
        'camera:start',
        'camera:end',
        'location:start',
        'location:end',
        'bluetooth:start',
        'bluetooth:end',
      ]);
    });

    it('combina los tres estados resultantes correctamente', async () => {
      const manager = new PermissionsManager();
      jest.spyOn(manager, 'requestCamera').mockResolvedValue({ type: 'camera', status: 'granted', canAskAgain: true });
      jest.spyOn(manager, 'requestLocation').mockResolvedValue({ type: 'location', status: 'denied', canAskAgain: true });
      jest.spyOn(manager, 'requestBluetooth').mockResolvedValue({ type: 'bluetooth', status: 'undetermined', canAskAgain: true });

      const result = await manager.requestAll();

      expect(result).toEqual({ camera: 'granted', location: 'denied', bluetooth: 'undetermined' });
    });

    it('no se cuelga si una solicitud individual lanza — el error se propaga, no queda pendiente para siempre', async () => {
      const manager = new PermissionsManager();
      jest.spyOn(manager, 'requestCamera').mockRejectedValue(new Error('camera permission API unavailable'));
      jest.spyOn(manager, 'requestLocation').mockResolvedValue({ type: 'location', status: 'granted', canAskAgain: true });
      jest.spyOn(manager, 'requestBluetooth').mockResolvedValue({ type: 'bluetooth', status: 'granted', canAskAgain: true });

      await expect(manager.requestAll()).rejects.toThrow('camera permission API unavailable');
    });
  });

  describe('createPermissionsManager factory', () => {
    it('crea una instancia de PermissionsManager', () => {
      expect(createPermissionsManager()).toBeInstanceOf(PermissionsManager);
    });
  });

  describe('checkBluetooth en Android 12+ (Platform.Version = 33 en el mock)', () => {
    it('retorna granted cuando BLUETOOTH_SCAN y BLUETOOTH_CONNECT ya están concedidos', async () => {
      const manager = new PermissionsManager();
      const status = await manager.checkBluetooth();
      // El mock de PermissionsAndroid.check() (test/__mocks__/react-native.ts) resuelve
      // `true` para ambos permisos por defecto.
      expect(status).toBe('granted');
    });
  });
});
