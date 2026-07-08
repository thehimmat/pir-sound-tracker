import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Local dev has no Vercel functions; proxy read-only API calls to prod
    // so Today/History views work in `npm run dev`.
    proxy: {
      '/api': {
        target: 'https://pir-sound-tracker.vercel.app',
        changeOrigin: true,
      },
    },
  },
});
