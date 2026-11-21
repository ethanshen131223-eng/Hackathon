import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
const proxy = {'/api': {target: 'http://127.0.0.1:8765', changeOrigin: true}};
export default defineConfig({server: {proxy}, preview: {proxy}, build: {rollupOptions: {input: {
  home: fileURLToPath(new URL('./index.html', import.meta.url)),
  map: fileURLToPath(new URL('./map.html', import.meta.url)),
  globe: fileURLToPath(new URL('./globe.html', import.meta.url)),
}}}});
