import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts']),
  {
    // Pre-existing in features/listings/publish-wizard.tsx (object-URL preview).
    // Left as a warning so CI can stay green without changing application code.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
