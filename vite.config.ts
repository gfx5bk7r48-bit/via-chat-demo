import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the project at /via-chat-demo/
export default defineConfig({
  base: '/via-chat-demo/',
  plugins: [react()],
});
