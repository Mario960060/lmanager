import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    include: ['jspdf', 'jspdf-autotable']
  },
  build: {
    commonjsOptions: {
      include: [/jspdf/, /node_modules/]
    }
  }
});
