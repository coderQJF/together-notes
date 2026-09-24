import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
const appVersion = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
export default defineConfig({define:{'import.meta.env.VITE_APP_VERSION':JSON.stringify(appVersion)},plugins:[uni()],server:{proxy:{'/api':{target:'http://127.0.0.1:8787',changeOrigin:true}}}});
