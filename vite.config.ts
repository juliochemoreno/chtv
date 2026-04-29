import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
    // Split the bundle so the initial paint downloads less. React + the
    // router stay on the critical path; Motion, Embla and Lucide load in
    // parallel chunks the browser can cache and reuse across navigations.
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-motion': ['motion', 'motion/react'],
          'vendor-embla': ['embla-carousel-react'],
          'vendor-lucide': ['lucide-react'],
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src/client',
    },
  },
});
