import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  esbuild: {
    target: 'esnext'
  },
  server: {
    port: 5174
  },
  css: {
    modules: {
      localsConvention: 'camelCase'
    }
  },
  resolve: {
    alias: {
      '@fortawesome': path.resolve(__dirname, 'node_modules/@fortawesome')
    }
  },
  optimizeDeps: {
    include: ['@fortawesome/fontawesome-free']
  },
  assetsInclude: ['**/*.woff2']
});
