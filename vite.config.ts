import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  optimizeDeps: {
    include: ['imagetracerjs', 'opentype.js'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
