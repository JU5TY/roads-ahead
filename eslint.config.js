// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Jest's globals, in the tests only (npm test).
    files: ['**/__tests__/**/*.js'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', jest: 'readonly' },
    },
  },
  {
    rules: {
      // Installed, but the import resolver can't follow these packages' `exports` maps.
      'import/no-unresolved': [
        'error',
        { ignore: ['^expo-image$', '^expo-media-library$', '^country-flag-icons/'] },
      ],
    },
  },
]);
