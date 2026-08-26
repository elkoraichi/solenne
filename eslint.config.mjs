import { FlatCompat } from '@eslint/eslintrc'

const compat = new FlatCompat({ baseDirectory: import.meta.dirname })

const configuration = [
  {
    ignores: [
      '.next/**',
      '.netlify/**',
      'node_modules/**',
      'src/generated/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Le code de ce projet est en français : les identifiants accentués sont
      // volontaires et ne doivent pas déclencher d'avertissement.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // Les scripts hors application (seed, outillage) parlent à la console.
    files: ['prisma/**/*.ts', 'tests/**/*.ts', 'tests/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]

export default configuration
