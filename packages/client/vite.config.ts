import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Allow overriding the server URL for remote development:
//   VITE_SERVER_URL=http://remote-pod:9741 npm run dev:client
const serverUrl = process.env.VITE_SERVER_URL || 'http://localhost:9741';
const wsTarget = serverUrl.replace(/^http/, 'ws');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@pi-deck/shared': path.resolve(__dirname, '../../node_modules/@pi-deck/shared/dist/index.js'),
    },
  },
  server: {
    port: 9740,
    host: true,
    proxy: {
      '/ws': {
        target: wsTarget,
        ws: true,
      },
    },
  },
});
