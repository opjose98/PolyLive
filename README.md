# PolyLive

Monorepo de levantamientos BIM en campo. Contiene el motor activo en desarrollo
(`app-bim-typescript`), un proyecto de referencia (`_LevON`) cuya esencia de
motor 2D está guiando la refactorización actual, la bóveda de documentación
viva (`_0bsidian`) y los informes narrativos del experimento
Claude+Obsidian que originó el proyecto (`docs/`, `Claude outputs/`).

## Estructura del repositorio

```
PolyLive/
├── app-bim-typescript/   ← código activo: React Native + Expo + TypeScript
├── _LevON/LevON/          ← referencia: proyecto Flutter/Dart (no se compila desde aquí)
├── _0bsidian/             ← bóveda Obsidian: fuente de verdad de la arquitectura de PolyLive
├── docs/                  ← informes del experimento (numerados 01–13)
├── Claude outputs/        ← salidas originales del experimento, previas a docs/
└── setup-app-bim-vault.ps1
```

---

## `app-bim-typescript` — instalación y arranque

Requisitos: Node.js 18+, npm, y (para correr en dispositivo/emulador) el
CLI de Expo.

```bash
cd app-bim-typescript
npm install
```

**Compilar (chequeo de tipos, sin emitir):**

```bash
npm run build
```

**Correr los tests:**

```bash
npm test
```

**Arrancar el servidor de desarrollo Expo:**

```bash
npm start
```

**Compilar y correr en Android/iOS (requiere emulador o dispositivo conectado):**

```bash
npm run android
npm run ios
```

**Notas:**
- El proyecto usa Expo SDK 51 en modo managed. Si un módulo nativo lo
  requiere, hay que migrar a Expo Dev Client (`npx expo install expo-dev-client`).
- `tsconfig.json` está en modo `strict`. `npm run build` debe terminar sin
  errores antes de cualquier commit.
- La arquitectura tiene 5 capas con reglas de dependencia estrictas
  (Domain → Application → Infrastructure → Native → UI). Ver
  `_0bsidian/00-Introducción/MOC-PolyLive.md` antes de tocar código.

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

Informes narrativos del experimento que originó el proyecto, en orden:
del `01-EXPERIMENT-FINAL-REPORT.md` al `13-AUDITORIA-UNIFICACION.md` (el
más reciente, con el estado real verificado del código).

## Historial previo

`app-bim-typescript` tenía su propio repositorio local (2 commits, sin
remoto) antes de integrarse a este monorepo; se conservó en
`app-bim-typescript/.git-backup-preunification/` como respaldo, no como
repositorio activo.
