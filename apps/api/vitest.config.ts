import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@sred/shared': path.resolve(__dirname, '../../libs/shared/src/index.ts'),
    },
  },
});
