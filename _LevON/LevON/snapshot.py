import os
from pathlib import Path
from datetime import datetime

# =========================================================
# CONFIG
# =========================================================

ROOT_PATH = r"G:\My Drive\0. JDOP\Proyectos\LevON"

OUTPUT_MD = "project_tree.md"

MAX_DEPTH = 4

EXCLUDE_DIRS = {
    ".git",
    ".dart_tool",
    "build",
    ".idea",
    ".vscode",
    "node_modules",
    "android/build",
    "ios/build",
    "windows/flutter",
    "__pycache__"
}

EXCLUDE_EXTENSIONS = {
    ".exe",
    ".dll",
    ".sys",
    ".tmp",
    ".log",
    ".lock"
}

# Archivos importantes para IA
CRITICAL_FILES = {
    "context.md",
    "rules.md",
    "architecture.md",
    "current.md",
    "readme.md",
    "pubspec.yaml"
}

# Carpetas importantes
CRITICAL_DIRS = {
    "geometry",
    "topology",
    "persistence",
    "export",
    "ui",
    "application",
    "domain"
}


# =========================================================
# HELPERS
# =========================================================

def should_exclude(path: str) -> bool:
    path_lower = path.lower()

    return any(excluded in path_lower for excluded in EXCLUDE_DIRS)


def get_file_info(file_path: Path) -> dict:
    """
    Obtiene metadata útil para IA/contexto técnico.
    """

    try:
        stat = file_path.stat()

        size_kb = round(stat.st_size / 1024, 2)

        modified = datetime.fromtimestamp(
            stat.st_mtime
        ).strftime("%Y-%m-%d %H:%M")

        lines = 0

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                lines = sum(1 for _ in f)
        except Exception:
            pass

        return {
            "size_kb": size_kb,
            "modified": modified,
            "lines": lines
        }

    except Exception:
        return {
            "size_kb": 0,
            "modified": "unknown",
            "lines": 0
        }


def build_tree(base_path: Path) -> list:
    """
    Genera árbol navegable optimizado para IA.
    """

    output = []

    for root, dirs, files in os.walk(base_path):

        if should_exclude(root):
            continue

        relative_root = Path(root).relative_to(base_path)

        depth = len(relative_root.parts)

        if depth > MAX_DEPTH:
            continue

        indent = "    " * depth

        folder_name = relative_root.name if relative_root.name else base_path.name

        folder_marker = ""

        if folder_name.lower() in CRITICAL_DIRS:
            folder_marker = " [CRITICAL]"

        output.append(f"{indent}📁 {folder_name}/{folder_marker}")

        # Filtrar carpetas
        dirs[:] = [
            d for d in dirs
            if not should_exclude(d)
        ]

        for file in sorted(files):

            ext = Path(file).suffix.lower()

            if ext in EXCLUDE_EXTENSIONS:
                continue

            file_path = Path(root) / file

            info = get_file_info(file_path)

            file_marker = ""

            if file.lower() in CRITICAL_FILES:
                file_marker = " [SOURCE OF TRUTH]"

            elif info["lines"] > 800:
                file_marker = " [LARGE FILE]"

            relative_file = file_path.relative_to(base_path)

            output.append(
                f"{indent}    ├── {file}"
                f"{file_marker}"
                f" | lines: {info['lines']}"
                f" | modified: {info['modified']}"
            )

    return output


# =========================================================
# MAIN
# =========================================================

def main():

    base_path = Path(ROOT_PATH)

    if not base_path.exists():
        print("Ruta no encontrada.")
        return

    print("Generando índice IA del proyecto...")

    tree_lines = build_tree(base_path)

    with open(OUTPUT_MD, "w", encoding="utf-8") as f:

        f.write("# LevON Project Tree\n\n")
        f.write("> Índice optimizado para IA y auditoría técnica.\n\n")

        f.write("## Leyenda\n\n")
        f.write("- [SOURCE OF TRUTH] → archivos críticos\n")
        f.write("- [CRITICAL] → módulos importantes\n")
        f.write("- [LARGE FILE] → posibles candidatos a refactor\n\n")

        f.write("## Estructura\n\n")

        for line in tree_lines:
            f.write(line + "\n")

    print(f"Archivo generado: {OUTPUT_MD}")


if __name__ == "__main__":
    main()
