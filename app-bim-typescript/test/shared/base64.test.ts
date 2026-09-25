// =============================================================================
// base64.test.ts — Decodificador Base64 → Uint8Array sin `Buffer`
// =============================================================================

import { base64ToUint8Array, uint8ArrayToBase64 } from '../../src/shared/encoding/base64';

function decodeWithNodeBuffer(base64: string): Uint8Array {
  // Usado SOLO como oráculo de referencia en el test (Node sí tiene Buffer);
  // el código de producción nunca debe depender de esto — ver el comentario
  // en src/shared/encoding/base64.ts.
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

describe('base64ToUint8Array', () => {
  it('decodifica una cadena simple igual que Buffer.from (oráculo de Node)', () => {
    const input = 'SGVsbG8sIFBvbHlMaXZlIQ=='; // "Hello, PolyLive!"
    const result = base64ToUint8Array(input);
    expect(Array.from(result)).toEqual(Array.from(decodeWithNodeBuffer(input)));
    expect(Buffer.from(result).toString('utf-8')).toBe('Hello, PolyLive!');
  });

  it('decodifica correctamente sin padding final', () => {
    const input = 'SGVsbG8'; // "Hello" sin '='
    const result = base64ToUint8Array(input);
    expect(Buffer.from(result).toString('utf-8')).toBe('Hello');
  });

  it('decodifica bytes binarios arbitrarios (no solo texto), igual que el oráculo', () => {
    const original = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64]);
    const asBase64 = Buffer.from(original).toString('base64');

    const result = base64ToUint8Array(asBase64);
    expect(Array.from(result)).toEqual(Array.from(original));
  });

  it('ignora saltos de línea y espacios embebidos', () => {
    const input = 'SGVs\nbG8s IFBv\r\nbHlMaXZlIQ==';
    const result = base64ToUint8Array(input);
    expect(Buffer.from(result).toString('utf-8')).toBe('Hello, PolyLive!');
  });

  it('retorna un array vacío para una cadena vacía', () => {
    expect(base64ToUint8Array('').length).toBe(0);
  });

  it('roundtrip con una foto JPEG simulada (payload grande, todos los valores de byte)', () => {
    const original = new Uint8Array(300);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;
    const asBase64 = Buffer.from(original).toString('base64');

    const result = base64ToUint8Array(asBase64);
    expect(Array.from(result)).toEqual(Array.from(original));
  });
});

describe('uint8ArrayToBase64', () => {
  it('codifica igual que Buffer.toString("base64") (oráculo de Node)', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111, 44, 32, 80, 111, 108, 121, 76, 105, 118, 101, 33]);
    expect(uint8ArrayToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'));
  });

  it('añade el padding correcto para longitudes no múltiplo de 3', () => {
    expect(uint8ArrayToBase64(new Uint8Array([72]))).toBe('SA==');
    expect(uint8ArrayToBase64(new Uint8Array([72, 105]))).toBe('SGk=');
    expect(uint8ArrayToBase64(new Uint8Array([72, 105, 33]))).toBe('SGkh');
  });

  it('retorna cadena vacía para un array vacío', () => {
    expect(uint8ArrayToBase64(new Uint8Array(0))).toBe('');
  });

  it('roundtrip encode→decode reproduce los bytes originales para un payload binario grande', () => {
    const original = new Uint8Array(500);
    for (let i = 0; i < original.length; i++) original[i] = (i * 37) % 256;

    const encoded = uint8ArrayToBase64(original);
    const decoded = base64ToUint8Array(encoded);

    expect(Array.from(decoded)).toEqual(Array.from(original));
    // Y coincide con el oráculo de Node en ambas direcciones.
    expect(encoded).toBe(Buffer.from(original).toString('base64'));
  });
});
