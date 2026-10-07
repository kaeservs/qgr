import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The app imports its own modules as `@/lib/...`; Vitest needs the same alias.
export default defineConfig({
  resolve: {
    alias: { '@': dirname(fileURLToPath(import.meta.url)) },
  },
});
