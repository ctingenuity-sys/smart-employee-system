import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
    define: {
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || ''),
      'process.env': process.env,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,json}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/cdn\.tailwindcss\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'tailwind-cache', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
            },
            {
              urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'icons-cache' }
            }
          ]
        },
        manifest: {
          name: "نظام الموظفين الذكي",
          short_name: "SmartStaff",
          description: "نظام إدارة الموظفين وتوليد أكواد الدخول",
          theme_color: "#1e293b",
          background_color: "#f1f5f9",
          display: "standalone",
          start_url: "/",
          icons: [
            {
              src: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
              sizes: "512x512",
              type: "image/png"
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve('./src'),
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
  };
});