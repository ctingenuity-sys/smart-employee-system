import { defineConfig } from 'vite'; // تأكد من وجود هذا السطر ✅
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // التأكد من المسار الصحيح للـ Alias
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'firebase';
            if (id.includes('react')) return 'vendor';
            if (id.includes('@google/genai')) return 'genai';
            return 'libs'; 
          }
        }
      }
    }
  }
});