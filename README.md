# PolyLive

Monorepo de levantamientos BIM en campo. Contiene el motor activo en desarrollo
(`app-bim-typescript`), un proyecto de referencia (`_LevON`) cuya esencia de
motor 2D está guiando la refactorización actual, la bóveda de documentación
viva (`_0bsidian`) y los informes narrativos del experimento
Claude+Obsidian que originó el proyecto (`docs/`; las salidas originales en `docs/archivo/`).

## Estructura del repositorio

```
PolyLive/
├── app-bim-typescript/   ← código activo: React Native + Expo + TypeScript
├── _LevON/LevON/          ← referencia: proyecto Flutter/Dart (no se compila desde aquí)
├── _0bsidian/             ← bóveda Obsidian: fuente de verdad de la arquitectura de PolyLive
├── docs/                  ← informes del experimento (numerados 01–13)
├── docs/archivo/          ← salidas originales del experimento (histórico, no se edita)
└── setup-app-bim-vault.ps1
```

---

## `app-bim-typescript` — trabajar en cualquier PC

### 1. Requisitos

- **Git** y **Node.js 18 o superior** con npm (probado con Node 24 / npm 11).
- **Android:** el SDK de Android (basta con *platform-tools* para `adb`) y un
  teléfono con *Depuración USB* activada. En Windows, `adb` queda en
  `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`.
- **Cuenta de Expo** (solo para compilar APKs con EAS): `npm i -g eas-cli` y `eas login`.

### 2. Clonar e instalar

```bash
git clone https://github.com/opjose98/PolyLive.git
cd PolyLive/app-bim-typescript
npm ci
```

### 3. Verificar

```bash
npx tsc --noEmit
npx jest
```

Ambos deben terminar limpios antes de cualquier commit (`strict: true`).

### 4. Correr la app en el teléfono (Expo Dev Client)

La app usa módulos nativos (BLE, Skia, SQLite, impresión), así que **no corre en
Expo Go**: necesita su propio *dev client* instalado en el teléfono.

1. Compilar el dev client (una vez, o cuando cambien dependencias nativas):

   ```bash
   eas build --profile development --platform android
   ```

   Descargar el APK del enlace que da EAS e instalarlo:

   ```bash
   adb install -r polylive-dev.apk
   ```

   `-r` conserva los datos del teléfono. Para una versión sin Metro está el perfil
   `preview` (APK independiente).
2. Con el teléfono por USB, redirigir el puerto y arrancar Metro:

   ```bash
   adb reverse tcp:8081 tcp:8081
   ```

   ```bash
   npx expo start --dev-client --localhost
   ```

3. Abrir *PolyLive BIM* en el teléfono: se conecta a `localhost:8081` y carga el
   código. Los cambios se recargan solos al guardar.

### 5. Flujo de trabajo

- Una rama por cambio y PR a `main`; nada se publica directo en `main`.
- Documentar cada fase en `docs/` (numerados) y mantener la bóveda `_0bsidian/`.
- Al cambiar de PC: `git pull` en `main` y `npm ci` si cambió `package-lock.json`.

---

## `_LevON/LevON` — referencia (Flutter/Dart)

Este proyecto **no forma parte del build activo de PolyLive**. Se conserva
como referencia porque su motor 2D de levantamientos (trazado de muros,
elevación, selección) tiene la esencia que está guiando la refactorización
de `app-bim-typescript`. No se compila ni se despliega desde este monorepo.

Si se quiere levantar de todas formas (solo para inspeccionar su comportamiento):

Requisitos: Flutter SDK (canal stable), Dart incluido en el SDK de Flutter.

```bash
cd "_LevON/LevON"
flutter pub get
flutter run
```

Documentación propia del proyecto: `ARCHITECTURE.md`, `CONTEXT.md`,
`ROADMAP.md`, `RULES.md`, `CHANGELOG.md` dentro de esa carpeta.

Su historial de git original (6 commits) se conservó en
`_LevON/LevON/.git-backup-preflutter/` al integrarse a este monorepo — no es
un repositorio activo, solo respaldo.

---

## `_0bsidian` — bóveda de documentación

Abrir la carpeta `_0bsidian/` como vault en Obsidian. Punto de entrada:
`00-Introducción/MOC-PolyLive.md`. Cada nota declara sus dependencias como
wikilinks; es la fuente de verdad de la arquitectura y debe mantenerse
sincronizada con el código (ver `06-Referencias-Cruzadas/trazabilidad-nota-codigo-test.md`).

## `docs/`

Documentación numerada: del `01` al `13`, los informes del experimento que
originó el proyecto; del `14` en adelante, cada fase de la reconstrucción
(modos, topografía, avance, revisión, dibujo técnico) y las pruebas en teléfono
(`21-QA-TELEFONO.md`, `22-F6B-DIBUJO-Y-CONMUTADORES.md`). La auditoría técnica
integral está en `AUDITORIA_INTEGRAL_POLYLIVE.md`, en la raíz.

## Historial previo

`app-bim-typescript` tenía su propio repositorio local (2 commits, sin
remoto) antes de integrarse a este monorepo; se conservó en
`app-bim-typescript/.git-backup-preunification/` como respaldo, no como
repositorio activo.
