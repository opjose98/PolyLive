// =============================================================================
// projectPackageActions.ts — Exportar / importar el proyecto completo
// =============================================================================
//
// Exportar: el paquete `.polylive` (datos + fotos) a la carpeta que elija el
// usuario (Drive, Descargas…). Es también el RESPALDO FUERA DEL TELÉFONO: si
// el teléfono se pierde, el proyecto se abre en otro con "Importar".
// =============================================================================

import type { AppServices } from '../../application/AppServices';
import {
  PackageError,
  importProjectPackage,
  markPackaged,
  packageFilename,
  projectExists,
  readProjectPackage,
  unzipPackage,
  zipPackage,
} from '../../infrastructure/package/projectPackage';
import { saveBase64ToUserFolder } from '../../native/export/saveToUserFolder';
import { pickBinaryFile } from '../../native/files/pickBinaryFile';
import { uint8ArrayToBase64 } from '../../shared/encoding/base64';
import { diagnostics } from '../../shared/diagnostics';
import { alertDialog, toast } from '../primitives';
import { haptic } from '../design/haptics';
import { folderHint } from './folderHint';

export async function exportProjectPackage(services: AppServices, projectId: string, operator?: string): Promise<boolean> {
  try {
    toast('Preparando el paquete del proyecto…', { kind: 'info', durationMs: 1500 });
    const pkg = await readProjectPackage(services.db, projectId, operator);
    const zip = zipPackage(pkg);
    await folderHint();
    const saved = await saveBase64ToUserFolder(packageFilename(pkg.manifest), uint8ArrayToBase64(zip), 'application/octet-stream');
    if (!saved.ok) {
      if (saved.reason !== 'cancelled') toast(`No se pudo guardar el paquete${saved.detail ? `: ${saved.detail}` : ''}`, { kind: 'error' });
      return false;
    }
    await markPackaged(services.db, projectId);
    haptic.commit();
    const mb = (zip.length / 1024 / 1024).toFixed(1);
    toast(`Proyecto respaldado en ${saved.folderLabel} (${mb} MB, ${pkg.manifest.photos} foto(s))`, { kind: 'success' });
    diagnostics.info('package', `Paquete exportado: ${pkg.manifest.project.name}, ${mb} MB`);
    return true;
  } catch (err) {
    diagnostics.error('package', 'No se pudo exportar el paquete', err);
    toast('No se pudo exportar el proyecto.', { kind: 'error' });
    return false;
  }
}

/** Importa un `.polylive`; si el proyecto ya existe pide confirmación para reemplazarlo. Devuelve el id importado. */
export async function importProjectPackageFlow(services: AppServices): Promise<string | null> {
  try {
    const file = await pickBinaryFile();
    if (!file) return null;
    const pkg = unzipPackage(file.bytes);
    const { project } = pkg.manifest;
    if (await projectExists(services.db, project.id)) {
      const ok = await new Promise<boolean>((resolve) =>
        alertDialog(
          'Reemplazar proyecto',
          `"${project.name}" ya está en este equipo. Al importar se reemplaza por la versión del paquete (${new Date(pkg.manifest.exportedAt).toLocaleString()}). Lo hecho después en este equipo se pierde.`,
          [
            { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Reemplazar', style: 'destructive', onPress: () => resolve(true) },
          ],
        ),
      );
      if (!ok) return null;
    }
    const r = await importProjectPackage(services.db, pkg);
    haptic.commit();
    toast(`Proyecto "${project.name}" ${r.replaced ? 'reemplazado' : 'importado'} (${pkg.manifest.spaces} espacio(s), ${r.photos} foto(s))`, {
      kind: 'success',
    });
    diagnostics.info('package', `Paquete importado: ${project.name} (${r.rows} filas)`);
    return project.id;
  } catch (err) {
    diagnostics.error('package', 'No se pudo importar el paquete', err);
    toast(err instanceof PackageError ? err.message : 'No se pudo importar el archivo.', { kind: 'error' });
    return null;
  }
}

/** Texto del estado de respaldo externo ("hace 3 días", "nunca"). */
export function packagedLabel(at: Date | null, now = new Date()): string {
  if (!at) return 'Sin respaldo externo';
  const h = (now.getTime() - at.getTime()) / 3600000;
  if (h < 1) return 'Respaldado hace un momento';
  if (h < 24) return `Respaldado hace ${Math.floor(h)} h`;
  const d = Math.floor(h / 24);
  return `Respaldado hace ${d} día${d === 1 ? '' : 's'}`;
}
