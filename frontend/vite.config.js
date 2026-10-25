import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// "base" is where the site lives on the web: "/" for a root site, "/radar/" for a project site.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  // Fixed port so the API's CORS setting always matches.
  server: { port: 5173, strictPort: true },
});
