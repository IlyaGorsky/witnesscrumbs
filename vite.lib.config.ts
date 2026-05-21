import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'Witnesscrumbs',
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
      formats: ['es', 'cjs'],
    },
    rollupOptions: {
      external: (id) => /^react($|\/)|^react-dom($|\/)/.test(id),
    },
    sourcemap: true,
    emptyOutDir: true,
    outDir: 'dist',
  },
});
