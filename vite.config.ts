import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the mock demo at /via-chat-demo/.
// The self-hosted Chatwoot build is served at /via/ on the droplet:
//   VITE_BASE=/via/ VITE_BACKEND=chatwoot npm run build
export default defineConfig({
  base: process.env.VITE_BASE ?? '/via-chat-demo/',
  plugins: [react()],
});
