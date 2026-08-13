import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// `base` matters for GitHub Pages project sites, where the app is served from
// /<repo>/ rather than the domain root. Override with BASE_PATH at build time.
// Normalised to always start and end with a slash, since the manifest scope
// and the service worker's navigation fallback are both built from it.
const base = `/${(process.env.BASE_PATH ?? '/').replace(/^\/|\/$/g, '')}/`.replace(
  '//',
  '/',
)

export default defineConfig({
  base,
  server: {
    // Bind to the LAN so the app can be opened on a phone on the same Wi-Fi
    host: true,
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Zero',
        short_name: 'Zero',
        description: 'Budget and expense tracking',
        lang: 'en',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#09090c',
        theme_color: '#09090c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Precache the whole app shell so a cold start never touches the network.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
