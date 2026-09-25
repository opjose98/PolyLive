import os
import shutil

MOVES = {
    # 1. Root / Core
    "lib/geometry/math_utils.dart": "lib/core/math_utils.dart",
    "lib/geometry/constants.dart": "lib/core/constants.dart",
    "lib/utils/unit_service.dart": "lib/core/utils/unit_service.dart",
    "lib/utils/precision_service.dart": "lib/core/utils/precision_service.dart",
    
    # Geometry -> Core Geometry
    "lib/geometry/intersections.dart": "lib/core/geometry/intersections.dart",
    "lib/geometry/polygons.dart": "lib/core/geometry/polygons.dart",
    "lib/geometry/spatial/spatial_hash.dart": "lib/core/geometry/spatial/spatial_hash.dart",
    "lib/geometry/topology/topology_edge.dart": "lib/core/geometry/topology/topology_edge.dart",
    "lib/geometry/topology/topology_graph.dart": "lib/core/geometry/topology/topology_graph.dart",
    "lib/geometry/topology/topology_node.dart": "lib/core/geometry/topology/topology_node.dart",
    "lib/geometry/polygons/polygon_utils.dart": "lib/core/geometry/polygons/polygon_utils.dart",
    "lib/geometry/polygons/polygon_validator.dart": "lib/core/geometry/polygons/polygon_validator.dart",

    # Validators
    "lib/domain/validators/validation_pipeline.dart": "lib/core/validators/validation_pipeline.dart",
    "lib/application/use_cases/validate_geometry_use_case.dart": "lib/core/validators/validate_geometry_use_case.dart",

    # 2. BIM
    "lib/domain/services/bim_code_generator.dart": "lib/bim/services/bim_code_generator.dart",
    "lib/domain/services/photo_bim_code_generator.dart": "lib/bim/services/photo_bim_code_generator.dart",

    # 3. Features
    "lib/ui/editor/editor_controller.dart": "lib/features/editor/application/editor_controller.dart",
    "lib/ui/screens/editor_screen.dart": "lib/features/editor/ui/editor_screen.dart",
    "lib/ui/editor/static_layer_painter.dart": "lib/features/editor/ui/static_layer_painter.dart",
    "lib/ui/editor/preview_layer_painter.dart": "lib/features/editor/ui/preview_layer_painter.dart",
    "lib/ui/editor/preview_generator.dart": "lib/features/editor/application/preview_generator.dart",
    "lib/application/services/selection_service.dart": "lib/features/editor/application/selection_service.dart",

    "lib/domain/entities/wall.dart": "lib/features/walls/domain/wall.dart",
    "lib/domain/entities/wall_elevation.dart": "lib/features/walls/domain/wall_elevation.dart",
    "lib/domain/entities/column.dart": "lib/features/walls/domain/column.dart",
    "lib/application/services/wall_csl_service.dart": "lib/features/walls/application/wall_csl_service.dart",
    "lib/application/use_cases/create_wall_use_case.dart": "lib/features/walls/application/create_wall_use_case.dart",
    "lib/application/use_cases/wall_elevation/edit_wall_elevation_use_case.dart": "lib/features/walls/application/elevation/edit_wall_elevation_use_case.dart",
    "lib/ui/editor/wall_elevation_painter.dart": "lib/features/walls/ui/wall_elevation_painter.dart",
    "lib/ui/widgets/wall_elevation/wall_elevation_panel.dart": "lib/features/walls/ui/wall_elevation_panel.dart",

    "lib/domain/entities/door.dart": "lib/features/openings/domain/door.dart",
    "lib/domain/entities/window.dart": "lib/features/openings/domain/window.dart",

    "lib/domain/entities/room.dart": "lib/features/rooms/domain/room.dart",
    "lib/application/use_cases/create_room_use_case.dart": "lib/features/rooms/application/create_room_use_case.dart",
    "lib/application/use_cases/detect_rooms_use_case.dart": "lib/features/rooms/application/detect_rooms_use_case.dart",
    "lib/geometry/rooms/room_generator.dart": "lib/features/rooms/application/room_generator.dart",

    "lib/domain/entities/photo.dart": "lib/features/photos/domain/photo.dart",
    "lib/domain/entities/photo_collection.dart": "lib/features/photos/domain/photo_collection.dart",
    "lib/application/use_cases/photo/add_photo_to_collection_use_case.dart": "lib/features/photos/application/add_photo_to_collection_use_case.dart",
    "lib/application/use_cases/photo/remove_photo_use_case.dart": "lib/features/photos/application/remove_photo_use_case.dart",
    "lib/application/use_cases/attach_photo_use_case.dart": "lib/features/photos/application/attach_photo_use_case.dart",
    "lib/application/services/photo_metadata_service.dart": "lib/features/photos/application/photo_metadata_service.dart",
    "lib/application/services/photo_capture_service.dart": "lib/features/photos/application/photo_capture_service.dart",
    "lib/ui/screens/photo_collection_screen.dart": "lib/features/photos/ui/photo_collection_screen.dart",
    "lib/ui/widgets/photos/photo_card.dart": "lib/features/photos/ui/widgets/photo_card.dart",
    "lib/ui/widgets/photos/photo_properties_panel.dart": "lib/features/photos/ui/widgets/photo_properties_panel.dart",
    "lib/ui/widgets/photos/photo_viewer_dialog.dart": "lib/features/photos/ui/widgets/photo_viewer_dialog.dart",
    "lib/ui/widgets/photos/photo_overlay_stack.dart": "lib/features/photos/ui/widgets/photo_overlay_stack.dart",

    "lib/domain/entities/project.dart": "lib/features/projects/domain/project.dart",
    "lib/domain/entities/workspace_snapshot.dart": "lib/features/projects/domain/workspace_snapshot.dart",
    "lib/ui/screens/projects_screen.dart": "lib/features/projects/ui/projects_screen.dart",
    "lib/ui/screens/project_workspace_screen.dart": "lib/features/projects/ui/project_workspace_screen.dart",
    "lib/ui/widgets/projects/project_card.dart": "lib/features/projects/ui/widgets/project_card.dart",
    "lib/ui/widgets/projects/bim_project_dialog.dart": "lib/features/projects/ui/widgets/bim_project_dialog.dart",
    "lib/ui/widgets/projects/project_context_menu.dart": "lib/features/projects/ui/widgets/project_context_menu.dart",
    "lib/ui/widgets/spaces/space_preview_painter.dart": "lib/features/projects/ui/spaces/space_preview_painter.dart",
    "lib/ui/widgets/spaces/space_card.dart": "lib/features/projects/ui/spaces/space_card.dart",

    "lib/ui/editor/space_bounds.dart": "lib/features/viewport/space_bounds.dart",
    "lib/application/services/preview_cache_service.dart": "lib/features/viewport/preview_cache_service.dart",

    "lib/ui/widgets/settings/settings_content.dart": "lib/features/overlays/settings/settings_content.dart",
    "lib/ui/widgets/settings/settings_overlay.dart": "lib/features/overlays/settings/settings_overlay.dart",
    "lib/ui/widgets/settings/settings_widgets.dart": "lib/features/overlays/settings/settings_widgets.dart",
    "lib/ui/widgets/editor/contextual_ribbon.dart": "lib/features/overlays/contextual_ribbon.dart",
    "lib/ui/widgets/properties_panel.dart": "lib/features/overlays/properties_panel.dart",
    "lib/ui/editor/labels_layer_painter.dart": "lib/features/overlays/labels_layer_painter.dart",

    "lib/ui/state/providers.dart": "lib/shared/state/providers.dart",
    "lib/ui/state/history_notifier.dart": "lib/shared/state/history_notifier.dart",
    "lib/ui/state/project_settings.dart": "lib/shared/state/project_settings.dart",
    "lib/domain/entities/shapes.dart": "lib/shared/domain/shapes.dart",
    
    "lib/application/services/global_prefs_service.dart": "lib/core/config/global_prefs_service.dart"
}

def run():
    # Find generated files (.g.dart, .freezed.dart) next to old files if they didn't move
    # Since they use the same base name, we can check for them
    for src, dst in MOVES.items():
        base_src = src[:-5]
        base_dst = dst[:-5]
        
        g_dart_src = base_src + '.g.dart'
        g_dart_dst = base_dst + '.g.dart'
        if os.path.exists(g_dart_src):
            os.makedirs(os.path.dirname(g_dart_dst), exist_ok=True)
            shutil.move(g_dart_src, g_dart_dst)
            print(f"Moved {g_dart_src} to {g_dart_dst}")
            
        freezed_src = base_src + '.freezed.dart'
        freezed_dst = base_dst + '.freezed.dart'
        if os.path.exists(freezed_src):
            os.makedirs(os.path.dirname(freezed_dst), exist_ok=True)
            shutil.move(freezed_src, freezed_dst)
            print(f"Moved {freezed_src} to {freezed_dst}")

    # Update double quotes and missing quotes
    import_replacements = {}
    for src, dst in MOVES.items():
        src_pkg = src.replace("lib/", "package:levon/")
        dst_pkg = dst.replace("lib/", "package:levon/")
        import_replacements[src_pkg] = dst_pkg

    for root_dir in ['lib', 'test']:
        if not os.path.exists(root_dir): continue
        for dirpath, _, filenames in os.walk(root_dir):
            for filename in filenames:
                if not filename.endswith('.dart'): continue
                filepath = os.path.join(dirpath, filename)
                with open(filepath, 'r', encoding='utf-8') as f:
                    content = f.read()

                new_content = content
                for src_pkg, dst_pkg in import_replacements.items():
                    new_content = new_content.replace(f'"{src_pkg}"', f'"{dst_pkg}"')
                    new_content = new_content.replace(f"'{src_pkg}'", f"'{dst_pkg}'") # re-run just in case

                if new_content != content:
                    with open(filepath, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"Updated imports in {filepath}")

    # Remove empty dirs
    for dirpath, dirnames, filenames in os.walk('lib', topdown=False):
        if not dirnames and not filenames:
            try:
                os.rmdir(dirpath)
            except:
                pass

if __name__ == "__main__":
    run()
