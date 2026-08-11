import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next ships legacy-format configs; FlatCompat translates them
// for ESLint 9's flat config.
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  // node_modules is ignored by ESLint 9 by default; these are the build outputs.
  {
    ignores: ['.next/**', 'out/**', 'build/**'],
  },
  ...compat.extends('next/core-web-vitals'),
];

export default eslintConfig;
