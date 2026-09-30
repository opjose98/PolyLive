import { exportFilename } from '../../src/ui/workspace/exportActions';
import { roomId } from '../../src/domain/objects/base';

jest.mock('../../src/native/export/saveToUserFolder', () => ({ saveTextToUserFolder: jest.fn() }));
jest.mock('../../src/ui/primitives', () => ({ toast: jest.fn() }));
jest.mock('../../src/ui/design/haptics', () => ({ haptic: { commit: jest.fn() } }));

describe('exportFilename', () => {
  it('usa proyecto, espacio y hora local, sin acentos ni símbolos', () => {
    const name = exportFilename(
      { roomId: roomId('r'), projectName: 'Edificio Ñuñoa', spaceName: 'Sala 1 / Norte' },
      'ifc',
      new Date(2026, 8, 29, 19, 5),
    );
    expect(name).toBe('Edificio-Nunoa-Sala-1-Norte-20260929-1905.ifc');
  });
});
