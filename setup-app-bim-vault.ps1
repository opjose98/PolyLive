# Script: setup-app-bim-vault.ps1
# Propósito: Crear la estructura de carpetas para la bóveda Obsidian del App BIM
# Uso: En PowerShell (como Admin si es necesario): . .\setup-app-bim-vault.ps1

# Configuración
$vaultPath = "C:\Vaults\app-levantamientos-bim"
$folders = @(
    "00-Introducción",
    "01-Dominio\geometría",
    "01-Dominio\objetos-bim",
    "01-Dominio\validación",
    "02-Aplicación\use-cases",
    "02-Aplicación\comandos",
    "02-Aplicación\máquina-estados",
    "03-Infraestructura\sqlite",
    "03-Infraestructura\ble",
    "03-Infraestructura\export-ifc",
    "03-Infraestructura\filesystem",
    "04-UI-UX\arquitectura",
    "04-UI-UX\wireframes",
    "04-UI-UX\decisiones-36",
    "04-UI-UX\temas",
    "05-Testing\unit",
    "05-Testing\integration",
    "05-Testing\recovery",
    "05-Testing\field",
    "05-Testing\fixtures",
    "06-Referencias-Cruzadas",
    "07-Código-Generado",
    "_plantillas",
    "_grafo-dependencias"
)

# Crear carpeta raíz si no existe
if (-not (Test-Path $vaultPath)) {
    New-Item -ItemType Directory -Path $vaultPath -Force | Out-Null
    Write-Host "✅ Carpeta raíz creada: $vaultPath"
} else {
    Write-Host "✅ Carpeta raíz ya existe: $vaultPath"
}

# Crear todas las subcarpetas
foreach ($folder in $folders) {
    $folderPath = Join-Path -Path $vaultPath -ChildPath $folder
    if (-not (Test-Path $folderPath)) {
        New-Item -ItemType Directory -Path $folderPath -Force | Out-Null
        Write-Host "📁 Creada: $folder"
    } else {
        Write-Host "⏭️  Ya existe: $folder"
    }
}

# Crear un archivo .gitkeep en cada carpeta para que Git las rastree
foreach ($folder in $folders) {
    $folderPath = Join-Path -Path $vaultPath -ChildPath $folder
    $gitkeepPath = Join-Path -Path $folderPath -ChildPath ".gitkeep"
    if (-not (Test-Path $gitkeepPath)) {
        "" | Out-File -FilePath $gitkeepPath -Encoding UTF8
    }
}

# Crear un archivo README inicial
$readmePath = Join-Path -Path $vaultPath -ChildPath "README.md"
$readmeContent = @"
# App de Levantamientos BIM — Bóveda Obsidian

**Sistema:** Claude-Obsidian (caso de prueba viviente)
**Proyecto:** App de levantamientos y topografía, React Native + TypeScript
**Fecha de creación:** 2026-09-14
**Estado:** Fase 0 — Estructura inicial

## Cómo usar esta bóveda

1. Abre esta carpeta en Obsidian como una bóveda nueva
2. Explora el grafo (gráfico de dependencias) en el panel derecho
3. Las notas están organizadas por capa arquitectónica (01-Dominio, 02-Aplicación, etc.)
4. Cada nota tiene backlinks a otras — úsalos para navegar

## Fase actual

- **Fase 0:** Estructura de carpetas (EN PROGRESO)
- **Fase 1:** Fragmentación en notas atómicas (~100-120 notas)
- **Fase 2:** Generación de spike #1 (CDT + Geometría) desde Claude
- **Fase 3:** Iteración y refinamiento de spikes #2-#5

## Proximos pasos

- [ ] Instalar plugins esenciales (Extended Graph, Dataview, Templater)
- [ ] Completar fragmentación de los 15 documentos originales
- [ ] Verificar grafo: no hay notas "huérfanas"
- [ ] Hacer primera generación de código (spike #1)

## Referencia

- Documentos originales: `/mnt/user-data/uploads/` (15 archivos .md)
- Especificación técnica: `Maestro Técnico v2.1` (app-levantamientos-bim-documento-maestro-v2_1-SUBSANADO.md)
- Plan de implementación: `/projects/01a05fcd-c120-72fc-9949-497405844517/areas/plan-dos-proyectos-simultaneos.md`
"@

$readmeContent | Out-File -FilePath $readmePath -Encoding UTF8 -Force
Write-Host "📝 README creado: $readmePath"

Write-Host ""
Write-Host "✨ ¡Bóveda estructura lista!"
Write-Host "📂 Ruta: $vaultPath"
Write-Host "🚀 Próximo paso: Abre esta carpeta en Obsidian como bóveda nueva"
