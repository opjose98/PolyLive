import os
import re

def normalize_imports(root_dir):
    for dirpath, _, filenames in os.walk(root_dir):
        for filename in filenames:
            if not filename.endswith('.dart'):
                continue
            
            filepath = os.path.join(dirpath, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Find all import 'relative/path.dart';
            # We want to exclude package: and dart:
            def replace_import(match):
                import_path = match.group(1)
                if import_path.startswith('package:') or import_path.startswith('dart:'):
                    return match.group(0)
                
                # Resolve the relative path
                # import_path is relative to the current file's directory
                # We need to find its path relative to root_dir (which is 'lib')
                current_file_dir = os.path.dirname(filepath)
                resolved_path = os.path.normpath(os.path.join(current_file_dir, import_path))
                
                # Now get the path relative to root_dir
                try:
                    rel_to_lib = os.path.relpath(resolved_path, root_dir)
                    # Convert to posix path
                    posix_path = rel_to_lib.replace(os.sep, '/')
                    return f"import 'package:levon/{posix_path}';"
                except ValueError:
                    return match.group(0)
                    
            new_content = re.sub(r"import\s+['\"](.*?)['\"];", replace_import, content)
            
            if new_content != content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"Updated imports in {filepath}")

if __name__ == "__main__":
    normalize_imports('lib')
    normalize_imports('test')
