
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { VitePWA } from 'vite-plugin-pwa';

const currentBuildTime = new Date().toISOString();

function versionPlugin() {
  return {
    name: 'version-generator',
    buildStart() {
      try {
        const payload = JSON.stringify({
          buildTime: currentBuildTime,
          timestamp: Date.now(),
          version: '1.2.0'
        }, null, 2);
        if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });
        fs.writeFileSync('public/version.json', payload);
      } catch (e) {}
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({
          buildTime: currentBuildTime,
          timestamp: Date.now(),
          version: '1.2.0'
        }, null, 2)
      });
    }
  };
}

export default defineConfig({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(currentBuildTime),
  },
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
    versionPlugin(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg', 'sw-push-handler.js'],
      devOptions: {
        enabled: true,
        type: 'module'
      },
      workbox: {
        importScripts: ['/sw-push-handler.js'],
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
        globIgnores: ['**/version.json'],
        navigateFallbackDenylist: [/^\/version\.json/],
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
            src: "/app-icon-3d.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/app-icon-3d.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/app-icon-3d.png",
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
