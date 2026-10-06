import { sealPhoto, verifySeal } from '../../src/domain/evidence/seal';
import { CapturePhotoUseCase } from '../../src/application/use-cases/CapturePhotoUseCase';
import { Database } from '../../src/infrastructure/sqlite/database';
import { createAppServices } from '../../src/application/AppServices';
import { roomId } from '../../src/domain/objects/base';
import { photoRegisterHtml } from '../../src/application/report/deliverables';

describe('Sello de evidencia de fotos', () => {
  const img = new Uint8Array([255, 216, 10, 20, 30]);
  const f = { bimCode: 'FOT001', operator: 'Jose', timestamp: 1759780000000, geo: { latitude: 4.6, longitude: -74.08, accuracyMeters: 5 } };

  it('el SHA-256 de la imagen es el estándar y el sello verifica', () => {
    const s = sealPhoto(new Uint8Array([]), { timestamp: 0 });
    expect(s.imageSha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    const seal = sealPhoto(img, f);
    expect(verifySeal(img, f, seal)).toBe(true);
  });

  it('cambiar un byte de la imagen o un dato (operador, fecha) rompe el sello', () => {
    const seal = sealPhoto(img, f);
    expect(verifySeal(new Uint8Array([255, 216, 10, 20, 31]), f, seal)).toBe(false);
    expect(verifySeal(img, { ...f, operator: 'Otro' }, seal)).toBe(false);
    expect(verifySeal(img, { ...f, timestamp: f.timestamp + 1 }, seal)).toBe(false);
  });

  it('cada foto capturada queda sellada con su autor', async () => {
    const db = new Database(':memory:');
    await db.open();
    await db.migrate();
    const services = createAppServices(db);
    const uc = services.useCases.capturePhoto as CapturePhotoUseCase;
    const r = await uc.execute({ roomId: roomId('r'), photoData: img, filename: 'a.jpg', metadata: { bimCode: 'FOT001', operator: 'Jose' } });
    const p = (await services.store.readAuditPhoto(r.photoId))!;
    const md = p.metadata;
    expect(md.seal?.sealedBy).toBe('Jose');
    expect(verifySeal(p.foto!, { bimCode: md.bimCode, operator: md.operator, timestamp: md.timestamp }, md.seal!)).toBe(true);
    await db.close();
  });

  it('el registro fotográfico muestra el sello y marca una foto alterada', () => {
    const meta = { project: 'P', space: 'E', operator: 'Jose', generatedAt: new Date() };
    const html = photoRegisterHtml(meta, [
      { code: 'A', takenAt: new Date(), author: 'Jose', where: 'x', notes: '', dataUri: null, seal: { hash: 'abc123', intact: true } },
      { code: 'B', takenAt: new Date(), author: 'Jose', where: 'x', notes: '', dataUri: null, seal: { hash: 'def456', intact: false } },
    ]);
    expect(html).toContain('Sello SHA-256 abc123');
    expect(html).toContain('ALTERADA');
  });
});
