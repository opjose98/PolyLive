# PolyLive — reglas del repositorio

El proyecto manda sobre cualquier skill o plugin: invoca solo la skill que pide la tarea en curso.
Sin ADR ni specs propias; el plan vive en `docs/23`, la documentación en `docs/NN`, la matriz
(`docs/25`) y la bóveda (`_0bsidian/`).

## Estructura

- `app-bim-typescript/` — app activa: Expo SDK 57, RN 0.86 (nueva arquitectura), Skia 2, Reanimated 4, SQLite.
  - `src/domain` (sin UI ni módulos nativos) · `src/application` · `src/infrastructure` · `src/native` · `src/ui` · `src/shared` · `src/state`
  - `test/` (jest) · `scripts/validate_exports.py` (ifcopenshell + ezdxf) · `scripts/qa/adb.sh` (ayudantes de adb)
- `_0bsidian/` — bóveda: cada nota enlaza código y test (`06-Referencias-Cruzadas/trazabilidad-nota-codigo-test.md`).
- `docs/` — 01–13 informes históricos (no se tocan); 14 en adelante, fases y QA.
- `AUDITORIA_INTEGRAL_POLYLIVE.md` — línea base histórica; no se reescribe.
- `_LevON/` — referencia Flutter, fuera del build.

## Scripts (en `app-bim-typescript/`)

| Comando | Qué hace |
|---|---|
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | `eslint src test` |
| `npx jest --ci` | tests, como en la CI |
| `EXPORT_SAMPLES=$PWD/artifacts npx jest --ci` y `python scripts/validate_exports.py artifacts` | valida IFC/DXF |
| `npx knip` | código muerto (control de regresión) |

Antes de cada commit: typecheck, lint y jest limpios (es lo que corre `.github/workflows/ci.yml`).

## Convenciones

- Español técnico en comentarios, commits y docs. Commits `feat|fix|docs|chore|refactor(ámbito): texto`.
- Capas: el dominio no importa de UI ni de `native`. Diseño y los 3 temas (claro, oscuro, alto
  contraste) salen de `src/ui/design`; sin paletas, fuentes ni componentes nuevos (Roboto).
- Refactors neutros (mismos tests en verde). Sin cambios de comportamiento o de modelo de datos sin acordarlo.
- Hallazgos de campo numerados `H-xx` (continúan en la matriz de `docs/25`).

## Flujo

Una rama por cambio y PR a `main`; nada directo en `main`. Sin push ni PR sin OK del dueño.
Borrar archivos del repo solo con OK explícito.

## Build local en Windows (APK `.qa`)

1. `cd app-bim-typescript && npx expo prebuild --platform android` (`android/` está ignorado y se regenera).
   Añadir `applicationIdSuffix ".qa"` en `buildTypes.release` de `android/app/build.gradle`:
   instala `com.polylivebim.qa` sin pisar la app real (`com.polylivebim`).
2. Entorno (Git Bash):
   ```bash
   export JAVA_HOME="/c/Program Files/Microsoft/jdk-21.0.12.101-hotspot"   # el JDK 25 falla (loopback)
   export JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:/jtmp            # Temp con espacios rompe Java
   export ANDROID_HOME=C:/asdk                                            # junction sin espacios (CMake/clang)
   ```
   y `sdk.dir=C:/asdk` en `android/local.properties`.
3. `cd android && ./gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a`
   → `android/app/build/outputs/apk/release/app-release.apk`.
4. Archivos bloqueados: `taskkill //F //IM java.exe`, repetir con `--no-parallel`, reintentar.
5. Tableta: `source scripts/qa/adb.sh`; mirar `adb shell wm size` antes de usar coordenadas;
   `pm clear` solo sobre `com.polylivebim.qa`. Si `adb devices` sale vacío: `kill-server` + `start-server`.
