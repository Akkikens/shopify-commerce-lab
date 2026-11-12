import { reactRouter } from '@react-router/dev/vite';
import { oxygen } from '@shopify/mini-oxygen/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// MiniOxygen runs server.ts as an Oxygen (Workers) module in both `vite dev`
// and `vite preview`, so local behaviour matches the Oxygen runtime.
export default defineConfig({
  plugins: [oxygen(), reactRouter()],
  resolve: {
    alias: { '~': fileURLToPath(new URL('./app', import.meta.url)) },
  },
  build: {
    assetsInlineLimit: 0,
  },
  ssr: {
    optimizeDeps: {
      include: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/server',
        'react-router > set-cookie-parser',
        'react-router > cookie',
        'react-router',
      ],
    },
  },
});
