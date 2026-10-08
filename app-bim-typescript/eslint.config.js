// ESLint (flat config): reglas de Expo + TypeScript + reglas de hooks de React.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'node_modules/*', '.expo/*', 'android/*', 'ios/*'],
  },
  {
    rules: {
      // El registro va a shared/diagnostics; console solo en desarrollo.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Reglas del React Compiler (eslint-plugin-react-hooks 6+): la app no usa el compilador y
      // estos patrones son válidos sin él (capa viva por refs, setState tras leer la base).
      // Quedan como aviso para revisarlas al adoptar el compilador; rules-of-hooks sigue siendo error.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // En los tests, jest.mock y sus variables van antes de los imports (Jest los eleva).
    files: ['test/**/*.ts'],
    rules: { 'import/first': 'off' },
  },
]);
