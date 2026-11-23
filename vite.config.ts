import { defineConfig } from 'vite';
import { NET_PORT } from './shared/constants';

export default defineConfig({
  build: { target: 'es2022' },
  esbuild: { target: 'es2022' },
  server: {
    port: 5173,
    proxy: {
      // Single origin for players on the LAN: the browser talks to /ws on the Vite port.
      '/ws': { target: `ws://localhost:${NET_PORT}`, ws: true },
    },
  },
});
