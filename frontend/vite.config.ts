import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/score': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/lending': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/verify': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/fee-info': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      '/balances': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});