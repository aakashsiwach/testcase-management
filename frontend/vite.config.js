import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// On Vercel the API URL is baked in at build time; fail fast instead of shipping a localhost URL.
if (process.env.VERCEL && !process.env.VITE_API_URL) {
  throw new Error('VITE_API_URL must be set in the Vercel project environment variables');
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: { manualChunks: { recharts: ['recharts'], react: ['react', 'react-dom', 'react-router-dom'] } },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.{js,jsx}'] },
});
