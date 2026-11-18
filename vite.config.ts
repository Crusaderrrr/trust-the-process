/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // User-site repo (Crusaderrrr.github.io) is served from the origin root.
  base: '/',
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'favicon.png'],
      manifest: {
        name: 'Trust The Process',
        short_name: 'TTP',
        description: 'Personal offline workout tracker',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Matches the logo's background so the splash screen has no seam.
        theme_color: '#0c0d12',
        background_color: '#0c0d12',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,jpg}'],
        // Web Push handler (public/push-sw.js): shows the rest timer's "Time's up" while the app is closed.
        importScripts: ['push-sw.js'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // SW scope is the whole origin; don't hijack navigations to other Pages repos.
        navigateFallbackAllowlist: [/^\/$/, /^\/index\.html$/],
      },
    }),
  ],
  // `npm run dev:server` listens here; same-origin cookies then work in dev too.
  server: { proxy: { '/api': 'http://localhost:3000' } },
  test: { include: ['src/**/*.test.ts', 'server/**/*.test.ts'] },
});
