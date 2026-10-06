// =============================================================================
// useSurveyMenu.ts — Menú ☰ del espacio y sus entregables
// =============================================================================
//
// Qué se puede sacar de un espacio: IFC para Revit, IFC y DXF del recinto,
// plano PDF con cuadro de áreas, cuadro de áreas en CSV, registro fotográfico
// y el paquete del proyecto (respaldo fuera del teléfono). Más la navegación
// del menú (galería, otros espacios, operador, ajustes).
// =============================================================================

import { useCallback, useMemo } from 'react';
import type { AppServices } from '../../application/AppServices';
import type { DetectedRoom, EditorController } from '../../application/editor/EditorController';
import { planSvg } from '../../application/report/planSvg';
import type { RoomId } from '../../domain/objects/base';
import { zoneCode } from '../../domain/objects/zone';
import type { MainMenuItem } from './MainMenu';
import { exportRevitIfc } from './exportActions';
import { areaRowsOf, exportAreaCsv, exportPhotoRegister, exportPlanSheet } from './deliverableActions';
import { exportProjectPackage } from './projectPackageActions';

export type MenuScreen = 'gallery' | 'export' | 'settings' | 'profile';

export interface SurveyMenuInput {
  readonly services: AppServices;
  readonly editor: EditorController;
  readonly rooms: readonly DetectedRoom[];
  readonly roomId: RoomId;
  readonly projectId?: string;
  readonly projectName: string;
  readonly projectCode: string;
  readonly spaceName: string;
  readonly levelName?: string;
  readonly operatorName: string;
  readonly onNavigate?: (screen: MenuScreen) => void;
  readonly onExit?: () => void;
  readonly onExitProject?: () => void;
  readonly onZoomFit: () => void;
}

export function useSurveyMenu(i: SurveyMenuInput): MainMenuItem[] {
  const { services, editor, rooms, roomId, projectId, projectName, projectCode, spaceName, levelName, operatorName, onNavigate, onExit, onExitProject, onZoomFit } = i;

  const handleExportIfc = useCallback(
    () => exportRevitIfc(services, { roomId, projectId, projectName, spaceName, author: operatorName }),
    [services, projectId, roomId, projectName, operatorName, spaceName],
  );
  const sheetMeta = useCallback(
    () => ({ project: projectName, projectCode, space: spaceName, level: levelName, operator: operatorName, generatedAt: new Date() }),
    [projectName, projectCode, spaceName, levelName, operatorName],
  );
  const areaRows = useCallback(() => areaRowsOf(rooms, levelName ?? ''), [rooms, levelName]);
  const handlePlanSheet = useCallback(
    () =>
      exportPlanSheet(
        sheetMeta(),
        planSvg({
          walls: editor.walls.map((w) => ({ start: w.startPoint, end: w.endPoint, thickness: w.thickness as number })),
          zones: rooms
            .filter((r) => (r.netPolygon?.length ?? 0) >= 3)
            .map((r) => ({
              polygon: r.netPolygon!,
              label: `${r.number !== undefined ? zoneCode({ number: r.number }) + ' ' : ''}${r.name ?? 'Recinto'}`,
              sublabel: `${(r.netArea ?? r.area).toFixed(2)} m²`,
              at: r.centroid,
            })),
          scaleBar: true,
        }),
        areaRows(),
      ),
    [sheetMeta, areaRows, editor, rooms],
  );
  const wallNameOf = useCallback(
    (id: string) => {
      const k = editor.walls.findIndex((w) => (w.id as string) === id);
      const w = editor.walls[k];
      return w ? ((w.properties.name as string | undefined) ?? `Muro ${k + 1}`) : 'Muro';
    },
    [editor],
  );

  return useMemo((): MainMenuItem[] => {
    const go = (s: MenuScreen) => () => onNavigate?.(s);
    return [
      { section: 'Espacio', icon: 'fit-to-screen-outline', label: 'Encuadrar todo', onPress: onZoomFit },
      { icon: 'image-multiple-outline', label: 'Galería de fotos', onPress: go('gallery') },
      ...(onExit ? [{ icon: 'view-grid-outline', label: 'Otros espacios del proyecto', onPress: onExit }] : []),
      { section: 'Exportar', icon: 'file-export-outline', label: 'IFC para Revit', detail: 'Pisos por nivel y restricciones', onPress: () => void handleExportIfc() },
      { icon: 'file-cad', label: 'IFC y DXF del recinto', onPress: go('export') },
      { icon: 'file-pdf-box', label: 'Plano PDF', detail: 'Rótulo, escala gráfica y cuadro de áreas', onPress: () => void handlePlanSheet() },
      { icon: 'table', label: 'Cuadro de áreas (CSV)', onPress: () => void exportAreaCsv(sheetMeta(), areaRows()) },
      { icon: 'camera-burst', label: 'Registro fotográfico (PDF)', detail: 'Fotos con fecha, autor, ubicación y sello', onPress: () => void exportPhotoRegister(services, roomId, sheetMeta(), wallNameOf) },
      ...(projectId
        ? [{ icon: 'package-variant-closed', label: 'Respaldar proyecto (.polylive)', detail: 'Proyecto completo con fotos, a Drive u otra carpeta', onPress: () => void exportProjectPackage(services, projectId, operatorName) }]
        : []),
      ...(onExitProject ? [{ section: 'Proyecto', icon: 'folder-outline', label: 'Cambiar de proyecto', onPress: onExitProject }] : []),
      { section: 'App', icon: 'account-circle-outline', label: 'Operador', detail: operatorName || undefined, onPress: go('profile') },
      { icon: 'cog-outline', label: 'Ajustes y respaldos', onPress: go('settings') },
    ];
  }, [onExit, onExitProject, onNavigate, onZoomFit, handleExportIfc, operatorName, handlePlanSheet, sheetMeta, areaRows, services, roomId, wallNameOf, projectId]);
}
