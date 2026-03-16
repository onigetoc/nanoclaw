import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 8174,
    strictPort: false,
  },
  preview: {
    port: 8174,
    strictPort: false,
  },
  plugins: [
    react({
      babel: {
        plugins: [
          ['babel-plugin-react-compiler', {
            target: '19'
          }]
        ]
      }
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-512.png'],
      devOptions: {
        enabled: false  // Disabled in dev to prevent double-reload from SW activation
      },
      manifest: {
        name: 'EureClaw',
        short_name: 'EureClaw',
        description: 'Personal AI Assistant',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        display: 'standalone',
        start_url: '/',
        lang: 'en',
        scope: '/',  // CRITICAL: Limits SW to this origin only
        id: 'eureclaw-web-ui',  // Unique ID to prevent conflicts
        icons: [
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      manifestFilename: 'manifest.webmanifest',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // Never cache API calls — always go to network
        navigateFallbackDenylist: [/^\/api/, /^\/chats/, /^\/agents/, /^\/config/, /^\/monitoring/, /^\/sessions/, /^\/sse/],
        runtimeCaching: [],
        skipWaiting: true,
        clientsClaim: true,
      }
    })
  ]
})
