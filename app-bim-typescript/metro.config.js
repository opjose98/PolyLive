// =============================================================================
// metro.config.js — Configuración de Metro (bundler de React Native/Expo)
// =============================================================================
//
// Defensa en profundidad: bloquea explícitamente del bundle móvil los
// archivos que son intencionalmente Node-only (usan `fs`, `path` o el
// paquete `sqlite3`, ninguno disponible en Hermes/React Native). Sin este
// blockList, importar por accidente uno de estos archivos desde cualquier
// punto alcanzable por App.tsx (por ejemplo, re-exportarlo desde un barril
// como application/use-cases/index.ts — ver el comentario ahí) produce un
// error de Metro tipo "Unable to resolve module 'fs'" en el mejor caso, o
// en el peor, un error solo visible en tiempo de ejecución en el
// dispositivo. Con este blockList, cualquier intento de arrastrar estos
// archivos al bundle falla de inmediato con un mensaje claro apuntando a
// esta configuración, en vez de un error críptico de resolución de módulos.
//
// Los equivalentes correctos para dispositivo (que SÍ deben poder
// bundlearse) viven en src/native/ — ExpoSQLiteDatabase.ts (expo-sqlite) y
// ExpoBackupDatabaseUseCase.ts (expo-file-system) — y no están en esta lista.
// =============================================================================

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const NODE_ONLY_FILES = [
  /src[\\/]infrastructure[\\/]sqlite[\\/]database\.ts$/,
  /src[\\/]application[\\/]use-cases[\\/]BackupDatabaseUseCase\.ts$/,
  /src[\\/]application[\\/]use-cases[\\/]RestoreDatabaseUseCase\.ts$/,
];

config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  ...NODE_ONLY_FILES,
];

module.exports = config;
