import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ plugins: [react(), tailwindcss()], server: { hmr: { port: 24678 }, fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**', '**/data/**', '**/server/**', '**/scripts/**', '**/tests/**', '**/.npm-cache/**', '**/*.sqlite*'] } } });
