import 'dart:io';
import 'dart:math' as math;
import 'package:uuid/uuid.dart';

import 'package:levon/features/projects/domain/project.dart';
import 'package:levon/shared/domain/shapes.dart';

/// Genera archivos IFC4 (.ifc) STEP válidos desde un [Project] de LevON.
///
/// BUGS CORREGIDOS en esta versión:
///
/// 1. TIPO INCORRECTO en IfcLocalPlacement:
///    Antes: IFCLOCALPLACEMENT(#axis2Placement3dId, ...)
///    El primer argumento (PlacementRelTo) debe ser IfcObjectPlacement
///    (otro IfcLocalPlacement), NO un IfcAxis2Placement3D.
///    → Todos los muros aparecían en (0,0,0) porque los viewers ignoraban el placement.
///
/// 2. DIRECCIÓN DEL MURO FIJA:
///    Antes: X-axis siempre (1,0,0) para todos los muros.
///    Ahora: se calcula el vector dirección real de cada muro.
///
/// 3. PERFIL MAL CENTRADO:
///    Antes: profile en (0,0) → mitad del muro extendida en -X desde startPoint.
///    Ahora: profile en (length/2, 0) → muro va de 0 a length en eje local X.
///
/// 4. SÓLIDO CON PLACEMENT GLOBAL:
///    Antes: IfcExtrudedAreaSolid usaba el axis placement del world origin.
///    Ahora: cada muro crea su propio local axis placement para el sólido.
class IfcExporter {
  int _exportPrecision = 4;

  Future<void> exportToIfc(
    Project project,
    String exportPath, {
    int exportPrecision = 4,
  }) async {
    _exportPrecision = exportPrecision;
    final sb = StringBuffer();
    int id = 1;

    sb.writeln('ISO-10303-21;');
    sb.writeln('HEADER;');
    sb.writeln("FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'), '2;1');");
    sb.writeln(
        "FILE_NAME('${_esc(project.title)}','${DateTime.now().toIso8601String()}',('LevON User'),('LevON Architecture'),'LevON BIM Engine','LevON','');");
    sb.writeln("FILE_SCHEMA(('IFC4'));");
    sb.writeln('ENDSEC;');
    sb.writeln('DATA;');

    // ── Organización ─────────────────────────────────────────────────────────
    final orgId = id++;
    sb.writeln("#$orgId= IFCORGANIZATION(\$,'LevON',\$,\$,\$);");

    final personId = id++;
    sb.writeln("#$personId= IFCPERSON(\$,'User','LevON',\$,\$,\$,\$,\$);");

    final pAndOrgId = id++;
    sb.writeln("#$pAndOrgId= IFCPERSONANDORGANIZATION(#$personId,#$orgId,\$);");

    final epoch = DateTime.now().millisecondsSinceEpoch ~/ 1000;
    final ownerHistId = id++;
    sb.writeln(
        "#$ownerHistId= IFCOWNERHISTORY(#$pAndOrgId,#$orgId,\$,.ADDED.,\$,#$pAndOrgId,#$pAndOrgId,$epoch);");

    // ── Unidades ──────────────────────────────────────────────────────────────
    final lenUnitId = id++;
    sb.writeln("#$lenUnitId= IFCSIUNIT(*,.LENGTHUNIT.,\$,.METRE.);");

    final areaUnitId = id++;
    sb.writeln("#$areaUnitId= IFCSIUNIT(*,.AREAUNIT.,\$,.SQUARE_METRE.);");

    final volUnitId = id++;
    sb.writeln("#$volUnitId= IFCSIUNIT(*,.VOLUMEUNIT.,\$,.CUBIC_METRE.);");

    final unitAssignId = id++;
    sb.writeln(
        "#$unitAssignId= IFCUNITASSIGNMENT((#$lenUnitId,#$areaUnitId,#$volUnitId));");

    // ── Sistema de coordenadas global ─────────────────────────────────────────
    // Todos los ejes globales compartidos (dirección Z y X del world)
    final worldOriginId = id++;
    sb.writeln("#$worldOriginId= IFCCARTESIANPOINT((0.,0.,0.));");

    final worldZId = id++;
    sb.writeln("#$worldZId= IFCDIRECTION((0.,0.,1.));");

    final worldXId = id++;
    sb.writeln("#$worldXId= IFCDIRECTION((1.,0.,0.));");

    // Placement 3D del world: origen (0,0,0), Z arriba, X derecha
    final worldAxis3dId = id++;
    sb.writeln(
        "#$worldAxis3dId= IFCAXIS2PLACEMENT3D(#$worldOriginId,#$worldZId,#$worldXId);");

    // LocalPlacement raíz del site: sin PlacementRelTo ($) = coordenadas mundiales
    final sitePlacementId = id++;
    sb.writeln(
        "#$sitePlacementId= IFCLOCALPLACEMENT(\$,#$worldAxis3dId);");

    // ── Contexto geométrico ───────────────────────────────────────────────────
    final geomCtxId = id++;
    sb.writeln(
        "#$geomCtxId= IFCGEOMETRICREPRESENTATIONCONTEXT(\$,'Model',3,1.E-5,#$worldAxis3dId,\$);");

    // ── Proyecto ──────────────────────────────────────────────────────────────
    final projectId = id++;
    sb.writeln(
        "#$projectId= IFCPROJECT('${_guid()}',#$ownerHistId,'${_esc(project.title)}',\$,\$,\$,\$,(#$geomCtxId),#$unitAssignId);");

    // ── Jerarquía espacial ────────────────────────────────────────────────────
    final siteId = id++;
    sb.writeln(
        "#$siteId= IFCSITE('${_guid()}',#$ownerHistId,'Default Site',\$,\$,#$sitePlacementId,\$,\$,.ELEMENT.,(0,0,0),(0,0,0),0.,\$,\$);");

    // Building placement: relativo al site placement
    final bldgAxis3dId = id++;
    sb.writeln(
        "#$bldgAxis3dId= IFCAXIS2PLACEMENT3D(#$worldOriginId,#$worldZId,#$worldXId);");
    final bldgPlacementId = id++;
    sb.writeln(
        "#$bldgPlacementId= IFCLOCALPLACEMENT(#$sitePlacementId,#$bldgAxis3dId);");

    final bldgId = id++;
    sb.writeln(
        "#$bldgId= IFCBUILDING('${_guid()}',#$ownerHistId,'Default Building',\$,\$,#$bldgPlacementId,\$,\$,.ELEMENT.,\$,\$,\$);");

    // Storey placement: relativo al building placement
    final storeyAxis3dId = id++;
    sb.writeln(
        "#$storeyAxis3dId= IFCAXIS2PLACEMENT3D(#$worldOriginId,#$worldZId,#$worldXId);");
    final storeyPlacementId = id++;
    sb.writeln(
        "#$storeyPlacementId= IFCLOCALPLACEMENT(#$bldgPlacementId,#$storeyAxis3dId);");

    final storeyId = id++;
    sb.writeln(
        "#$storeyId= IFCBUILDINGSTOREY('${_guid()}',#$ownerHistId,'Ground Floor',\$,\$,#$storeyPlacementId,\$,\$,.ELEMENT.,0.);");

    // ── Relaciones de agregación ───────────────────────────────────────────────
    final relProjSiteId = id++;
    sb.writeln(
        "#$relProjSiteId= IFCRELAGGREGATES('${_guid()}',#$ownerHistId,'Project-Site','',#$projectId,(#$siteId));");

    final relSiteBldgId = id++;
    sb.writeln(
        "#$relSiteBldgId= IFCRELAGGREGATES('${_guid()}',#$ownerHistId,'Site-Building','',#$siteId,(#$bldgId));");

    final relBldgStoreyId = id++;
    sb.writeln(
        "#$relBldgStoreyId= IFCRELAGGREGATES('${_guid()}',#$ownerHistId,'Building-Storey','',#$bldgId,(#$storeyId));");

    // ── Muros ─────────────────────────────────────────────────────────────────
    final wallIds = <int>[];

    for (final wall in project.walls) {
      final geom = wall.geometry;
      if (geom is! LineShape) continue; // solo muros rectos en esta versión

      final startX = geom.start.x;
      final startY = geom.start.y;
      final dx = geom.end.x - startX;
      final dy = geom.end.y - startY;
      final len = math.sqrt(dx * dx + dy * dy);
      if (len < 1e-9) continue; // muro degenerado

      // Vector dirección normalizado del muro (eje X local)
      final dirX = dx / len;
      final dirY = dy / len;

      // ── Placement del muro ────────────────────────────────────────────────
      // Origen: punto de inicio del muro en coordenadas mundiales
      final wallOriginId = id++;
      sb.writeln(
          "#$wallOriginId= IFCCARTESIANPOINT((${ _p(startX)},${ _p(startY)},0.));");

      // X-axis: dirección real del muro
      final wallXDirId = id++;
      sb.writeln(
          "#$wallXDirId= IFCDIRECTION((${ _p(dirX)},${ _p(dirY)},0.));");

      // Axis3D del muro: origen en startPoint, X a lo largo del muro, Z arriba
      final wallAxis3dId = id++;
      sb.writeln(
          "#$wallAxis3dId= IFCAXIS2PLACEMENT3D(#$wallOriginId,#$worldZId,#$wallXDirId);");

      // LocalPlacement del muro: relativo al storey (NO al worldAxis3d raw)
      final wallLocalPlacementId = id++;
      sb.writeln(
          "#$wallLocalPlacementId= IFCLOCALPLACEMENT(#$storeyPlacementId,#$wallAxis3dId);");

      // ── Geometría del muro ────────────────────────────────────────────────
      // El perfil rectangular está en el plano XY local del muro.
      // Centrado en (length/2, 0) → el muro va de 0 a length en X local.
      final profileOriginId = id++;
      sb.writeln(
          "#$profileOriginId= IFCCARTESIANPOINT((${ _p(len / 2)},0.));");

      final profilePlacementId = id++;
      sb.writeln(
          "#$profilePlacementId= IFCAXIS2PLACEMENT2D(#$profileOriginId,\$);");

      final profileId = id++;
      sb.writeln(
          "#$profileId= IFCRECTANGLEPROFILEDEF(.AREA.,'WallProfile',#$profilePlacementId,${ _p(len)},${ _p(wall.thickness)});");

      // Placement del sólido en coordenadas LOCALES del muro (origen local = (0,0,0))
      final solidOriginId = id++;
      sb.writeln("#$solidOriginId= IFCCARTESIANPOINT((0.,0.,0.));");

      final solidAxisId = id++;
      sb.writeln(
          "#$solidAxisId= IFCAXIS2PLACEMENT3D(#$solidOriginId,#$worldZId,#$worldXId);");

      // Extrusión en dirección Z local (= Z global para muros horizontales)
      final solidId = id++;
      sb.writeln(
          "#$solidId= IFCEXTRUDEDAREASOLID(#$profileId,#$solidAxisId,#$worldZId,${ _p(wall.height)});");

      final shapeRepId = id++;
      sb.writeln(
          "#$shapeRepId= IFCSHAPEREPRESENTATION(#$geomCtxId,'Body','SweptSolid',(#$solidId));");

      final prodDefId = id++;
      sb.writeln(
          "#$prodDefId= IFCPRODUCTDEFINITIONSHAPE(\$,\$,(#$shapeRepId));");

      final wallId = id++;
      final wallType = wall.isStructural ? 'IFCWALLSTANDARDCASE' : 'IFCWALL';
      sb.writeln(
          "#$wallId= $wallType('${_stableGuid(wall.id)}',#$ownerHistId,'${ _esc(wall.material)} Wall',\$,\$,#$wallLocalPlacementId,#$prodDefId,\$);");

      wallIds.add(wallId);
    }

    if (wallIds.isNotEmpty) {
      final wallListStr = wallIds.map((i) => '#$i').join(',');
      final relId = id++;
      sb.writeln(
          "#$relId= IFCRELCONTAINEDINSPATIALSTRUCTURE('${_guid()}',#$ownerHistId,'Storey-Walls','',($wallListStr),#$storeyId);");
    }

    sb.writeln('ENDSEC;');
    sb.writeln('END-ISO-10303-21;');

    await File(exportPath).writeAsString(sb.toString());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String _p(double v) =>
      v.isFinite ? v.toStringAsFixed(_exportPrecision) : '0.${'0' * _exportPrecision}';

  String _esc(String s) => s.replaceAll("'", "''");

  /// GUID IFC-compatible de 22 caracteres derivado deterministicamente de [uuid].
  ///
  /// Garantiza estabilidad entre exportaciones: el mismo wall.id siempre produce
  /// el mismo GUID IFC, lo que permite referencias cruzadas en Revit/BIM.
  String _stableGuid(String uuid) {
    final hex = uuid.replaceAll('-', '');
    return _encodeGuid(hex);
  }

  /// GUID IFC-compatible de 22 caracteres aleatorio (para entidades sin ID estable).
  String _guid() {
    final hex = const Uuid().v4().replaceAll('-', '');
    return _encodeGuid(hex);
  }

  String _encodeGuid(String hex) {
    const chars =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_\$';
    final bytes = <int>[];
    for (int i = 0; i < hex.length; i += 2) {
      bytes.add(int.parse(hex.substring(i, i + 2), radix: 16));
    }
    final sb = StringBuffer();
    for (int i = 0; i < 16 && sb.length < 22; i++) {
      final v = bytes[i];
      sb.write(chars[v % chars.length]);
      if (sb.length < 22) sb.write(chars[(v ~/ chars.length) % chars.length]);
    }
    return sb.toString().substring(0, 22);
  }
}
