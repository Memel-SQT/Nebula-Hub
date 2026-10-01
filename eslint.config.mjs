import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'install/**', 'release/**', 'node_modules/**', 'coverage/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}', 'packages/*/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // R11: no shell. exec/execSync go through a shell; execFile/spawn with argument arrays do not.
      'no-restricted-imports': ['error', { paths: [{ name: 'child_process', importNames: ['exec', 'execSync'], message: 'Use execFile/spawn with an argument array (rule R11).' }, { name: 'node:child_process', importNames: ['exec', 'execSync'], message: 'Use execFile/spawn with an argument array (rule R11).' }] }],
    },
  },
);
