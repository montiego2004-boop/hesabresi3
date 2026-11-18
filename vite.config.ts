import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/dexie/')) return 'local-database';
          if (
            /\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom)\//.test(id)
          )
            return 'react-runtime';
        },
      },
    },
  },
});
