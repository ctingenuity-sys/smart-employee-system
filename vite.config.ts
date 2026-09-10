
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 3000,
    host: '0.0.0.0',
  },
  resolve: {
    alias: {
      '@': path.resolve('./src'),
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'sw-push-handler.js'],
      devOptions: {
        enabled: true,
        type: 'module'
      },
      workbox: {
        importScripts: ['/sw-push-handler.js'],
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
        id: '/',
        name: "نظام الموظفين الذكي",
        short_name: "نظام الموظفين",
        description: "نظام إدارة الموظفين والمناوبات والدردشة الفورية والمهام الطبية",
        theme_color: "#1e293b",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
});
