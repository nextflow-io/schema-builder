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
  assetsInclude: ['**/*.woff2'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // FontAwesome chunks
          if (id.includes('@fortawesome')) {
            return `vendor-fa-${id.split('@fortawesome/')[1].split('-svg-icons')[0]}`;
          }

          // Other vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('lit')) return 'vendor-lit';
            if (id.includes('marked') || id.includes('sanitize-html')) {
              return 'vendor-markdown';
            }
            if (id.includes('date-fns')) return 'vendor-date-fns';
            return 'vendor-other';
          }

          // App chunks
          if (id.includes('common/')) return 'common';
          if (id.includes('property-field')) return 'property-field';
          if (id.includes('schema-section')) return 'schema-section';
          if (id.includes('code-preview')) return 'code-preview';
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
});
